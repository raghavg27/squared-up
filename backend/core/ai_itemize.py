"""Automatic bill itemization (PRD "Scan a receipt"). Turns a receipt photo or
pasted bill text into line items the user then assigns to people. DRAFT only —
like NL parse, it never writes; the user confirms in the form.

Gemini (vision for photos, text otherwise) when ``GEMINI_API_KEY`` is set, with
a deterministic line parser as the always-available offline fallback. All money
math is done here in integer paise; a model number is never trusted as paise.

Contract returned to the client::

    {"items": [{"name", "amount_paise", "quantity"}],
     "total_paise": int | None, "category": str, "merchant": str | None,
     "source": "llm" | "rules"}
"""

import json
import logging
import re

import requests
from django.conf import settings

from .ai import categorize
from .ai_llm import CATEGORIES, _GEMINI_URL, _TIMEOUT_SECONDS, _to_paise

logger = logging.getLogger(__name__)

_MAX_ITEMS = 60

_ITEM_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "amount_rupees": {"type": "NUMBER"},
                    "quantity": {"type": "INTEGER"},
                },
                "required": ["name", "amount_rupees"],
            },
        },
        "merchant": {"type": "STRING", "nullable": True},
        "total_rupees": {"type": "NUMBER", "nullable": True},
        "category": {"type": "STRING", "enum": CATEGORIES},
    },
    "required": ["items", "category"],
}

_PROMPT = """You read a restaurant/shop bill or receipt used in India and extract its line items.

Rules:
- items: one entry per purchased line. name = the dish/product (short, no price). amount_rupees = that line's total price in rupees (unit price x quantity if the receipt shows a line total). quantity = the count if shown, else 1.
- Do NOT emit subtotal, tax/GST, service charge, discount, tip, or grand-total as items — those are captured by total_rupees and the app splits the leftover automatically.
- total_rupees: the final payable amount in rupees if the bill states it, else null.
- merchant: the shop/restaurant name if visible, else null.
- category: the single best fit for the whole bill from the allowed list.
- If the image/text is not a bill, return an empty items list."""


def _line_parser(text: str) -> dict:
    """Offline fallback: pull "<name> <amount>" pairs out of pasted bill text."""
    items: list[dict] = []
    total_paise: int | None = None
    for raw in re.split(r"[\n;]+", text or ""):
        line = raw.strip()
        if not line:
            continue
        m = re.search(r"(.+?)[\s.:-]*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)\s*$", line, re.I)
        if not m:
            continue
        name = re.sub(r"\s+", " ", m.group(1)).strip(" -:.\t")
        paise = _to_paise(m.group(2))
        if not name or paise is None:
            continue
        if re.search(r"\b(total|grand\s*total|amount\s*payable|net)\b", name, re.I):
            total_paise = paise  # a total line — not an item
            continue
        if re.search(r"\b(sub\s*total|tax|gst|cgst|sgst|service|tip|discount|round)\b", name, re.I):
            continue
        # quantity prefix like "2 x Pizza" or "2x Pizza"
        qty = 1
        qm = re.match(r"(\d+)\s*[x×]\s*(.+)", name, re.I)
        if qm:
            qty = int(qm.group(1))
            name = qm.group(2).strip()
        items.append({"name": name[:60], "amount_paise": paise, "quantity": qty})
        if len(items) >= _MAX_ITEMS:
            break
    return {
        "items": items,
        "total_paise": total_paise if total_paise is not None else (sum(i["amount_paise"] for i in items) or None),
        "category": categorize(text or ""),
        "merchant": None,
        "source": "rules",
    }


def _normalize_llm(raw: dict, fallback_text: str) -> dict:
    items: list[dict] = []
    for it in (raw.get("items") or [])[:_MAX_ITEMS]:
        paise = _to_paise(it.get("amount_rupees"))
        name = str(it.get("name") or "").strip()
        if paise is None or paise < 0 or not name:
            continue
        q = it.get("quantity")
        qty = q if isinstance(q, int) and q >= 1 else 1
        items.append({"name": name[:60], "amount_paise": paise, "quantity": qty})
    total = _to_paise(raw.get("total_rupees"))
    if total is None or total < sum(i["amount_paise"] for i in items):
        total = sum(i["amount_paise"] for i in items) or None
    category = raw.get("category") if raw.get("category") in CATEGORIES else categorize(fallback_text)
    merchant = str(raw.get("merchant")).strip()[:80] if raw.get("merchant") else None
    return {"items": items, "total_paise": total, "category": category,
            "merchant": merchant, "source": "llm"}


def _itemize_with_llm(text: str, image_b64: str | None, mime: str | None) -> dict | None:
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        return None
    parts: list[dict] = [{"text": _PROMPT}]
    if image_b64:
        parts.append({"inline_data": {"mime_type": mime or "image/jpeg", "data": image_b64}})
    if text:
        parts.append({"text": f"Bill text:\n{text}"})
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": _ITEM_SCHEMA,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    url = _GEMINI_URL.format(model=getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash"))
    try:
        resp = requests.post(url, json=body, headers={"X-goog-api-key": api_key}, timeout=_TIMEOUT_SECONDS)
        resp.raise_for_status()
        raw = json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])
        if not isinstance(raw, dict):
            return None
        return _normalize_llm(raw, text)
    except Exception:  # noqa: BLE001 — any failure falls back to the line parser
        logger.warning("Gemini itemize failed; falling back to rules", exc_info=True)
        return None


def itemize_bill(text: str = "", image_b64: str | None = None, mime: str | None = None) -> dict:
    """LLM itemize when configured (and an image is present, or text is given);
    deterministic line parser otherwise. Same contract either way."""
    draft = _itemize_with_llm(text, image_b64, mime)
    if draft is not None:
        return draft
    return _line_parser(text)
