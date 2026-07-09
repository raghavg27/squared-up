"""NL expense parsing: Gemini normalization (mocked — no network), the
deterministic rules fallback, and the /ai/parse endpoint contract. Live LLM
behaviour is exercised separately by the stress script; these tests must be
deterministic."""

import json
from unittest import mock

import pytest
from rest_framework.test import APIClient

from core.ai import parse_expense, parse_natural_language, categorize
from core.ai_llm import _match_member, _normalize, parse_with_llm
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


def test_categorize_default():
    assert categorize("weird unknown thing") == "Other"
    assert categorize("uber to airport") == "Travel"


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
                    "mentioned_names", "confidence", "source"):
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
