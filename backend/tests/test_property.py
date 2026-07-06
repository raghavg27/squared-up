"""Property: for any split, owed sums EXACTLY to total (I5) and per-expense nets
reconcile to zero (I2/I3). Ported from the TS suite; uses Hypothesis instead of
a hand-rolled LCG so the search space is broader. Pure domain, no database.
"""

from hypothesis import given, settings, strategies as st

from domain import compute_shares, compute_nets, assert_balanced

# Participant ids 11, 22, 33, ... (distinct, matching the TS generator shape).
participants_strat = st.integers(min_value=2, max_value=9).map(
    lambda n: [(k + 1) * 11 for k in range(n)]
)
total_strat = st.integers(min_value=1, max_value=1_000_000)


@given(participants=participants_strat, T=total_strat, payer_idx=st.integers(min_value=0, max_value=8))
@settings(max_examples=1000)
def test_equal_splits_reconcile(participants, T, payer_idx):
    payer = participants[payer_idx % len(participants)]
    shares = compute_shares(T, [{"user_id": payer, "paid_paise": T}], {"type": "equal", "participants": participants})
    assert sum(s["owed_paise"] for s in shares) == T
    assert sum(s["paid_paise"] for s in shares) == T
    assert_balanced(compute_nets(shares, []))


@given(
    data=st.data(),
    participants=st.integers(min_value=2, max_value=7).map(lambda n: [(k + 1) * 11 for k in range(n)]),
    T=total_strat,
)
@settings(max_examples=1000)
def test_shares_splits_reconcile(data, participants, T):
    shares_weights = {
        str(p): data.draw(st.integers(min_value=1, max_value=10)) for p in participants
    }
    out = compute_shares(
        T,
        [{"user_id": participants[0], "paid_paise": T}],
        {"type": "shares", "participants": participants, "shares": shares_weights},
    )
    assert sum(s["owed_paise"] for s in out) == T
