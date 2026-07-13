"""NL expense parsing: Gemini normalization (mocked — no network), the
deterministic rules fallback, and the /ai/parse endpoint contract. Live LLM
behaviour is exercised separately by the stress script; these tests must be
deterministic."""

import json
from datetime import date, timedelta
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.ai import parse_expense, parse_natural_language, categorize
from core.ai_llm import _match_member, _normalize, _valid_date, parse_with_llm
from core.auth import issue_tokens
from core.models import User

MEMBERS = ["Raghav Gupta", "Rahul Sharma", "Priya Patel"]
ME = "Raghav Gupta"


def _raw(**overrides) -> dict:
    """A well-formed Gemini reply; tests override fields to probe edge cases."""
    base = {
        "description": "Dinner",
        "amount_rupees": 1800,
        "amount_is_per_person": False,
        "party_size": None,
        "payer": "Raghav Gupta",
        "participants": ["Raghav Gupta", "Rahul Sharma", "Priya Patel"],
        "split_type": "equal",
        "exact_shares": [],
        "category": "Food",
        "confidence": 0.95,
    }
    base.update(overrides)
    return base


# ── name matching ──

def test_match_exact_case_insensitive():
    assert _match_member("rahul sharma", MEMBERS) == "Rahul Sharma"


def test_match_first_name():
    assert _match_member("priya", MEMBERS) == "Priya Patel"


def test_match_ambiguous_first_name_refuses():
    assert _match_member("rahul", ["Rahul Sharma", "Rahul Verma"]) is None


def test_match_unknown_name_refuses():
    assert _match_member("Amit", MEMBERS) is None


# ── LLM reply normalization (server-side money math + anti-hallucination) ──

def test_normalize_basic_draft():
    d = _normalize(_raw(), MEMBERS, ME)
    assert d["amount_paise"] == 180000
    assert d["payer_name"] == ME and d["i_paid"] is True
    assert d["participant_names"] == MEMBERS
    assert d["split_type"] == "equal" and d["source"] == "llm"


def test_normalize_per_person_with_party_size():
    d = _normalize(_raw(amount_rupees=500, amount_is_per_person=True, party_size=3), MEMBERS, ME)
    assert d["amount_paise"] == 150000


def test_normalize_per_person_uses_participant_count():
    d = _normalize(
        _raw(amount_rupees=500, amount_is_per_person=True,
             participants=["Raghav Gupta", "Rahul Sharma"]),
        MEMBERS, ME,
    )
    assert d["amount_paise"] == 100000


def test_normalize_per_person_falls_back_to_group_size():
    d = _normalize(_raw(amount_rupees=200, amount_is_per_person=True, participants=[]), MEMBERS, ME)
    assert d["amount_paise"] == 20000 * 3


def test_normalize_per_person_unknown_count_lowers_confidence():
    d = _normalize(_raw(amount_rupees=500, amount_is_per_person=True, participants=[]), [], ME)
    assert d["amount_paise"] == 50000 and d["confidence"] <= 0.4


def test_normalize_drops_invented_names():
    d = _normalize(_raw(payer="Amitabh", participants=["Rahul Sharma", "Ghost Person"]), MEMBERS, ME)
    assert d["payer_name"] is None and d["i_paid"] is False
    assert d["participant_names"] == ["Rahul Sharma"]


def test_normalize_named_payer_not_me():
    d = _normalize(_raw(payer="rahul sharma"), MEMBERS, ME)
    assert d["payer_name"] == "Rahul Sharma" and d["i_paid"] is False


def test_normalize_exact_shares_balanced():
    d = _normalize(
        _raw(split_type="exact",
             exact_shares=[{"name": "Raghav Gupta", "amount_rupees": 600},
                           {"name": "Rahul Sharma", "amount_rupees": 1200}]),
        MEMBERS, ME,
    )
    assert d["split_type"] == "exact"
    assert d["exact_amounts_paise"] == {"Raghav Gupta": 60000, "Rahul Sharma": 120000}


def test_normalize_exact_payer_gets_unstated_remainder():
    # "I paid 900, Rahul owes 300" — model may omit the payer's own share.
    d = _normalize(
        _raw(amount_rupees=900, payer="Raghav Gupta", split_type="exact",
             exact_shares=[{"name": "Rahul Sharma", "amount_rupees": 300}]),
        MEMBERS, ME,
    )
    assert d["exact_amounts_paise"] == {"Rahul Sharma": 30000, "Raghav Gupta": 60000}
    assert d["split_type"] == "exact"


def test_normalize_exact_unbalanced_downgrades_to_equal():
    d = _normalize(
        _raw(amount_rupees=900, payer=None, split_type="exact",
             exact_shares=[{"name": "Rahul Sharma", "amount_rupees": 100}]),
        MEMBERS, ME,
    )
    assert d["split_type"] == "equal" and d["exact_amounts_paise"] is None


def test_normalize_exact_shares_define_missing_total():
    d = _normalize(
        _raw(amount_rupees=None, split_type="exact",
             exact_shares=[{"name": "Raghav Gupta", "amount_rupees": 200},
                           {"name": "Priya Patel", "amount_rupees": 400}]),
        MEMBERS, ME,
    )
    assert d["amount_paise"] == 60000 and d["split_type"] == "exact"


def test_normalize_rejects_absurd_amounts():
    assert _normalize(_raw(amount_rupees=-50), MEMBERS, ME)["amount_paise"] is None
    assert _normalize(_raw(amount_rupees=99999999999), MEMBERS, ME)["amount_paise"] is None


def test_normalize_defends_against_garbage_fields():
    d = _normalize(
        _raw(description="", category="Bribes", confidence="high", amount_rupees="12.5"),
        MEMBERS, ME,
    )
    assert d["description"] == "Expense" and d["category"] == "Other"
    assert d["amount_paise"] == 1250 and d["confidence"] == 0.5


# ── parse_with_llm plumbing ──

def _gemini_http_reply(raw: dict):
    reply = mock.Mock()
    reply.json.return_value = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(raw)}]}}]
    }
    reply.raise_for_status.return_value = None
    return reply


def test_llm_disabled_without_key(settings):
    settings.GEMINI_API_KEY = ""
    assert parse_with_llm("dinner 500", MEMBERS, ME) is None


def test_llm_success_normalizes(settings):
    settings.GEMINI_API_KEY = "test-key"
    with mock.patch("core.ai_llm.requests.post", return_value=_gemini_http_reply(_raw())) as post:
        d = parse_with_llm("dinner 1800", MEMBERS, ME)
    assert d is not None and d["amount_paise"] == 180000 and d["source"] == "llm"
    assert post.call_args.kwargs["timeout"] > 0


def test_llm_http_error_returns_none(settings):
    settings.GEMINI_API_KEY = "test-key"
    with mock.patch("core.ai_llm.requests.post", side_effect=OSError("boom")):
        assert parse_with_llm("dinner 1800", MEMBERS, ME) is None


def test_llm_garbage_json_returns_none(settings):
    settings.GEMINI_API_KEY = "test-key"
    reply = mock.Mock()
    reply.raise_for_status.return_value = None
    reply.json.return_value = {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}
    with mock.patch("core.ai_llm.requests.post", return_value=reply):
        assert parse_with_llm("dinner 1800", MEMBERS, ME) is None


def test_parse_expense_falls_back_to_rules(settings):
    settings.GEMINI_API_KEY = ""
    d = parse_expense("dinner 1800, I paid, split with rahul and priya", MEMBERS, ME)
    assert d["source"] == "rules" and d["amount_paise"] == 180000


# ── rules parser (offline fallback) ──

def test_rules_classic_phrase():
    d = parse_natural_language("dinner 1800, I paid, split with Rahul and Priya", MEMBERS, ME)
    assert d["amount_paise"] == 180000
    assert d["i_paid"] is True and d["payer_name"] == ME
    assert d["participant_names"] == [ME, "Rahul Sharma", "Priya Patel"]
    assert d["category"] == "Food"


def test_rules_lowercase_named_payer_is_not_me():
    d = parse_natural_language("rahul paid 500 for auto", MEMBERS, ME)
    assert d["payer_name"] == "Rahul Sharma" and d["i_paid"] is False


def test_rules_paid_by_name():
    d = parse_natural_language("450 groceries paid by priya", MEMBERS, ME)
    assert d["payer_name"] == "Priya Patel" and d["i_paid"] is False
    assert d["category"] == "Groceries"


def test_rules_comma_amount():
    assert parse_natural_language("flights 1,800 I paid", MEMBERS, ME)["amount_paise"] == 180000


def test_rules_k_suffix():
    assert parse_natural_language("rent 15k", MEMBERS, ME)["amount_paise"] == 1500000


def test_rules_largest_number_wins():
    assert parse_natural_language("split 3 ways 900", MEMBERS, ME)["amount_paise"] == 90000


def test_rules_per_person_with_count():
    assert parse_natural_language("chai 200 each for 3 of us", MEMBERS, ME)["amount_paise"] == 60000


def test_rules_hinglish():
    d = parse_natural_language("chai ke 200 rahul ke saath", MEMBERS, ME)
    assert d["amount_paise"] == 20000
    assert d["participant_names"] == [ME, "Rahul Sharma"]
    assert d["category"] == "Food"


def test_rules_no_amount_low_confidence():
    d = parse_natural_language("dinner with priya", MEMBERS, ME)
    assert d["amount_paise"] is None and d["confidence"] < 0.5


# ── rules date extraction ──

def test_rules_date_day_month_year():
    # The reported bug: date + description + amount all survive the same message.
    d = parse_natural_language("Gifts for everyone: 5000 on 10 January 2024, paid by me", MEMBERS, ME)
    assert d["expense_date"] == "2024-01-10"
    assert d["amount_paise"] == 500000
    assert d["i_paid"] is True
    assert "10" not in d["description"] and "january" not in d["description"].lower()
    assert d["description"].strip().lower().startswith("gifts for everyone")


def test_rules_date_month_day():
    assert parse_natural_language("lunch 300 on Jun 5 2023", MEMBERS, ME)["expense_date"] == "2023-06-05"


def test_rules_date_numeric_ddmm():
    # India convention: DD/MM.
    assert parse_natural_language("auto 150 on 03/06/2022", MEMBERS, ME)["expense_date"] == "2022-06-03"


def test_rules_date_relative_yesterday():
    yday = (timezone.localdate() - timedelta(days=1)).isoformat()
    assert parse_natural_language("coffee 80 yesterday", MEMBERS, ME)["expense_date"] == yday


def test_rules_date_yearless_rolls_back_when_future():
    today = timezone.localdate()
    future = today + timedelta(days=40)
    d = parse_natural_language(f"party 1000 on {future.day} {future.strftime('%B')}", MEMBERS, ME)
    assert date.fromisoformat(d["expense_date"]) <= today


def test_rules_date_absent_is_none():
    assert parse_natural_language("dinner 500 I paid", MEMBERS, ME)["expense_date"] is None


def test_rules_date_not_confused_by_small_amount():
    # "12" is the amount, "15 May" is the date — the date must not steal it.
    d = parse_natural_language("coffee 12 on 15 May 2024", MEMBERS, ME)
    assert d["amount_paise"] == 1200 and d["expense_date"] == "2024-05-15"


# ── LLM date validation ──

def test_valid_date_accepts_past():
    assert _valid_date("2024-01-10", date(2026, 7, 13)) == "2024-01-10"


def test_valid_date_rejects_future():
    assert _valid_date("2030-01-01", date(2026, 7, 13)) is None


def test_valid_date_rejects_garbage():
    assert _valid_date("not-a-date", date(2026, 7, 13)) is None
    assert _valid_date(None, date(2026, 7, 13)) is None


def test_normalize_passes_valid_date():
    d = _normalize(_raw(expense_date="2024-01-10"), MEMBERS, ME, date(2026, 7, 13))
    assert d["expense_date"] == "2024-01-10"


def test_normalize_drops_future_date():
    d = _normalize(_raw(expense_date="2099-01-01"), MEMBERS, ME, date(2026, 7, 13))
    assert d["expense_date"] is None


def test_categorize_default():
    assert categorize("weird unknown thing") == "Other"
    assert categorize("uber to airport") == "Transport"


# ── endpoint contract ──

pytestmark_db = pytest.mark.django_db


@pytest.mark.django_db
class TestEndpoint:
    def _client(self) -> APIClient:
        uid = User.objects.create(name="Raghav Gupta", phone="+919777000901").id
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens(uid)['access']}")
        return c

    def test_parse_endpoint_contract(self, settings):
        settings.GEMINI_API_KEY = ""  # deterministic rules path
        r = self._client().post(
            "/api/v1/ai/parse",
            {"text": "dinner 1800, I paid, split with rahul", "member_names": MEMBERS},
            format="json",
        )
        assert r.status_code == 200
        for key in ("description", "amount_paise", "category", "payer_name", "i_paid",
                    "participant_names", "split_type", "exact_amounts_paise",
                    "mentioned_names", "expense_date", "confidence", "source"):
            assert key in r.data
        assert r.data["amount_paise"] == 180000
        assert r.data["payer_name"] == "Raghav Gupta"

    def test_parse_endpoint_rejects_bad_input(self):
        c = self._client()
        assert c.post("/api/v1/ai/parse", {"text": "   "}, format="json").status_code == 400
        assert c.post("/api/v1/ai/parse", {"text": "x" * 501}, format="json").status_code == 400
        assert c.post("/api/v1/ai/parse", {"text": "ok", "member_names": "Rahul"},
                      format="json").status_code == 400

    def test_parse_endpoint_requires_auth(self):
        assert APIClient().post("/api/v1/ai/parse", {"text": "chai 20"},
                                format="json").status_code in (401, 403)
