"""Spending analytics (PRD "Insights"). Aggregates the caller's OWN share of
expenses — ``owed_paise`` is what they actually spent — into category, month,
and group breakdowns for the charts screen. Money stays integer paise; the
frontend formats it. Read-only; never mutates.

Scope is either everything the caller is a share of, or one group (membership is
checked by the view before this runs, mirroring the other group endpoints).
"""

from datetime import date

from .models import ExpenseShare

_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _month_add(y: int, m: int, delta: int) -> tuple[int, int]:
    idx = (y * 12 + (m - 1)) + delta
    return idx // 12, idx % 12 + 1


def _month_window(today: date, months: int) -> list[tuple[int, int]]:
    """The (year, month) pairs for the last ``months`` months, oldest first."""
    return [_month_add(today.year, today.month, -(months - 1 - i)) for i in range(months)]


def spending_summary(user_id: int, months: int = 6, group_id: int | None = None) -> dict:
    months = max(1, min(24, months))
    today = date.today()
    window = _month_window(today, months)
    start_y, start_m = window[0]
    start = date(start_y, start_m, 1)

    shares = (
        ExpenseShare.objects.filter(
            user_id=user_id,
            expense__deleted_at__isnull=True,
            expense__expense_date__gte=start,
        )
        .select_related("expense", "expense__group")
    )
    if group_id is not None:
        shares = shares.filter(expense__group_id=group_id)

    by_category: dict[str, dict] = {}
    by_month: dict[str, int] = {f"{y:04d}-{m:02d}": 0 for y, m in window}
    by_group: dict[object, dict] = {}
    expenses: dict[int, dict] = {}
    total_spent = 0
    total_paid = 0

    for s in shares:
        e = s.expense
        owed = s.owed_paise
        total_spent += owed
        total_paid += s.paid_paise

        cat = e.category_label or "Other"
        c = by_category.setdefault(cat, {"category": cat, "amount_paise": 0, "count": 0})
        c["amount_paise"] += owed
        c["count"] += 1

        key = f"{e.expense_date.year:04d}-{e.expense_date.month:02d}"
        if key in by_month:
            by_month[key] += owed

        gkey = e.group_id if e.group_id is not None else "personal"
        gname = e.group.name if e.group_id is not None else "Personal"
        g = by_group.setdefault(gkey, {"group_id": e.group_id, "name": gname, "amount_paise": 0})
        g["amount_paise"] += owed

        # One row per expense (a user has exactly one share per expense).
        expenses[e.id] = {
            "id": e.id,
            "description": e.description,
            "category": cat,
            "amount_paise": e.amount_paise,
            "your_share_paise": owed,
            "expense_date": e.expense_date.isoformat(),
            "group_id": e.group_id,
        }

    count = len(expenses)
    return {
        "scope": "group" if group_id is not None else "all",
        "group_id": group_id,
        "months": months,
        "range_start": start.isoformat(),
        "totals": {
            "spent_paise": total_spent,
            "paid_paise": total_paid,
            "net_paise": total_paid - total_spent,
            "expense_count": count,
            "avg_paise": round(total_spent / count) if count else 0,
        },
        "by_category": sorted(by_category.values(), key=lambda c: -c["amount_paise"]),
        "by_month": [
            {"month": f"{y:04d}-{m:02d}", "label": _MONTH_LABELS[m - 1],
             "amount_paise": by_month[f"{y:04d}-{m:02d}"]}
            for y, m in window
        ],
        "by_group": sorted(by_group.values(), key=lambda g: -g["amount_paise"]),
        "top_expenses": sorted(expenses.values(), key=lambda x: -x["your_share_paise"])[:5],
    }
