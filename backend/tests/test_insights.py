"""Itemized expenses + analytics — end-to-end through DRF + ORM (needs DB)."""

import uuid

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.models import ExpenseItem, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


def _mk_user(name):
    return User.objects.create(name=name, locale="en").id


def _as(client, user_id):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(user_id)['access']}")
    return client


def _group(client, name, members):
    return client.post("/api/v1/groups", {"name": name, "type": "trip", "member_ids": members},
                       format="json").data["id"]


def _expense(client, payload):
    return client.post("/api/v1/expenses", payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))


# ── Itemization ───────────────────────────────────────────────────────────────

def test_itemized_expense_derives_shares_and_persists_items(client):
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    c = _mk_user("Chetan")
    _as(client, a)
    gid = _group(client, "Goa", [b, c])

    r = _expense(client, {
        "group_id": gid, "description": "Dinner", "amount_paise": 120000,
        "expense_date": "2026-07-06",
        "payers": [{"user_id": a, "paid_paise": 120000}],
        "split": {"type": "equal", "participants": [a, b, c]},  # replaced by items
        "items": [
            {"name": "Pizza", "amount_paise": 40000, "participant_ids": [a]},
            {"name": "Pasta", "amount_paise": 35000, "participant_ids": [b]},
            {"name": "Bread", "amount_paise": 15000, "participant_ids": [a, b, c]},
        ],
    })
    assert r.status_code == 201, r.data
    owed = {s["user_id"]: s["owed_paise"] for s in r.data["shares"]}
    # 40000+5000+tax, 35000+5000+tax, 5000+tax ; remainder 30000 split 3 ways.
    assert owed == {a: 55000, b: 50000, c: 15000}
    assert sum(owed.values()) == 120000
    assert len(r.data["items"]) == 3
    assert ExpenseItem.objects.filter(expense_id=r.data["id"]).count() == 3

    # Balances reconcile (payer Aarav is owed 65000).
    nets = {m["user_id"]: m["net_paise"] for m in client.get(f"/api/v1/groups/{gid}/balances").data["members"]}
    assert nets == {a: 65000, b: -50000, c: -15000}
    assert sum(nets.values()) == 0


def test_edit_to_plain_split_clears_items(client):
    a = _mk_user("A")
    b = _mk_user("B")
    _as(client, a)
    gid = _group(client, "Flat", [b])
    eid = _expense(client, {
        "group_id": gid, "description": "Bill", "amount_paise": 20000, "expense_date": "2026-07-01",
        "payers": [{"user_id": a, "paid_paise": 20000}],
        "split": {"type": "equal", "participants": [a, b]},
        "items": [{"name": "Thing", "amount_paise": 20000, "participant_ids": [a, b]}],
    }).data["id"]
    assert ExpenseItem.objects.filter(expense_id=eid).count() == 1

    r = client.patch(f"/api/v1/expenses/{eid}", {
        "group_id": gid, "description": "Bill", "amount_paise": 20000, "expense_date": "2026-07-01",
        "payers": [{"user_id": a, "paid_paise": 20000}],
        "split": {"type": "equal", "participants": [a, b]},
    }, format="json")
    assert r.status_code == 200, r.data
    assert r.data["items"] == []
    assert ExpenseItem.objects.filter(expense_id=eid).count() == 0


def test_item_participant_off_bill_rejected(client):
    a = _mk_user("A")
    b = _mk_user("B")
    _as(client, a)
    gid = _group(client, "Flat", [b])
    outsider = _mk_user("Z")  # exists but not a member
    r = _expense(client, {
        "group_id": gid, "description": "x", "amount_paise": 1000, "expense_date": "2026-07-01",
        "payers": [{"user_id": a, "paid_paise": 1000}],
        "split": {"type": "equal", "participants": [a, b]},
        "items": [{"name": "x", "amount_paise": 1000, "participant_ids": [a, outsider]}],
    })
    assert r.status_code == 422
    assert r.data["error"]["code"] == "NOT_GROUP_MEMBER"


# ── Analytics ─────────────────────────────────────────────────────────────────

def test_analytics_summary_breakdowns(client):
    a = _mk_user("Aarav")
    b = _mk_user("Bhavna")
    _as(client, a)
    gid = _group(client, "Home", [b])
    # Two categories, two months. Aarav's owed share is half of each.
    _expense(client, {
        "group_id": gid, "description": "Dinner at Toit", "amount_paise": 200000,
        "expense_date": "2026-06-10",
        "payers": [{"user_id": a, "paid_paise": 200000}],
        "split": {"type": "equal", "participants": [a, b]},
    })
    _expense(client, {
        "group_id": gid, "description": "Uber ride", "amount_paise": 100000,
        "expense_date": "2026-07-05",
        "payers": [{"user_id": b, "paid_paise": 100000}],
        "split": {"type": "equal", "participants": [a, b]},
    })

    r = client.get("/api/v1/analytics/summary?months=6")
    assert r.status_code == 200, r.data
    d = r.data
    assert d["totals"]["spent_paise"] == 150000  # 100000 + 50000 owed
    assert d["totals"]["paid_paise"] == 200000
    assert d["totals"]["expense_count"] == 2
    cats = {c["category"]: c["amount_paise"] for c in d["by_category"]}
    assert cats == {"Food": 100000, "Transport": 50000}
    months = {m["month"]: m["amount_paise"] for m in d["by_month"]}
    assert months["2026-06"] == 100000
    assert months["2026-07"] == 50000
    assert len(d["by_month"]) == 6


def test_analytics_group_scope_outsider_404(client):
    a = _mk_user("A")
    b = _mk_user("B")
    _as(client, b)
    _as(client, a)
    gid = _group(client, "Secret", [])
    _as(client, b)  # B is not a member
    r = client.get(f"/api/v1/analytics/summary?group_id={gid}")
    assert r.status_code == 404


# ── AI itemize endpoint (rules path, no network) ──────────────────────────────

def test_ai_itemize_text_rules(client, settings):
    settings.GEMINI_API_KEY = ""  # force deterministic parser
    a = _mk_user("A")
    _as(client, a)
    r = client.post("/api/v1/ai/itemize", {
        "text": "Paneer tikka 250\n2 x Naan 120\nGST 40\nTotal 410",
    }, format="json")
    assert r.status_code == 200, r.data
    names = [i["name"] for i in r.data["items"]]
    assert "Paneer tikka" in names
    assert "Naan" in names  # "2 x Naan" → qty 2, name Naan
    assert all("GST" not in n for n in names)  # tax excluded from items
    assert r.data["source"] == "rules"


def test_ai_itemize_requires_input(client):
    a = _mk_user("A")
    _as(client, a)
    r = client.post("/api/v1/ai/itemize", {}, format="json")
    assert r.status_code == 400  # bad_request envelope, like /ai/parse
