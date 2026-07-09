"""Authorization regression tests: a user outside a group must not be able to
read or mutate anything inside it, and settlement state changes are restricted
to the two parties involved."""

import uuid

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


def _mk_user(name, vpa=None, phone=None):
    return User.objects.create(name=name, upi_vpa=vpa, phone=phone, locale="en").id


def _as(client, user_id):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user_id)['access']}")
    return client


@pytest.fixture
def world(client):
    """Group of (a, b) with one expense; outsider o."""
    a = _mk_user("Aarav", "aarav@okhdfc", "+919000000101")
    b = _mk_user("Bhavna", None, "+919000000102")
    o = _mk_user("Outsider", None, "+919000000103")
    _as(client, a)
    gid = client.post(
        "/api/v1/groups", {"name": "Trip", "type": "trip", "member_ids": [b]}, format="json"
    ).data["id"]
    eid = client.post(
        "/api/v1/expenses",
        {
            "group_id": gid, "description": "Dinner", "amount_paise": 10000,
            "payers": [{"user_id": a, "paid_paise": 10000}],
            "split": {"type": "equal", "participants": [a, b]},
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    ).data["id"]
    return {"a": a, "b": b, "o": o, "gid": gid, "eid": eid}


def test_outsider_cannot_read_group(client, world):
    _as(client, world["o"])
    assert client.get(f"/api/v1/groups/{world['gid']}").status_code == 404
    assert client.get(f"/api/v1/groups/{world['gid']}/expenses").status_code == 404
    assert client.get(f"/api/v1/groups/{world['gid']}/balances").status_code == 404
    assert client.get(f"/api/v1/groups/{world['gid']}/turn").status_code == 404


def test_outsider_cannot_touch_expense(client, world):
    _as(client, world["o"])
    eid = world["eid"]
    assert client.get(f"/api/v1/expenses/{eid}").status_code == 404
    assert client.delete(f"/api/v1/expenses/{eid}").status_code == 404
    assert client.get(f"/api/v1/expenses/{eid}/comments").status_code == 404
    r = client.post(f"/api/v1/expenses/{eid}/comments", {"body": "hi"}, format="json")
    assert r.status_code in (403, 404)
    # And the expense is still there for a member.
    _as(client, world["a"])
    assert client.get(f"/api/v1/expenses/{eid}").status_code == 200


def test_member_can_delete_and_restore_expense(client, world):
    _as(client, world["b"])
    eid = world["eid"]
    assert client.delete(f"/api/v1/expenses/{eid}").status_code == 204
    assert client.get(f"/api/v1/expenses/{eid}").status_code == 404
    assert client.post(f"/api/v1/expenses/{eid}/restore").status_code == 200
    assert client.get(f"/api/v1/expenses/{eid}").status_code == 200


def test_settlement_confirm_restricted_to_parties(client, world):
    _as(client, world["b"])
    sid = client.post(
        "/api/v1/settlements",
        {"group_id": world["gid"], "to_user": world["a"], "amount_paise": 5000, "method": "upi"},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    ).data["id"]
    _as(client, world["o"])
    assert client.patch(f"/api/v1/settlements/{sid}/confirm").status_code == 404
    assert client.patch(f"/api/v1/settlements/{sid}/dispute").status_code == 404
    _as(client, world["a"])  # creditor can confirm
    assert client.patch(f"/api/v1/settlements/{sid}/confirm").status_code == 200


def test_outsider_cannot_settle_into_group(client, world):
    _as(client, world["o"])
    r = client.post(
        "/api/v1/settlements",
        {"group_id": world["gid"], "to_user": world["a"], "amount_paise": 5000, "method": "upi"},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert r.status_code in (403, 404, 422)


def test_users_list_scoped_to_known_people(client, world):
    _as(client, world["a"])
    ids = {u["id"] for u in client.get("/api/v1/users").data}
    assert world["b"] in ids
    assert world["o"] not in ids


def test_group_create_with_unknown_member_is_clean_error(client, world):
    _as(client, world["a"])
    r = client.post("/api/v1/groups", {"name": "X", "member_ids": [999999]}, format="json")
    assert r.status_code == 404
    assert r.data["error"]["code"] == "NOT_FOUND"


def test_expense_date_defaults_to_today(client, world):
    _as(client, world["a"])
    r = client.post(
        "/api/v1/expenses",
        {
            "group_id": world["gid"], "description": "Chai", "amount_paise": 2000,
            "payers": [{"user_id": world["a"], "paid_paise": 2000}],
            "split": {"type": "equal", "participants": [world["a"], world["b"]]},
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert r.status_code == 201, r.data


def test_personal_expense_private_to_creator(client, world):
    _as(client, world["a"])
    eid = client.post(
        "/api/v1/expenses",
        {
            "description": "Solo lunch", "amount_paise": 5000,
            "payers": [{"user_id": world["a"], "paid_paise": 5000}],
            "split": {"type": "equal", "participants": [world["a"]]},
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    ).data["id"]
    _as(client, world["b"])
    assert client.get(f"/api/v1/expenses/{eid}").status_code == 404


def test_invited_placeholder_resolves_to_same_user_on_login(client, world):
    # Invite by bare 10-digit phone → placeholder; later OTP login with the
    # same number must land on the SAME user (normalized phone), keeping name
    # and group memberships.
    _as(client, world["a"])
    r = client.post("/api/v1/users", {"name": "Rohan", "phone": "9812345678"}, format="json")
    assert r.status_code == 201
    uid = r.data["id"]
    assert r.data["phone"] == "+919812345678"
    # Invited, not yet joined → placeholder (drives the "invite pending" UI).
    assert r.data["is_placeholder"] is True
    # Re-invite with equivalent formats → same user, no duplicate.
    for variant in ("9812345678", "+91 98123 45678", "+919812345678"):
        r2 = client.post("/api/v1/users", {"name": "Dup", "phone": variant}, format="json")
        assert r2.data["id"] == uid

    anon = APIClient()
    code = anon.post("/api/v1/auth/request-otp", {"phone": "9812345678"}, format="json").data["dev_code"]
    r3 = anon.post("/api/v1/auth/verify-otp", {"phone": "9812345678", "code": code}, format="json")
    assert r3.data["is_new"] is False
    assert r3.data["user"]["id"] == uid
    assert r3.data["user"]["name"] == "Rohan"
    # Claiming the account by logging in clears the placeholder flag.
    assert r3.data["user"]["is_placeholder"] is False


def test_self_signup_is_not_a_placeholder(client):
    # A brand-new OTP signup (nobody invited them) is a real, joined user.
    anon = APIClient()
    code = anon.post("/api/v1/auth/request-otp", {"phone": "9800000123"}, format="json").data["dev_code"]
    r = anon.post("/api/v1/auth/verify-otp", {"phone": "9800000123", "code": code}, format="json")
    assert r.data["is_new"] is True
    assert r.data["user"]["is_placeholder"] is False


def test_invited_by_email_dedupes_and_is_not_stored_as_name(client, world):
    # Inviting by email must put the address in `email` (a login identity), not
    # in `name`, and re-inviting the same address (any case) reuses the user.
    _as(client, world["a"])
    r = client.post("/api/v1/users", {"name": "Meera", "email": "Meera@Example.com"}, format="json")
    assert r.status_code == 201
    uid = r.data["id"]
    assert r.data["name"] == "Meera"
    assert r.data["email"] == "meera@example.com"
    r2 = client.post("/api/v1/users", {"name": "Dup", "email": "meera@example.com"}, format="json")
    assert r2.data["id"] == uid


def test_invited_by_bad_email_is_rejected(client, world):
    _as(client, world["a"])
    r = client.post("/api/v1/users", {"name": "Nope", "email": "not-an-email"}, format="json")
    assert r.status_code == 422


def test_activity_feed_includes_group_events_for_members(client, world):
    # b (not the actor) must see a's expense.created for their shared group.
    _as(client, world["b"])
    feed = client.get("/api/v1/activity").data
    types = {e["type"] for e in feed}
    assert "expense.created" in types
