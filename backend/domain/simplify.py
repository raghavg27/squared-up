"""Debt simplification — greedy largest-creditor/largest-debtor. Spec §8.

Converts member nets (Σ = 0) into ≤ (n-1) transfers. Tie-breaks
(amount DESC, user_id ASC) keep output deterministic.
Returns list of dicts {from_user, to_user, amount_paise}.
"""


def simplify(nets: dict[int, int]) -> list[dict]:
    creditors = sorted(
        ({"u": u, "amt": n} for u, n in nets.items() if n > 0),
        key=lambda c: (-c["amt"], c["u"]),
    )
    debtors = sorted(
        ({"u": u, "amt": -n} for u, n in nets.items() if n < 0),
        key=lambda d: (-d["amt"], d["u"]),
    )

    transfers: list[dict] = []
    i = 0
    j = 0
    while i < len(creditors) and j < len(debtors):
        c = creditors[i]
        d = debtors[j]
        t = min(c["amt"], d["amt"])
        transfers.append({"from_user": d["u"], "to_user": c["u"], "amount_paise": t})
        c["amt"] -= t
        d["amt"] -= t
        if c["amt"] == 0:
            i += 1
        if d["amt"] == 0:
            j += 1
    return transfers
