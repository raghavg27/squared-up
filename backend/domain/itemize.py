"""Itemized-split money math (receipt itemization) — Core Domain Spec §5 extension.

Each bill line item is split EQUALLY among the people who shared it
(largest-remainder, integer paise). Whatever the items don't cover — tax, tip,
service charge, delivery, rounding — is the ``remainder``, split equally among
everyone on the bill. Sum over items + remainder == the expense total, so the
result feeds an ``exact`` split and the existing invariants (I1/I5) hold with no
float ever touched.
"""

from .errors import DomainError
from .money import allocate


def allocate_items(
    total_paise: int,
    items: list[dict],
    participants: list[int],
) -> dict[int, int]:
    """Owed paise per participant from itemized lines.

    ``items``: ``[{"amount_paise": int >= 0, "participant_ids": [uid, ...]}]`` —
    each line split equally among its own people. ``participants``: the full
    bill party (union of everyone on any line); it carries the shared remainder.
    Returns ``{uid: owed_paise}`` for every participant, summing EXACTLY to
    ``total_paise``.
    """
    if not isinstance(total_paise, int) or isinstance(total_paise, bool):
        raise DomainError("SPLIT_SUM_MISMATCH", "total must be integer paise")
    if total_paise <= 0:
        raise DomainError("SPLIT_SUM_MISMATCH", "total must be positive")
    party = list(dict.fromkeys(participants))  # de-dupe, keep order
    if not party:
        raise DomainError("EMPTY_PARTICIPANTS")
    party_set = set(party)

    owed: dict[int, int] = {u: 0 for u in party}

    assigned = 0
    for item in items:
        amt = item["amount_paise"]
        if not isinstance(amt, int) or isinstance(amt, bool) or amt < 0:
            raise DomainError("ITEM_PARTICIPANT_INVALID", "item amount must be >= 0 paise")
        ids = list(dict.fromkeys(item["participant_ids"]))
        if not ids or any(u not in party_set for u in ids):
            raise DomainError("ITEM_PARTICIPANT_INVALID", "item people must be on the bill")
        assigned += amt
        if amt:
            for u, share in allocate(amt, {u: 1 for u in ids}).items():
                owed[u] += share

    if assigned > total_paise:
        raise DomainError("ITEM_SUM_EXCEEDS_TOTAL")

    remainder = total_paise - assigned
    if remainder:
        for u, share in allocate(remainder, {u: 1 for u in party}).items():
            owed[u] += share

    if sum(owed.values()) != total_paise:  # belt-and-suspenders (I5)
        raise DomainError("SPLIT_SUM_MISMATCH", "itemized shares do not sum to total")
    return owed
