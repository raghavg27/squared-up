"""Membership side-effects (core.membership_service):

- adding a member with ``include_history`` folds them into past *equal-split*
  expenses only (exact / itemized allocations stay untouched);
- group co-members become friends automatically (create + add-member + the
  0010 backfill semantics);
- ``personal`` tracker groups are solo: no other members at create, no
  add-member later, rotation forced off.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.models import Friendship, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


def _mk_user(name):
    return User.objects.create(name=name, locale="en").id


def _as(client, user_id):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user_id)['access']}")
    return client


def _add_expense(client, gid, amount, payers, split, description="x"):
    r = client.post(
        "/api/v1/expenses",
        {
            "group_id": gid, "description": description, "amount_paise": amount,
            "expense_date": "2026-07-01", "payers": payers, "split": split,
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert r.status_code == 201, r.data
    return r.data["id"]


def _are_friends(a: int, b: int) -> bool:
    lo, hi = sorted((a, b))
    return Friendship.objects.filter(user_low_id=lo, user_high_id=hi).exists()


# ── include_history ──────────────────────────────────────────────────────────

def test_add_member_with_history_resplits_equal_expenses(client):
    a, b, c = _mk_user("Aarav"), _mk_user("Bhavna"), _mk_user("Chetan")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json").data["id"]

    # Equal split (re-split candidate) + deliberate exact split (must survive).
    _add_expense(client, gid, 30000, [{"user_id": a, "paid_paise": 30000}],
                 {"type": "equal", "participants": [a, b]}, "groceries")
    exact_id = _add_expense(client, gid, 30000, [{"user_id": a, "paid_paise": 30000}],
                            {"type": "exact", "participants": [a, b], "amounts_paise": {str(a): 10000, str(b): 20000}},
                            "uneven")

    r = client.post(f"/api/v1/groups/{gid}/members", {"user_id": c, "include_history": True}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["history_included"] == 1

    nets = {m["user_id"]: m["net_paise"] for m in client.get(f"/api/v1/groups/{gid}/balances").data["members"]}
    # groceries re-split over a,b,c (10000 each); uneven untouched (a 10000 / b 20000).
    # a paid 60000, owes 20000 → +40000; b owes 30000; c owes 10000.
    assert nets == {a: 40000, b: -30000, c: -10000}
    assert sum(nets.values()) == 0

    exact = client.get(f"/api/v1/expenses/{exact_id}").data
    assert {s["user_id"]: s["owed_paise"] for s in exact["shares"]} == {a: 10000, b: 20000}


def test_add_member_without_history_changes_nothing(client):
    a, b, c = _mk_user("A"), _mk_user("B"), _mk_user("C")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json").data["id"]
    _add_expense(client, gid, 20000, [{"user_id": a, "paid_paise": 20000}],
                 {"type": "equal", "participants": [a, b]})

    r = client.post(f"/api/v1/groups/{gid}/members", {"user_id": c}, format="json")
    assert r.status_code == 201
    assert r.data["history_included"] == 0
    nets = {m["user_id"]: m["net_paise"] for m in client.get(f"/api/v1/groups/{gid}/balances").data["members"]}
    assert nets == {a: 10000, b: -10000, c: 0}


def test_include_history_skips_itemized(client):
    a, b, c = _mk_user("A"), _mk_user("B"), _mk_user("C")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Trip", "type": "trip", "member_ids": [b]}, format="json").data["id"]
    r = client.post(
        "/api/v1/expenses",
        {
            "group_id": gid, "description": "dinner bill", "amount_paise": 20000,
            "expense_date": "2026-07-01", "payers": [{"user_id": a, "paid_paise": 20000}],
            "split": {"type": "equal", "participants": [a, b]},
            "items": [
                {"name": "Thali", "amount_paise": 10000, "participant_ids": [a]},
                {"name": "Biryani", "amount_paise": 10000, "participant_ids": [b]},
            ],
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert r.status_code == 201, r.data

    r = client.post(f"/api/v1/groups/{gid}/members", {"user_id": c, "include_history": True}, format="json")
    assert r.status_code == 201
    assert r.data["history_included"] == 0  # receipt lines own that split


def test_member_added_activity_carries_history_count(client):
    a, b, c = _mk_user("A"), _mk_user("B"), _mk_user("C")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json").data["id"]
    _add_expense(client, gid, 10000, [{"user_id": a, "paid_paise": 10000}],
                 {"type": "equal", "participants": [a, b]})
    client.post(f"/api/v1/groups/{gid}/members", {"user_id": c, "include_history": True}, format="json")

    events = client.get("/api/v1/activity").data
    added = next(e for e in events if e["type"] == "group.member_added")
    assert added["payload"]["user_id"] == c
    assert added["payload"]["history_included"] == 1


# ── auto-friends ─────────────────────────────────────────────────────────────

def test_group_creation_befriends_all_members(client):
    a, b, c = _mk_user("A"), _mk_user("B"), _mk_user("C")
    _as(client, a)
    client.post("/api/v1/groups", {"name": "Trip", "type": "trip", "member_ids": [b, c]}, format="json")
    assert _are_friends(a, b) and _are_friends(a, c) and _are_friends(b, c)


def test_added_member_befriends_existing_members(client):
    a, b, c = _mk_user("A"), _mk_user("B"), _mk_user("C")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json").data["id"]
    assert not _are_friends(a, c)
    client.post(f"/api/v1/groups/{gid}/members", {"user_id": c}, format="json")
    assert _are_friends(a, c) and _are_friends(b, c)
    # And the friends endpoint reflects it for the actor.
    ids = {u["id"] for u in client.get("/api/v1/friends").data}
    assert {b, c} <= ids


def test_unfriend_sticks_until_new_shared_membership(client):
    a, b = _mk_user("A"), _mk_user("B")
    _as(client, a)
    client.post("/api/v1/groups", {"name": "Flat", "type": "home", "member_ids": [b]}, format="json")
    assert _are_friends(a, b)
    client.delete(f"/api/v1/friends/{b}")
    assert not _are_friends(a, b)  # no read-time resurrection


# ── personal tracker ─────────────────────────────────────────────────────────

def test_personal_tracker_is_solo(client):
    a, b = _mk_user("A"), _mk_user("B")
    _as(client, a)
    r = client.post("/api/v1/groups", {"name": "My spends", "type": "personal", "member_ids": [b]}, format="json")
    assert r.status_code == 422
    assert r.data["error"]["code"] == "VALIDATION_ERROR"

    r = client.post("/api/v1/groups", {"name": "My spends", "type": "personal", "rotation_enabled": True}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["members"] == [a]
    assert r.data["rotation_enabled"] is False  # forced off for solo tracking

    r2 = client.post(f"/api/v1/groups/{r.data['id']}/members", {"user_id": b}, format="json")
    assert r2.status_code == 422
    assert r2.data["error"]["code"] == "VALIDATION_ERROR"


def test_personal_tracker_expense_flow(client):
    a = _mk_user("A")
    _as(client, a)
    gid = client.post("/api/v1/groups", {"name": "My spends", "type": "personal"}, format="json").data["id"]
    _add_expense(client, gid, 12345, [{"user_id": a, "paid_paise": 12345}],
                 {"type": "equal", "participants": [a]}, "coffee")
    nets = {m["user_id"]: m["net_paise"] for m in client.get(f"/api/v1/groups/{gid}/balances").data["members"]}
    assert nets == {a: 0}  # paid yourself — always squared up
