"""Net balance per user in a scope. Spec §6.

net(u) = SUM(paid - owed) over expense_shares
       + SUM(amount) for confirmed settlements where from_user = u
       - SUM(amount) for confirmed settlements where to_user   = u
Positive = scope owes them; negative = they owe the scope.
Invariant I3: SUM over all users = 0.

``shares`` are dicts {user_id, paid_paise, owed_paise}; ``settlements`` are
dicts {from_user, to_user, amount_paise, status, deleted_at?}.
"""


def compute_nets(shares: list[dict], settlements: list[dict]) -> dict[int, int]:
    net: dict[int, int] = {}

    def add(u: int, delta: int) -> None:
        net[u] = net.get(u, 0) + delta

    for s in shares:
        add(s["user_id"], s["paid_paise"] - s["owed_paise"])

    for st in settlements:
        if st["status"] != "confirmed" or st.get("deleted_at"):
            continue
        add(st["from_user"], st["amount_paise"])  # debtor moves up toward zero (I6)
        add(st["to_user"], -st["amount_paise"])  # creditor moves down toward zero
    return net


def assert_balanced(nets: dict[int, int]) -> None:
    """Assert Invariant I3: nets sum to exactly zero."""
    total = sum(nets.values())
    if total != 0:
        raise AssertionError(f"I3 violated: nets sum to {total}, expected 0")
