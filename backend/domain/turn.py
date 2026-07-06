"""Turn to Pay — whose turn to pay next. Spec §9.

rotation_net(u) = SUM(paid - owed) over is_rotation, non-deleted expenses.
Fairness derives ONLY from is_rotation expenses (Invariant I8).

``members`` are dicts {user_id, in_rotation, left_at?}; ``expenses`` are dicts
{is_rotation, deleted_at?, expense_date "YYYY-MM-DD", shares}.
"""

from dataclasses import dataclass


@dataclass
class TurnResult:
    next_payer: int
    rotation_net_paise: int
    max_abs_rotation_net_paise: int


def compute_rotation_nets(members: list[dict], expenses: list[dict]) -> dict[int, dict]:
    """Returns user_id -> {"net": int, "last_paid_on": str | None}."""
    active = [m for m in members if m["in_rotation"] and not m.get("left_at")]
    result: dict[int, dict] = {m["user_id"]: {"net": 0, "last_paid_on": None} for m in active}

    for e in expenses:
        if not e["is_rotation"] or e.get("deleted_at"):
            continue
        for s in e["shares"]:
            cur = result.get(s["user_id"])
            if cur is None:
                continue  # only active rotation members count
            cur["net"] += s["paid_paise"] - s["owed_paise"]
            if s["paid_paise"] > 0:
                if cur["last_paid_on"] is None or e["expense_date"] > cur["last_paid_on"]:
                    cur["last_paid_on"] = e["expense_date"]
    return result


def next_payer_balanced(members: list[dict], expenses: list[dict]) -> TurnResult | None:
    """Balanced mode (§9.3): next payer = most-negative rotation_net.
    Tie-break: rotation_net ASC, earliest last_paid_on (NULL first), user_id ASC.
    """
    nets = compute_rotation_nets(members, expenses)
    if len(nets) == 0:
        return None

    max_abs = max((abs(v["net"]) for v in nets.values()), default=0)

    def sort_key(item):
        uid, info = item
        # last_paid_on None sorts first: (0, "") before (1, date).
        lp = info["last_paid_on"]
        lp_key = (0, "") if lp is None else (1, lp)
        return (info["net"], lp_key, uid)

    ranked = sorted(nets.items(), key=sort_key)
    user_id, info = ranked[0]
    return TurnResult(
        next_payer=user_id,
        rotation_net_paise=info["net"],
        max_abs_rotation_net_paise=max_abs,
    )


def next_payer_round_robin(order: list[int], pos: int) -> int | None:
    """Round-robin mode (§9.4): turn = rotation_rr_order[rotation_rr_pos]."""
    if len(order) == 0:
        return None
    return order[((pos % len(order)) + len(order)) % len(order)]


def advance_round_robin(order: list[int], pos: int) -> int:
    if len(order) == 0:
        return 0
    return (pos + 1) % len(order)
