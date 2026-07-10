"""Canonical categories: keyword rules, client-label normalization, and the
create/edit API round-trip that keeps analytics labels clean."""

import uuid

import pytest
from rest_framework.test import APIClient

from core.auth import issue_tokens
from core.categories import CATEGORIES, categorize, normalize_category
from core.models import User


# ── pure rules (no DB) ────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("apple laptop", "Shopping"),          # the original miscategorization
    ("iphone from croma", "Shopping"),
    ("dinner at toit", "Food"),
    ("swiggy order", "Food"),
    ("uber to office", "Transport"),
    ("metro card recharge", "Transport"),  # transport beats utilities' "recharge"
    ("flight to goa", "Travel"),
    ("oyo hotel", "Travel"),
    ("monthly rent", "Rent"),
    ("blinkit vegetables", "Groceries"),
    ("electricity bill", "Utilities"),
    ("phone bill", "Utilities"),           # utilities beats shopping's "phone"
    ("medicines from apollo", "Health"),
    ("gym membership", "Health"),
    ("bookmyshow tickets", "Entertainment"),
    ("mystery box", "Other"),
])
def test_categorize_keywords(text, expected):
    assert categorize(text) == expected


def test_categorize_always_canonical():
    for text in ("apple laptop", "chai", "uber", "xyz"):
        assert categorize(text) in CATEGORIES


@pytest.mark.parametrize("raw,expected", [
    ("Food", "Food"),
    ("food", "Food"),
    ("Food & Dining", "Food"),             # legacy frontend label
    ("food and dining", "Food"),
    ("Transportation", "Transport"),
    ("housing", "Rent"),
    ("Medical", "Health"),
    ("uncategorized", "Other"),
    ("Bribes", None),                      # unknown → caller auto-categorizes
    ("", None),
    (None, None),
])
def test_normalize_category(raw, expected):
    assert normalize_category(raw) == expected


# ── API round-trip (needs DB) ─────────────────────────────────────────────────

pytestmark = pytest.mark.django_db


def _client() -> tuple[APIClient, int]:
    uid = User.objects.create(name="Aarav", locale="en").id
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(uid)['access']}")
    return c, uid


def _expense(client: APIClient, uid: int, **overrides) -> dict:
    payload = {
        "group_id": None, "description": "apple laptop", "amount_paise": 500000,
        "expense_date": "2026-07-01",
        "payers": [{"user_id": uid, "paid_paise": 500000}],
        "split": {"type": "equal", "participants": [uid]},
        **overrides,
    }
    r = client.post("/api/v1/expenses", payload, format="json",
                    HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert r.status_code == 201, r.data
    return r.data


def test_create_auto_categorizes_when_omitted():
    c, uid = _client()
    assert _expense(c, uid)["category"] == "Shopping"


def test_create_accepts_user_category_and_normalizes_alias():
    c, uid = _client()
    # User overrides the guess — their pick wins verbatim.
    assert _expense(c, uid, category="Health")["category"] == "Health"
    # A legacy/alias label lands on the canonical name, not free text.
    assert _expense(c, uid, category="Food & Dining")["category"] == "Food"


def test_create_garbage_category_falls_back_to_auto():
    c, uid = _client()
    assert _expense(c, uid, category="Bribes")["category"] == "Shopping"


def test_edit_can_fix_category():
    c, uid = _client()
    eid = _expense(c, uid)["id"]
    r = c.patch(f"/api/v1/expenses/{eid}", {
        "group_id": None, "description": "apple laptop", "amount_paise": 500000,
        "expense_date": "2026-07-01", "category": "Other",
        "payers": [{"user_id": uid, "paid_paise": 500000}],
        "split": {"type": "equal", "participants": [uid]},
    }, format="json")
    assert r.status_code == 200, r.data
    assert r.data["category"] == "Other"
    # The fixed label is what analytics aggregates on.
    a = c.get("/api/v1/analytics/summary?months=1")
    assert {x["category"] for x in a.data["by_category"]} >= {"Other"}
