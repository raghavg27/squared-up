"""AI features (PRD §5.4). NL entry returns a DRAFT only — never writes to a
balance until the user confirms (hard rule §9.2). Manual form always works
offline.

``parse_expense`` is the entry point: Gemini (``ai_llm.py``) when
``GEMINI_API_KEY`` is set, with this file's deterministic rules parser as the
always-available offline fallback. Both emit the same draft contract:

    description, amount_paise, category, payer_name, i_paid,
    participant_names, split_type, exact_amounts_paise, mentioned_names,
    confidence, source ("llm" | "rules")

Names in payer_name/participant_names are always canonical entries from the
caller-supplied member list — never free text — so the client can map them to
user ids safely.
"""

import re

from .ai_llm import _match_member, parse_with_llm
from .categories import categorize  # noqa: F401 — re-export; services + migration 0007 import it from here

_MARKED_AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)\s*(\d+(?:\.\d{1,2})?)(k?)\b", re.I)
_AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)(k?)\b", re.I)
_PER_PERSON_RE = re.compile(r"\b(each|per\s+(?:person|head)|har\s+ek)\b", re.I)
_PARTY_SIZE_RE = re.compile(r"\b(\d+)\s*(?:of\s+us|people|log|logo?n|ways?|friends)\b", re.I)
# "main/mai" alone collide with English ("main course"); require the verb form.
_I_PAID_RE = re.compile(r"\b(i\s+paid|i\s+pay|i'?ve\s+paid|i'?ll\s+pay|paid\s+by\s+me|maine|mera|mai(?:n)?\s+ne)\b", re.I)
# "paid by X" is checked before "X paid" — otherwise "groceries paid by priya"
# reads "groceries" as the payer.
_PAID_BY_RE = re.compile(r"\bpaid\s+by\s+([A-Za-z]+)\b", re.I)
_NAMED_PAYER_RE = re.compile(r"\b([A-Za-z]+)\s+(?:paid|ne\s+diy[ae])\b", re.I)
_NAME_RE = re.compile(r"\b[A-Z][a-z]+\b")
_FILLER_RE = re.compile(
    r"\b(i\s+paid|paid\s+by|paid|split\s+between|split\s+with|split|between|ke\s+saath|baaki|maine|mera|ka|ke|with|and|me|each|of\s+us|only)\b",
    re.I,
)
_STOP_NAMES = {"I", "Rs", "INR", "Split", "Paid", "Me", "Only"}


def _rupee_value(match: re.Match) -> float:
    return float(match.group(1)) * (1000 if match.group(2) else 1)


def _find_amount(text: str) -> tuple[int | None, re.Match | None]:
    """Total in paise. Currency-marked number wins; otherwise the largest bare
    number, so "split 3 ways 900" reads 900, not 3."""
    match = _MARKED_AMOUNT_RE.search(text)
    if not match:
        match = max(_AMOUNT_RE.finditer(text), key=_rupee_value, default=None)
    if not match:
        return None, None
    return round(_rupee_value(match) * 100), match


def _find_participants(text: str, member_names: list[str]) -> list[str]:
    """Case-insensitive scan for member first/full names — 'rahul' matches
    member 'Rahul Sharma'."""
    found = []
    lowered = text.lower()
    for member in member_names:
        first = member.strip().lower().split()[0]
        if re.search(rf"\b{re.escape(first)}\b", lowered) and member not in found:
            found.append(member)
    return found


def parse_natural_language(
    text: str, member_names: list[str] | None = None, self_name: str = ""
) -> dict:
    """Deterministic offline parser for code-mixed Hindi/English, e.g.
    "dinner 1800, I paid, split with Rahul and Priya",
    "chai ke 200 rahul ke saath", "auto 150 mera, baaki Priya ka".
    Draft only — always confirmed by the user before any write.
    """
    members = member_names or []
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # "1,800" → "1800"
    amount_paise, amount_match = _find_amount(text)

    if amount_paise is not None and _PER_PERSON_RE.search(text):
        size = _PARTY_SIZE_RE.search(text)
        count = int(size.group(1)) if size else len(members)
        if count >= 1:
            amount_paise *= count

    named = _PAID_BY_RE.search(text) or _NAMED_PAYER_RE.search(text)
    payer_name = _match_member(named.group(1), members) if named else None
    i_paid = payer_name is None and (
        bool(_I_PAID_RE.search(text))
        or (bool(re.search(r"\bpaid\b", text, re.I)) and not named)
    )
    if i_paid and self_name:
        payer_name = self_name

    if members:
        participants = _find_participants(text, members)
        mentioned = participants
        # "split with Rahul" implies the speaker shares too.
        self_member = _match_member(self_name, members) if self_name else None
        if participants and self_member and self_member not in participants:
            participants = [self_member] + participants
    else:
        participants = []
        mentioned = [
            n for i, n in enumerate(_NAME_RE.findall(text))
            if n not in _STOP_NAMES and n not in _NAME_RE.findall(text)[:i]
            # Leading capitalized word is usually the item ("Dinner 500 …"), not a name.
            and not text.startswith(n)
        ]

    description = text
    if amount_match:
        description = text[: amount_match.start()] + text[amount_match.end():]
    for n in mentioned:
        description = re.sub(rf"\b{re.escape(n.split()[0])}\b", "", description, flags=re.I)
    description = _FILLER_RE.sub("", description)
    description = re.sub(r"[₹,.]", " ", description)
    description = re.sub(r"\s+", " ", description).strip() or "Expense"

    return {
        "description": description[:80],
        "amount_paise": amount_paise,
        "category": categorize(text),
        "payer_name": payer_name,
        "i_paid": bool(i_paid or (payer_name and payer_name == self_name)),
        "participant_names": participants,
        "split_type": "equal",
        "exact_amounts_paise": None,
        "mentioned_names": mentioned,
        "confidence": 0.9 if amount_paise is not None else 0.4,
        "source": "rules",
    }


def parse_expense(text: str, member_names: list[str] | None = None, self_name: str = "") -> dict:
    """LLM parse when configured, deterministic rules otherwise. Same contract
    either way; ``source`` says which engine answered."""
    draft = parse_with_llm(text, member_names or [], self_name)
    if draft is not None:
        return draft
    return parse_natural_language(text, member_names, self_name)
