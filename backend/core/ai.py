"""AI features (PRD §5.4). NL entry returns a DRAFT only — never writes to a
balance until the user confirms (hard rule §9.2). Manual form always works
offline. This is a deterministic rules parser handling code-mixed Hindi/English;
if an OPENAI/ANTHROPIC key were set it could be swapped for an LLM call
returning the same JSON shape — kept rules-only so the demo runs with zero
external dependencies and zero cost.
"""

import re

CATEGORY_RULES = [
    (re.compile(r"\b(dinner|lunch|breakfast|food|restaurant|chai|coffee|cafe|khana|biryani|pizza|swiggy|zomato)\b", re.I), "Food"),
    (re.compile(r"\b(auto|uber|ola|cab|taxi|metro|bus|train|flight|petrol|fuel|travel|trip|rapido)\b", re.I), "Travel"),
    (re.compile(r"\b(rent|kiraya|maintenance)\b", re.I), "Rent"),
    (re.compile(r"\b(grocery|groceries|sabzi|vegetables|bigbasket|blinkit|zepto|milk|dudh)\b", re.I), "Groceries"),
    (re.compile(r"\b(movie|cinema|netflix|game|concert|party|entertainment)\b", re.I), "Entertainment"),
    (re.compile(r"\b(electricity|water|wifi|internet|gas|bill|recharge)\b", re.I), "Utilities"),
]

_MARKED_AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)\s*(\d+(?:\.\d{1,2})?)", re.I)
_AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)", re.I)
_I_PAID_RE = re.compile(r"\b(i paid|i pay|i'?ve paid|i'?ll pay|paid by me|mera|maine|mai|main)\b", re.I)
_OTHER_PAID_RE = re.compile(r"\b[A-Z][a-z]+ paid\b")
_NAME_RE = re.compile(r"\b[A-Z][a-z]+\b")
_FILLER_RE = re.compile(r"\b(i paid|split with|ke saath|baaki|mera|ka|ke|with|and)\b", re.I)
_STOP_NAMES = {"I", "Rs", "INR", "Split", "Paid"}


def categorize(description: str) -> str:
    """Silent auto-categorization (PRD §5.4). Rules first; default 'Other'."""
    for regex, cat in CATEGORY_RULES:
        if regex.search(description):
            return cat
    return "Other"


def parse_natural_language(text: str) -> dict:
    """Parse free text into an expense DRAFT (PRD §5.4). Handles code-mixed
    input, e.g. "dinner 1800, I paid, split with Rahul and Priya",
    "chai ke 200 Rahul ke saath", "auto 150 mera, baaki Priya ka".
    Always shown for confirmation before any write.
    """
    # Prefer a currency-marked number ("₹450", "rs 450"); otherwise take the
    # largest bare number so "split 3 ways 900" reads 900, not 3.
    amount_match = _MARKED_AMOUNT_RE.search(text)
    if not amount_match:
        candidates = list(_AMOUNT_RE.finditer(text))
        amount_match = max(candidates, key=lambda m: float(m.group(1)), default=None)
    rupees = float(amount_match.group(1)) if amount_match else None
    amount_paise = round(rupees * 100) if rupees is not None else None

    # "paid ..." with no other payer named counts as the speaker paying.
    i_paid = bool(_I_PAID_RE.search(text)) or (
        bool(re.search(r"\bpaid\b", text, re.I)) and not _OTHER_PAID_RE.search(text)
    )

    seen = []
    for n in _NAME_RE.findall(text):
        if n not in _STOP_NAMES and n not in seen:
            seen.append(n)
    names = seen

    description = _AMOUNT_RE.sub("", text, count=1)
    description = _FILLER_RE.sub("", description)
    description = re.sub(r"[,.]", " ", description)
    description = re.sub(r"\s+", " ", description).strip() or "Expense"

    return {
        "description": description,
        "amount_paise": amount_paise,
        "category": categorize(text),
        "mentioned_names": names,
        "i_paid": i_paid,
        "split_type": "equal",
        "confidence": 0.9 if amount_paise is not None else 0.4,
    }
