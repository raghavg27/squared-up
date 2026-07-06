"""Compute owed_paise per participant from a split spec. Spec §5.2.

A ``split`` is a dict shaped like the JSON payload, e.g.::

    {"type": "equal",   "participants": [11, 22, 33]}
    {"type": "exact",   "participants": [...], "amounts_paise": {"11": 4000, ...}}
    {"type": "percent", "participants": [...], "percent_bps": {"11": 2500, ...}}
    {"type": "shares",  "participants": [...], "shares": {"11": 1, ...}}
    {"type": "adjustment", "participants": [...], "adjustments_paise": {"22": 1000}}

Record keys are matched by ``str(user_id)`` so JSON string keys line up.
A "Share" is a dict: {"user_id", "paid_paise", "owed_paise"}.
"""

from .errors import DomainError
from .money import allocate


def compute_shares(amount_paise: int, payers: list[dict], split: dict) -> list[dict]:
    """Validate payers sum to total, map each split type onto ``allocate``
    (largest-remainder) except ``exact``/``adjustment`` which are explicit.
    Returns full expense_shares rows (paid + owed merged by user).
    """
    T = amount_paise
    if len(split["participants"]) == 0:
        raise DomainError("EMPTY_PARTICIPANTS")

    # Payers must sum exactly to the total (I1). Spec §5.
    if sum(p["paid_paise"] for p in payers) != T:
        raise DomainError("PAYERS_SUM_MISMATCH")

    owed = _compute_owed(T, split)

    # Merge paid + owed into one row per user. A pure payer has owed 0; a pure
    # ower has paid 0 (Spec §2). Participants and payers may differ.
    paid_by_user: dict[int, int] = {}
    for p in payers:
        paid_by_user[p["user_id"]] = paid_by_user.get(p["user_id"], 0) + p["paid_paise"]

    users = set(owed.keys()) | set(paid_by_user.keys())
    shares = []
    for u in sorted(users):
        shares.append(
            {
                "user_id": u,
                "paid_paise": paid_by_user.get(u, 0),
                "owed_paise": owed.get(u, 0),
            }
        )
    return shares


def _compute_owed(T: int, split: dict) -> dict[int, int]:
    ps: list[int] = split["participants"]
    stype = split["type"]

    if stype == "equal":
        return allocate(T, {u: 1 for u in ps})

    if stype == "exact":
        amounts = split["amounts_paise"]
        owed = {u: amounts.get(str(u), 0) for u in ps}
        if sum(owed.values()) != T:
            raise DomainError("SPLIT_SUM_MISMATCH")
        return owed

    if stype == "percent":
        bps = split["percent_bps"]
        if sum(bps.get(str(u), 0) for u in ps) != 10000:
            raise DomainError("PERCENT_SUM_INVALID")
        return allocate(T, {u: bps.get(str(u), 0) for u in ps})

    if stype == "shares":
        weights: dict[int, int] = {}
        for u in ps:
            s = split["shares"].get(str(u), 0)
            if not isinstance(s, int) or isinstance(s, bool) or s < 1:
                raise DomainError("SHARES_INVALID")
            weights[u] = s
        if len(weights) == 0:
            raise DomainError("SHARES_INVALID")
        return allocate(T, weights)

    if stype == "adjustment":
        adjustments = split["adjustments_paise"]
        adj = {u: adjustments.get(str(u), 0) for u in ps}
        A = sum(adj.values())
        R = T - A
        eq = allocate(R, {u: 1 for u in ps})
        owed = {}
        for u in ps:
            o = eq[u] + adj[u]
            if o < 0:
                raise DomainError("NEGATIVE_OWED")
            owed[u] = o
        if sum(owed.values()) != T:
            raise DomainError("SPLIT_SUM_MISMATCH")
        return owed

    raise DomainError("SPLIT_SUM_MISMATCH", f"unknown split type {stype!r}")
