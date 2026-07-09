"""End-to-end API smoke tests through DRF + the ORM. Requires a database.

Auth: endpoints require a Bearer token. Tests create User rows directly and mint
a token via ``core.auth.issue_tokens`` so the acting user is explicit.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


def _mk_user(name, vpa=None):
    return User.objects.create(name=name, upi_vpa=vpa, locale="en").id


def _as(client, user_id):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user_id)['access']}")
    return client


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.data["status"] == "ok"


def test_auth_required(client):
    r = client.get("/api/v1/groups")
    assert r.status_code == 401
    assert r.data["error"]["code"] == "UNAUTHORIZED"


def test_otp_login_flow(client):
    r = client.post("/api/v1/auth/request-otp", {"phone": "9998887777"}, format="json")
    assert r.status_code == 200
    code = r.data["dev_code"]
    r = client.post("/api/v1/auth/verify-otp", {"phone": "9998887777", "code": code}, format="json")
    assert r.status_code == 200
    assert r.data["is_new"] is True
    assert r.data["access"] and r.data["refresh"]

    c2 = APIClient()
    c2.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    me = c2.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.data["phone"] == "+919998887777"


def test_wrong_otp_rejected(client):
    client.post("/api/v1/auth/request-otp", {"phone": "9998880000"}, format="json")
    r = client.post("/api/v1/auth/verify-otp", {"phone": "9998880000", "code": "111111"}, format="json")
    assert r.status_code == 400
    assert r.data["error"]["code"] == "INVALID_OTP"


def test_expense_flow_and_balances(client):
    a = _mk_user("Aarav", "aarav@okhdfc")
    b = _mk_user("Bhavna")
    c = _mk_user("Chetan")
    _as(client, a)  # Aarav is the acting user

    r = client.post(
        "/api/v1/groups",
        {"name": "Trip", "type": "trip", "member_ids": [b, c]},
        format="json",
    )
    assert r.status_code == 201
    gid = r.data["id"]
    assert sorted(r.data["members"]) == sorted([a, b, c])

    key = str(uuid.uuid4())
    payload = {
        "group_id": gid,
        "description": "Dinner",
        "amount_paise": 180000,
        "expense_date": "2026-06-20",
        "payers": [{"user_id": a, "paid_paise": 180000}],
        "split": {"type": "equal", "participants": [a, b, c]},
    }
    r = client.post("/api/v1/expenses", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r.status_code == 201, r.data

    r2 = client.post("/api/v1/expenses", payload, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert r2.status_code == 200
    assert r2.data["id"] == r.data["id"]

    r = client.get(f"/api/v1/groups/{gid}/balances")
    assert r.status_code == 200
    nets = {m["user_id"]: m["net_paise"] for m in r.data["members"]}
    assert nets == {a: 120000, b: -60000, c: -60000}
    assert sum(nets.values()) == 0


def test_edit_expense_recomputes(client):
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json").data["id"]
    r = client.post(
        "/api/v1/expenses",
        {
            "group_id": gid, "description": "x", "amount_paise": 20000, "expense_date": "2026-06-20",
            "payers": [{"user_id": a, "paid_paise": 20000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    eid = r.data["id"]
    r = client.patch(
        f"/api/v1/expenses/{eid}",
        {
            "group_id": gid, "description": "x edited", "amount_paise": 30000, "expense_date": "2026-06-20",
            "payers": [{"user_id": a, "paid_paise": 30000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json",
    )
    assert r.status_code == 200, r.data
    assert r.data["amount_paise"] == 30000
    nets = {m["user_id"]: m["net_paise"] for m in client.get(f"/api/v1/groups/{gid}/balances").data["members"]}
    assert nets == {a: 15000, b: -15000}


def test_missing_idempotency_key_is_400(client):
    a = _mk_user("Aarav")
    _as(client, a)
    r = client.post(
        "/api/v1/expenses",
        {
            "description": "x", "amount_paise": 100, "expense_date": "2026-06-20",
            "payers": [{"user_id": a, "paid_paise": 100}],
            "split": {"type": "equal", "participants": [a]},
        },
        format="json",
    )
    assert r.status_code == 400
    assert r.data["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_payers_mismatch_is_422(client):
    a = _mk_user("Aarav")
    _as(client, a)
    r = client.post(
        "/api/v1/expenses",
        {
            "description": "x", "amount_paise": 100, "expense_date": "2026-06-20",
            "payers": [{"user_id": a, "paid_paise": 99}],
            "split": {"type": "equal", "participants": [a]},
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert r.status_code == 422
    assert r.data["error"]["code"] == "PAYERS_SUM_MISMATCH"


def test_turn_to_pay(client):
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    c = _mk_user("Chetan")
    _as(client, a)
    r = client.post(
        "/api/v1/groups",
        {"name": "Flat", "type": "home", "member_ids": [b, c], "rotation_enabled": True, "rotation_mode": "balanced"},
        format="json",
    )
    gid = r.data["id"]
    r = client.get(f"/api/v1/groups/{gid}/turn")
    assert r.status_code == 200
    assert r.data["next_payer"]["user_id"] == a


def test_add_and_remove_member(client):
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "G", "type": "other"}, format="json").data["id"]
    r = client.post(f"/api/v1/groups/{gid}/members", {"user_id": b}, format="json")
    assert r.status_code == 201
    assert b in r.data["members"]
    # No balance → removable.
    r = client.delete(f"/api/v1/groups/{gid}/members/{b}")
    assert r.status_code == 200
    assert b not in r.data["members"]


def test_personal_expense_and_balances(client):
    """Non-group (personal) expense: A pays 300 split with B, then A settles."""
    a, b = _mk_user("Aarav"), _mk_user("Bhavna", vpa="bhavna@upi")
    _as(client, a)
    key = str(uuid.uuid4())
    r = client.post(
        "/api/v1/expenses",
        {
            "group_id": None,
            "description": "Movie",
            "amount_paise": 30000,
            "created_by": a,
            "payers": [{"user_id": a, "paid_paise": 30000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert r.status_code == 201, r.data

    # A's view: B owes A 150.
    pa = client.get("/api/v1/balances/personal").data
    assert pa["counterparties"] == [{"user_id": b, "net_paise": 15000}]

    # B's view: B owes A 150 (negative).
    _as(client, b)
    pb = client.get("/api/v1/balances/personal").data
    assert pb["counterparties"] == [{"user_id": a, "net_paise": -15000}]

    # B settles up personally (manual, confirmed) → both squared.
    skey = str(uuid.uuid4())
    s = client.post(
        "/api/v1/settlements",
        {"group_id": None, "from_user": b, "to_user": a, "amount_paise": 15000, "method": "manual"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=skey,
    ).data
    client.patch(f"/api/v1/settlements/{s['id']}/confirm")

    assert client.get("/api/v1/balances/personal").data["counterparties"] == []
    _as(client, a)
    assert client.get("/api/v1/balances/personal").data["counterparties"] == []


def test_personal_expenses_listed_and_editable(client):
    """A creates a non-group split with B. Both can list it via /expenses/personal,
    it shows in B's activity feed (B is a participant, not the actor), and it's
    editable like a group expense."""
    a, b = _mk_user("Aarav"), _mk_user("Bhavna")
    _as(client, a)
    r = client.post(
        "/api/v1/expenses",
        {
            "group_id": None,
            "description": "Dinner",
            "amount_paise": 40000,
            "created_by": a,
            "payers": [{"user_id": a, "paid_paise": 40000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert r.status_code == 201, r.data
    eid = r.data["id"]

    # A lists their personal expenses.
    la = client.get("/api/v1/expenses/personal").data
    assert [e["id"] for e in la] == [eid]
    assert la[0]["group_id"] is None

    # B — a participant but NOT the creator — sees it too, both in the list and
    # in the activity feed (the pre-fix bug: non-actor participants were missing).
    _as(client, b)
    lb = client.get("/api/v1/expenses/personal").data
    assert [e["id"] for e in lb] == [eid]

    feed = client.get("/api/v1/activity").data
    assert any(ev["type"] == "expense.created" and ev["target"] == f"expense:{eid}" for ev in feed)

    # ?with= scopes to a single counterparty.
    scoped = client.get(f"/api/v1/expenses/personal?with={a}").data
    assert [e["id"] for e in scoped] == [eid]

    # Editable like a group expense: the creator edits amount, shares recompute.
    _as(client, a)
    up = client.patch(
        f"/api/v1/expenses/{eid}",
        {
            "group_id": None,
            "description": "Dinner + dessert",
            "amount_paise": 60000,
            "created_by": a,
            "payers": [{"user_id": a, "paid_paise": 60000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json",
    )
    assert up.status_code == 200, up.data
    assert up.data["amount_paise"] == 60000
    assert client.get("/api/v1/balances/personal").data["counterparties"] == [{"user_id": b, "net_paise": 30000}]


def test_archive_and_restore_group(client):
    """Owner archives a group (soft delete): it drops off the active list, stays
    viewable read-only, blocks new expenses, and restores back to active."""
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    _as(client, a)  # Aarav creates → he is the owner
    gid = client.post("/api/v1/groups", {"name": "Goa Trip", "type": "trip", "member_ids": [b]}, format="json").data["id"]

    # Archive (DELETE) → group carries archived_at and leaves the active list.
    r = client.delete(f"/api/v1/groups/{gid}")
    assert r.status_code == 200, r.data
    assert r.data["archived_at"] is not None
    assert client.get("/api/v1/groups").data == []
    assert [g["id"] for g in client.get("/api/v1/groups?archived=1").data] == [gid]

    # Still viewable read-only, but no new expenses may be added.
    assert client.get(f"/api/v1/groups/{gid}").data["id"] == gid
    add = client.post(
        "/api/v1/expenses",
        {
            "group_id": gid,
            "description": "Late add",
            "amount_paise": 10000,
            "created_by": a,
            "payers": [{"user_id": a, "paid_paise": 10000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert add.status_code == 404, add.data

    # Restore → active again.
    r = client.post(f"/api/v1/groups/{gid}/restore")
    assert r.status_code == 200, r.data
    assert r.data["archived_at"] is None
    assert [g["id"] for g in client.get("/api/v1/groups").data] == [gid]


def test_archive_group_owner_only(client):
    """A non-owner member cannot archive; an outsider gets 404 (id probing)."""
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    c = _mk_user("Chetan")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json").data["id"]

    _as(client, b)  # member, not owner → 403
    assert client.delete(f"/api/v1/groups/{gid}").status_code == 403

    _as(client, c)  # outsider → 404
    assert client.delete(f"/api/v1/groups/{gid}").status_code == 404

    # Still active (nobody with rights archived it).
    _as(client, a)
    assert [g["id"] for g in client.get("/api/v1/groups").data] == [gid]
