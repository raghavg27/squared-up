"""Gemini-backed NL expense parsing (PRD §5.4). Produces the same DRAFT shape
as the rules parser in ``ai.py`` — never writes anything; the user always
confirms in the form. Any failure (no key, network, bad JSON) returns ``None``
so the caller falls back to the offline rules parser.

Anti-hallucination stance: the model may only name people from the provided
member list (enforced again server-side), and all money math — per-head
multiplication, rupee→paise, exact-share reconciliation — is done here in
integer paise, never trusted from the model.
"""

import json
import logging
import time
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

from .categories import CATEGORIES  # noqa: E402 — canonical list shared with rules + validator

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_TIMEOUT_SECONDS = 12

# Gemini structured-output schema: rupee amounts stay numbers here; conversion
# to paise happens server-side so a model slip can never corrupt money math.
_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "description": {"type": "STRING"},
        "amount_rupees": {"type": "NUMBER", "nullable": True},
        "amount_is_per_person": {"type": "BOOLEAN"},
        "party_size": {"type": "INTEGER", "nullable": True},
        "payer": {"type": "STRING", "nullable": True},
        "participants": {"type": "ARRAY", "items": {"type": "STRING"}},
        "split_type": {"type": "STRING", "enum": ["equal", "exact"]},
        "exact_shares": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "amount_rupees": {"type": "NUMBER"},
                },
                "required": ["name", "amount_rupees"],
            },
        },
        "category": {"type": "STRING", "enum": CATEGORIES},
        "confidence": {"type": "NUMBER"},
    },
    "required": [
        "description",
        "amount_is_per_person",
        "participants",
        "split_type",
        "exact_shares",
        "category",
        "confidence",
    ],
}

_PROMPT = """You extract an expense draft from one short message typed into a bill-splitting app used in India. Messages are English, Hindi, or code-mixed Hinglish (e.g. "chai ke 200 Rahul ke saath", "auto 150 mera, baaki Priya ka").

Group members: {members}
The person typing is: {self_name}

Message: {text}

Extraction rules:
- description: a short expense title, e.g. "Dinner", "Auto to airport", "Movie tickets". Never include amounts or member names unless they are part of the item itself.
- amount_rupees: the total money amount in rupees, or the per-person amount when the message prices per head. null when the message has no amount. Ignore counts of people/items ("3 of us", "2 pizzas" is still one amount).
- amount_is_per_person: true only when the message prices per head ("500 each", "per person 300", "har ek ke 200").
- party_size: the number of people when the message states it ("3 of us", "4 log the"), else null.
- payer: who paid, copied EXACTLY from the members list. "I paid / maine diya / mera / mai dunga" means the typer ({self_name}) paid. null when the message does not say who paid.
- participants: everyone the expense is split among, each copied EXACTLY from the members list, including the typer when they are part of the split ("split with Rahul" implies the typer + Rahul). Empty list when the message does not limit the split — the whole group is assumed.
- split_type: "exact" only when specific amounts are tied to specific people ("Rahul owes 300", "mera 200 uska 400"), else "equal".
- exact_shares: when split_type is "exact", one entry per participant with their rupee share; shares must add up to the total. Empty list otherwise.
- category: best fit from the allowed list, else "Other".
- confidence: 0 to 1, your overall certainty.
- NEVER invent a name. If the message names someone not in the members list, leave them out of payer/participants entirely.
"""


def _match_member(candidate: str, member_names: list[str]) -> str | None:
    """Resolve a model-emitted name to a canonical member name. Exact
    (case-insensitive) first, then unique first-name match; ambiguity or no
    match returns None — never guess."""
    cand = candidate.strip().lower()
    if not cand:
        return None
    for m in member_names:
        if m.strip().lower() == cand:
            return m
    first_matches = [m for m in member_names if m.strip().lower().split()[0] == cand]
    if len(first_matches) == 1:
        return first_matches[0]
    return None


def _to_paise(rupees: object) -> int | None:
    try:
        value = Decimal(str(rupees))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if value <= 0 or value > Decimal("10000000"):
        return None
    return int((value * 100).quantize(Decimal("1")))


def _resolve_amount(raw: dict, participant_count: int, group_size: int) -> tuple[int | None, bool]:
    """Total in paise. Per-head amounts multiply by the best-known head count;
    returns (amount_paise, count_was_known) so callers can lower confidence
    when a per-head amount could not be scaled."""
    per = _to_paise(raw.get("amount_rupees"))
    if per is None:
        return None, True
    if not raw.get("amount_is_per_person"):
        return per, True
    party = raw.get("party_size")
    count = party if isinstance(party, int) and party >= 1 else (participant_count or group_size)
    if count >= 1:
        return per * count, True
    return per, False


def _normalize(raw: dict, member_names: list[str], self_name: str) -> dict:
    """Turn a schema-shaped Gemini reply into the draft contract, enforcing
    member-list matching and balanced exact shares."""
    participants: list[str] = []
    for n in raw.get("participants") or []:
        m = _match_member(str(n), member_names)
        if m and m not in participants:
            participants.append(m)

    payer = raw.get("payer")
    payer_name = _match_member(str(payer), member_names) if payer else None

    amount_paise, count_known = _resolve_amount(raw, len(participants), len(member_names))

    split_type = "equal"
    exact_amounts: dict[str, int] | None = None
    if raw.get("split_type") == "exact":
        shares: dict[str, int] = {}
        valid = True
        for item in raw.get("exact_shares") or []:
            m = _match_member(str(item.get("name", "")), member_names)
            p = _to_paise(item.get("amount_rupees"))
            if m is None or p is None or m in shares:
                valid = False
                break
            shares[m] = p
        if valid and shares:
            total = sum(shares.values())
            if amount_paise is None:
                amount_paise = total
            elif total < amount_paise and payer_name and payer_name not in shares:
                # "I paid 900, Rahul owes 300" — the unstated remainder is the payer's.
                shares[payer_name] = amount_paise - total
                total = amount_paise
            if total == amount_paise:
                split_type = "exact"
                exact_amounts = shares
                participants = [p for p in participants if p in shares] + [
                    s for s in shares if s not in participants
                ]

    try:
        confidence = min(max(float(raw.get("confidence", 0.5)), 0.0), 1.0)
    except (TypeError, ValueError):
        confidence = 0.5
    if not count_known:
        confidence = min(confidence, 0.4)

    description = str(raw.get("description") or "").strip() or "Expense"
    category = raw.get("category") if raw.get("category") in CATEGORIES else "Other"

    return {
        "description": description[:80],
        "amount_paise": amount_paise,
        "category": category,
        "payer_name": payer_name,
        "i_paid": payer_name is not None and payer_name == self_name,
        "participant_names": participants,
        "split_type": split_type,
        "exact_amounts_paise": exact_amounts,
        "mentioned_names": participants,
        "confidence": confidence,
        "source": "llm",
    }


def parse_with_llm(text: str, member_names: list[str], self_name: str) -> dict | None:
    """One Gemini call → normalized draft, or None to trigger the rules
    fallback. Deliberately never raises."""
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        return None
    prompt = _PROMPT.format(
        members=json.dumps(member_names, ensure_ascii=False),
        self_name=self_name or "the user",
        text=json.dumps(text, ensure_ascii=False),
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    url = _GEMINI_URL.format(model=getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash"))
    try:
        resp = requests.post(url, json=body, headers={"X-goog-api-key": api_key},
                             timeout=_TIMEOUT_SECONDS)
        # Free-tier quotas throttle in bursts; one short retry rescues most of them.
        if resp.status_code in (429, 503):
            time.sleep(2)
            resp = requests.post(url, json=body, headers={"X-goog-api-key": api_key},
                                 timeout=_TIMEOUT_SECONDS)
        resp.raise_for_status()
        raw = json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])
        if not isinstance(raw, dict):
            return None
        return _normalize(raw, member_names, self_name)
    except Exception:  # noqa: BLE001 — any failure means "use the rules parser"
        logger.warning("Gemini parse failed; falling back to rules", exc_info=True)
        return None
