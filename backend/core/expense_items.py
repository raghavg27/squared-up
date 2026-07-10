"""Itemized-bill helpers: turn validated line items into an ``exact`` split and
persist them. Keeps the item logic out of the oversized ``services.py``; the
money math itself lives in ``domain.itemize`` (pure, tested).
"""

from domain import allocate_items

from .models import ExpenseItem


def split_from_items(amount_paise: int, items: list[dict]) -> dict:
    """Derive an ``exact`` split spec from item lines. Participants are everyone
    on at least one line; each person owes their per-item shares plus an equal
    cut of the untagged remainder (tax/tip). Raises the domain error codes."""
    participants = sorted({u for it in items for u in it["participant_ids"]})
    owed = allocate_items(amount_paise, items, participants)
    return {
        "type": "exact",
        "participants": participants,
        "amounts_paise": {str(u): owed[u] for u in participants},
    }


def persist_items(expense_id: int, items: list[dict]) -> None:
    """Replace the stored line items for an expense (create or edit)."""
    ExpenseItem.objects.filter(expense_id=expense_id).delete()
    ExpenseItem.objects.bulk_create(
        [
            ExpenseItem(
                expense_id=expense_id,
                name=it["name"],
                amount_paise=it["amount_paise"],
                quantity=it.get("quantity", 1),
                participant_ids=sorted(set(it["participant_ids"])),
                position=i,
            )
            for i, it in enumerate(items)
        ]
    )


def items_of(expense) -> list[dict]:
    return [
        {
            "id": it.id,
            "name": it.name,
            "amount_paise": it.amount_paise,
            "quantity": it.quantity,
            "participant_ids": it.participant_ids,
        }
        for it in expense.items.all()
    ]
