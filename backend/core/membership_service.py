"""Membership side-effects: what else happens when people share a group.

Two concerns live here, both triggered by group create / add-member and kept
out of the legacy ``services.py``:

- ``befriend()`` — co-members become directory friends automatically.
- ``include_member_in_history()`` — optionally fold a newcomer into the
  group's past equal-split expenses.
"""

from collections.abc import Iterable

from domain import DomainError, compute_shares

from .models import Expense, ExpenseShare, Friendship


def befriend(user_ids: Iterable[int]) -> None:
    """Create pairwise friendships between everyone in ``user_ids``.

    People who share a group are friends by default — a directory-level link
    only, no money implications. Existing rows are untouched, and an explicit
    unfriend sticks until the pair shares a *new* membership event.
    """
    ids = sorted(set(user_ids))
    rows = [
        Friendship(user_low_id=a, user_high_id=b)
        for i, a in enumerate(ids)
        for b in ids[i + 1 :]
    ]
    if rows:
        Friendship.objects.bulk_create(rows, ignore_conflicts=True)


def _is_equal_split(amount_paise: int, payers: list[dict], participants: list[int], owed_now: dict[int, int]) -> bool:
    """True when the stored owed amounts are exactly what an equal split among
    ``participants`` would produce — i.e. the expense carries no deliberate
    uneven allocation we would destroy by re-splitting."""
    equal = compute_shares(amount_paise, payers, {"type": "equal", "participants": participants})
    owed_equal = {s["user_id"]: s["owed_paise"] for s in equal if s["owed_paise"] > 0}
    return owed_now == owed_equal


def include_member_in_history(group_id: int, new_user_id: int) -> int:
    """Fold a newly-added member into the group's past expenses.

    Only expenses indistinguishable from an equal split among their
    participants are re-split (equally, over participants + the newcomer,
    payers unchanged). Exact/shares/itemized allocations were deliberate and
    stay as they are. Runs inside the caller's transaction. Returns the
    number of expenses updated.
    """
    updated = 0
    qs = (
        Expense.objects.select_for_update()
        .filter(group_id=group_id, deleted_at__isnull=True)
        .prefetch_related("shares", "items")
    )
    for e in qs:
        if e.items.exists():  # itemized bill: the receipt lines own the split
            continue
        shares = list(e.shares.all())
        if any(s.user_id == new_user_id for s in shares):
            continue  # rejoining member already on this split
        participants = sorted(s.user_id for s in shares if s.owed_paise > 0)
        if not participants:
            continue
        payers = [{"user_id": s.user_id, "paid_paise": s.paid_paise} for s in shares if s.paid_paise > 0]
        owed_now = {s.user_id: s.owed_paise for s in shares if s.owed_paise > 0}
        if not _is_equal_split(e.amount_paise, payers, participants, owed_now):
            continue
        new_shares = compute_shares(
            e.amount_paise, payers, {"type": "equal", "participants": [*participants, new_user_id]}
        )
        if (
            sum(s["paid_paise"] for s in new_shares) != e.amount_paise
            or sum(s["owed_paise"] for s in new_shares) != e.amount_paise
        ):
            raise DomainError("PAYERS_SUM_MISMATCH", "invariant I1 violated")
        e.shares.all().delete()
        ExpenseShare.objects.bulk_create(
            [
                ExpenseShare(expense=e, user_id=s["user_id"], paid_paise=s["paid_paise"], owed_paise=s["owed_paise"])
                for s in new_shares
            ]
        )
        updated += 1
    return updated
