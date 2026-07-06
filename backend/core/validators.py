"""Request validation — a Python port of the zod schemas in the old API.

Each ``validate_*`` returns a normalized dict (defaults applied). On bad input
it raises DRF ``ValidationError`` which the exception handler renders as a 422
VALIDATION_ERROR envelope.
"""

import re

from rest_framework.exceptions import ValidationError

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

GROUP_TYPES = {"trip", "home", "couple", "other"}
ROTATION_MODES = {"balanced", "round_robin"}
EXPENSE_SOURCES = {"manual", "nl", "import"}
SETTLEMENT_METHODS = {"upi", "manual"}
LOCALES = {"en", "hi"}
SPLIT_TYPES = {"equal", "exact", "percent", "shares", "adjustment"}


def _err(field: str, msg: str):
    raise ValidationError({field: [msg]})


def _require_int(value, field: str, *, positive=False, nonneg=False) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        _err(field, "must be an integer")
    if positive and value <= 0:
        _err(field, "must be a positive integer")
    if nonneg and value < 0:
        _err(field, "must be a non-negative integer")
    return value


def _require_str(value, field: str, *, min_len=1) -> str:
    if not isinstance(value, str) or len(value) < min_len:
        _err(field, f"must be a string of length >= {min_len}")
    return value


def _int_record(value, field: str) -> dict:
    if not isinstance(value, dict):
        _err(field, "must be an object of integer values")
    out = {}
    for k, v in value.items():
        if not isinstance(v, int) or isinstance(v, bool):
            _err(field, f"value for {k!r} must be an integer")
        out[str(k)] = v
    return out


def validate_split(data) -> dict:
    if not isinstance(data, dict):
        _err("split", "must be an object")
    stype = data.get("type")
    if stype not in SPLIT_TYPES:
        _err("split.type", f"must be one of {sorted(SPLIT_TYPES)}")

    participants = data.get("participants")
    if not isinstance(participants, list) or len(participants) < 1:
        _err("split.participants", "must be a non-empty array")
    participants = [_require_int(p, "split.participants", positive=True) for p in participants]

    out = {"type": stype, "participants": participants}
    if stype == "exact":
        out["amounts_paise"] = _int_record(data.get("amounts_paise", {}), "split.amounts_paise")
    elif stype == "percent":
        out["percent_bps"] = _int_record(data.get("percent_bps", {}), "split.percent_bps")
    elif stype == "shares":
        out["shares"] = _int_record(data.get("shares", {}), "split.shares")
    elif stype == "adjustment":
        out["adjustments_paise"] = _int_record(data.get("adjustments_paise", {}), "split.adjustments_paise")
    return out


def validate_create_expense(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError("body must be an object")

    group_id = data.get("group_id")
    if group_id is not None:
        group_id = _require_int(group_id, "group_id", positive=True)

    category_id = data.get("category_id")
    if category_id is not None:
        category_id = _require_int(category_id, "category_id", positive=True)

    expense_date = data.get("expense_date")
    if not isinstance(expense_date, str) or not _DATE_RE.match(expense_date):
        _err("expense_date", "must match YYYY-MM-DD")

    currency = data.get("currency", "INR")
    if not isinstance(currency, str) or len(currency) != 3:
        _err("currency", "must be a 3-letter code")

    source = data.get("source", "manual")
    if source not in EXPENSE_SOURCES:
        _err("source", f"must be one of {sorted(EXPENSE_SOURCES)}")

    is_rotation = data.get("is_rotation", False)
    if not isinstance(is_rotation, bool):
        _err("is_rotation", "must be a boolean")

    payers = data.get("payers")
    if not isinstance(payers, list) or len(payers) < 1:
        _err("payers", "must be a non-empty array")
    norm_payers = []
    for p in payers:
        if not isinstance(p, dict):
            _err("payers", "each payer must be an object")
        norm_payers.append(
            {
                "user_id": _require_int(p.get("user_id"), "payers.user_id", positive=True),
                "paid_paise": _require_int(p.get("paid_paise"), "payers.paid_paise", nonneg=True),
            }
        )

    return {
        "group_id": group_id,
        "description": _require_str(data.get("description"), "description"),
        "amount_paise": _require_int(data.get("amount_paise"), "amount_paise", positive=True),
        "currency": currency,
        "expense_date": expense_date,
        "category_id": category_id,
        "source": source,
        "is_rotation": is_rotation,
        "created_by": _require_int(data.get("created_by"), "created_by", positive=True),
        "payers": norm_payers,
        "split": validate_split(data.get("split")),
    }


def validate_create_settlement(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError("body must be an object")

    group_id = data.get("group_id")
    if group_id is not None:
        group_id = _require_int(group_id, "group_id", positive=True)

    method = data.get("method")
    if method not in SETTLEMENT_METHODS:
        _err("method", f"must be one of {sorted(SETTLEMENT_METHODS)}")

    note = data.get("note")
    if note is not None and not isinstance(note, str):
        _err("note", "must be a string")

    return {
        "group_id": group_id,
        "from_user": _require_int(data.get("from_user"), "from_user", positive=True),
        "to_user": _require_int(data.get("to_user"), "to_user", positive=True),
        "amount_paise": _require_int(data.get("amount_paise"), "amount_paise", positive=True),
        "method": method,
        "note": note,
    }


def validate_create_user(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError("body must be an object")

    locale = data.get("locale", "en")
    if locale not in LOCALES:
        _err("locale", f"must be one of {sorted(LOCALES)}")

    def opt_str(field):
        v = data.get(field)
        if v is not None and not isinstance(v, str):
            _err(field, "must be a string or null")
        return v

    return {
        "name": _require_str(data.get("name"), "name"),
        "phone": opt_str("phone"),
        "email": opt_str("email"),
        "upi_vpa": opt_str("upi_vpa"),
        "locale": locale,
    }


def validate_create_group(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError("body must be an object")

    gtype = data.get("type", "other")
    if gtype not in GROUP_TYPES:
        _err("type", f"must be one of {sorted(GROUP_TYPES)}")

    rotation_mode = data.get("rotation_mode", "balanced")
    if rotation_mode not in ROTATION_MODES:
        _err("rotation_mode", f"must be one of {sorted(ROTATION_MODES)}")

    rotation_enabled = data.get("rotation_enabled", False)
    if not isinstance(rotation_enabled, bool):
        _err("rotation_enabled", "must be a boolean")

    member_ids = data.get("member_ids", [])
    if not isinstance(member_ids, list):
        _err("member_ids", "must be an array")
    member_ids = [_require_int(m, "member_ids", positive=True) for m in member_ids]

    return {
        "name": _require_str(data.get("name"), "name"),
        "type": gtype,
        "created_by": _require_int(data.get("created_by"), "created_by", positive=True),
        "member_ids": member_ids,
        "rotation_enabled": rotation_enabled,
        "rotation_mode": rotation_mode,
    }
