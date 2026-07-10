"""Canonical expense categories — the single source of truth for every
categorizer (rules + Gemini enums), the API validator, and analytics.

The set is deliberately small (Splitwise-style): common spend buckets that
cover most real expenses, with "Other" as the honest fallback. The frontend
mirrors this list in ``api.ts`` (EXPENSE_CATEGORIES); keep the two in sync.
"""

import re

CATEGORIES = [
    "Food",
    "Groceries",
    "Transport",
    "Travel",
    "Rent",
    "Utilities",
    "Health",
    "Entertainment",
    "Shopping",
    "Other",
]

# Lowercased synonyms / legacy labels → canonical. Lets old clients and LLM
# slips ("Food & Dining") land on a real category instead of polluting charts.
_ALIASES = {
    "food & dining": "Food",
    "food and dining": "Food",
    "food & drink": "Food",
    "food and drink": "Food",
    "dining": "Food",
    "meals": "Food",
    "grocery": "Groceries",
    "transportation": "Transport",
    "commute": "Transport",
    "trip": "Travel",
    "vacation": "Travel",
    "rent & home": "Rent",
    "housing": "Rent",
    "home": "Rent",
    "utilities & bills": "Utilities",
    "bills": "Utilities",
    "medical": "Health",
    "healthcare": "Health",
    "health & fitness": "Health",
    "movies": "Entertainment",
    "uncategorized": "Other",
    "miscellaneous": "Other",
    "misc": "Other",
    "general": "Other",
}


def normalize_category(value: str | None) -> str | None:
    """Map client-sent text onto a canonical category. Returns None when the
    text matches nothing — the caller then auto-categorizes from the
    description instead of persisting garbage labels."""
    if not value:
        return None
    lowered = value.strip().lower()
    for cat in CATEGORIES:
        if cat.lower() == lowered:
            return cat
    return _ALIASES.get(lowered)


# First match wins, so order is meaning: Transport (daily commute) must beat
# Travel (trips); Utilities must beat Shopping so "phone bill" / "mobile
# recharge" don't read as buying a phone.
CATEGORY_RULES = [
    (re.compile(r"\b(dinner|lunch|breakfast|food|restaurant|chai|tea|coffee|cafe|khana|biryani|pizza|burger|thali|dhaba|snacks?|drinks?|beer|pub|swiggy|zomato|dominos|kfc|mcdonald'?s?)\b", re.I), "Food"),
    (re.compile(r"\b(grocery|groceries|sabzi|vegetables?|fruits?|ration|kirana|dmart|bigbasket|blinkit|zepto|instamart|milk|dudh)\b", re.I), "Groceries"),
    (re.compile(r"\b(auto|uber|ola|cab|taxi|metro|bus|rickshaw|rapido|petrol|diesel|fuel|parking|toll|fastag)\b", re.I), "Transport"),
    (re.compile(r"\b(flights?|train|hotel|hostel|airbnb|oyo|trip|travel|vacation|holiday|makemytrip|goibibo|irctc|visa)\b", re.I), "Travel"),
    (re.compile(r"\b(rent|kiraya|maintenance|deposit|landlord|society)\b", re.I), "Rent"),
    (re.compile(r"\b(electricity|water|wifi|internet|broadband|gas|cylinder|bill|recharge|dth|postpaid|prepaid)\b", re.I), "Utilities"),
    (re.compile(r"\b(medicines?|medical|pharmacy|chemist|doctor|hospital|clinic|dentist|physio|gym|apollo|1mg|pharmeasy|netmeds|checkup)\b", re.I), "Health"),
    (re.compile(r"\b(movie|cinema|netflix|hotstar|spotify|prime|bookmyshow|game|gaming|concert|party|club|entertainment|match|ipl)\b", re.I), "Entertainment"),
    (re.compile(r"\b(shopping|amazon|flipkart|myntra|ajio|mall|clothes|shirt|jeans|shoes|laptop|phone|mobile|tablet|headphones?|earphones?|electronics|gadget|appliance|furniture|ikea|croma|decathlon|gift)\b", re.I), "Shopping"),
]


def categorize(description: str) -> str:
    """Silent auto-categorization (PRD §5.4). Keyword rules first; honest
    'Other' when nothing matches — never a wrong-but-confident guess."""
    for regex, cat in CATEGORY_RULES:
        if regex.search(description):
            return cat
    return "Other"
