"""Golden vectors — a port of the TypeScript domain suite (Core Domain Spec §14).
Pure domain, no database."""

import pytest

from domain import (
    allocate,
    compute_shares,
    compute_nets,
    assert_balanced,
    simplify,
    next_payer_balanced,
    build_upi_intent,
    paise_to_rupee_string,
    DomainError,
)


def owed_map(shares):
    return {s["user_id"]: s["owed_paise"] for s in shares}


# ─── §14.1 Split allocation ────────────────────────────────────────────────
class TestAllocateSplit:
    def test_equal_10000_3(self):
        assert allocate(10000, {11: 1, 22: 1, 33: 1}) == {11: 3334, 22: 3333, 33: 3333}

    def test_equal_10001_3(self):
        assert allocate(10001, {11: 1, 22: 1, 33: 1}) == {11: 3334, 22: 3334, 33: 3333}

    def test_equal_100_3(self):
        assert allocate(100, {11: 1, 22: 1, 33: 1}) == {11: 34, 22: 33, 33: 33}

    def test_equal_10000_4(self):
        assert allocate(10000, {11: 1, 22: 1, 33: 1, 44: 1}) == {11: 2500, 22: 2500, 33: 2500, 44: 2500}

    def test_shares_10000_112(self):
        s = compute_shares(10000, [{"user_id": 11, "paid_paise": 10000}], {"type": "shares", "participants": [11, 22, 33], "shares": {"11": 1, "22": 1, "33": 2}})
        assert owed_map(s) == {11: 2500, 22: 2500, 33: 5000}

    def test_shares_100_111(self):
        assert allocate(100, {11: 1, 22: 1, 33: 1}) == {11: 34, 22: 33, 33: 33}

    def test_percent_10000(self):
        s = compute_shares(10000, [{"user_id": 11, "paid_paise": 10000}], {"type": "percent", "participants": [11, 22, 33], "percent_bps": {"11": 2500, "22": 2500, "33": 5000}})
        assert owed_map(s) == {11: 2500, 22: 2500, 33: 5000}

    def test_exact_valid(self):
        s = compute_shares(10000, [{"user_id": 11, "paid_paise": 10000}], {"type": "exact", "participants": [11, 22, 33], "amounts_paise": {"11": 4000, "22": 3000, "33": 3000}})
        assert owed_map(s) == {11: 4000, 22: 3000, 33: 3000}

    def test_exact_bad_sum(self):
        with pytest.raises(DomainError) as e:
            compute_shares(10000, [{"user_id": 11, "paid_paise": 10000}], {"type": "exact", "participants": [11, 22, 33], "amounts_paise": {"11": 4000, "22": 3000, "33": 2999}})
        assert e.value.code == "SPLIT_SUM_MISMATCH"

    def test_adjustment(self):
        s = compute_shares(10000, [{"user_id": 11, "paid_paise": 10000}], {"type": "adjustment", "participants": [11, 22], "adjustments_paise": {"22": 1000}})
        assert owed_map(s) == {11: 4500, 22: 5500}

    def test_percent_bad_sum(self):
        with pytest.raises(DomainError) as e:
            compute_shares(10000, [{"user_id": 11, "paid_paise": 10000}], {"type": "percent", "participants": [11, 22], "percent_bps": {"11": 5000, "22": 4000}})
        assert e.value.code == "PERCENT_SUM_INVALID"

    def test_payers_mismatch(self):
        with pytest.raises(DomainError) as e:
            compute_shares(10000, [{"user_id": 11, "paid_paise": 9999}], {"type": "equal", "participants": [11, 22]})
        assert e.value.code == "PAYERS_SUM_MISMATCH"


# ─── §14.2 Per-expense net (I2) ────────────────────────────────────────────
def test_per_expense_net():
    s = compute_shares(180000, [{"user_id": 11, "paid_paise": 180000}], {"type": "equal", "participants": [11, 22, 33]})
    nets = compute_nets(s, [])
    assert nets == {11: 120000, 22: -60000, 33: -60000}
    assert_balanced(nets)


# ─── §14.3 Settlement effect (I6) ──────────────────────────────────────────
def test_settlement_effect():
    shares = [
        {"user_id": 11, "paid_paise": 180000, "owed_paise": 60000},
        {"user_id": 22, "paid_paise": 0, "owed_paise": 60000},
        {"user_id": 33, "paid_paise": 0, "owed_paise": 60000},
    ]
    nets = compute_nets(shares, [{"from_user": 22, "to_user": 11, "amount_paise": 60000, "status": "confirmed"}])
    assert nets == {11: 60000, 22: 0, 33: -60000}
    assert_balanced(nets)


# ─── §14.4 Debt simplification ─────────────────────────────────────────────
def test_simplify_basic():
    assert simplify({11: 60000, 22: 0, 33: -60000}) == [{"from_user": 33, "to_user": 11, "amount_paise": 60000}]


def test_simplify_tiebreak():
    assert simplify({11: 600, 22: -300, 33: -300}) == [
        {"from_user": 22, "to_user": 11, "amount_paise": 300},
        {"from_user": 33, "to_user": 11, "amount_paise": 300},
    ]


# ─── §14.5 Turn to Pay (balanced) ──────────────────────────────────────────
def test_turn_to_pay_sequence():
    members = [
        {"user_id": 11, "in_rotation": True},
        {"user_id": 22, "in_rotation": True},
        {"user_id": 33, "in_rotation": True},
    ]

    def rot_expense(payer, amount, date):
        return {
            "is_rotation": True,
            "expense_date": date,
            "shares": compute_shares(amount, [{"user_id": payer, "paid_paise": amount}], {"type": "equal", "participants": [11, 22, 33]}),
        }

    exps = []
    # step 0: all 0 → 11 (lowest id)
    assert next_payer_balanced(members, exps).next_payer == 11
    exps.append(rot_expense(11, 90000, "2026-01-01"))
    # step 1: tie -30000 → 22 (lowest id)
    assert next_payer_balanced(members, exps).next_payer == 22
    exps.append(rot_expense(22, 120000, "2026-01-02"))
    # step 2: 33 most behind -70000
    t = next_payer_balanced(members, exps)
    assert t.next_payer == 33
    assert t.rotation_net_paise == -70000
    exps.append(rot_expense(33, 60000, "2026-01-03"))
    # step 3: 33 still behind -30000
    assert next_payer_balanced(members, exps).next_payer == 33
    exps.append(rot_expense(33, 60000, "2026-01-04"))
    # step 4: 11 (-20000)
    assert next_payer_balanced(members, exps).next_payer == 11


# ─── UPI intent ────────────────────────────────────────────────────────────
def test_paise_to_rupee_string():
    assert paise_to_rupee_string(60000) == "600.00"
    assert paise_to_rupee_string(45050) == "450.50"
    assert paise_to_rupee_string(5) == "0.05"


def test_build_upi_intent():
    assert build_upi_intent(vpa="rahul@okhdfc", payee_name="Rahul", amount_paise=60000, note="Squared Up") == (
        "upi://pay?pa=rahul%40okhdfc&pn=Rahul&am=600.00&cu=INR&tn=Squared+Up"
    )


def test_build_upi_intent_null_vpa():
    assert build_upi_intent(vpa=None, payee_name="Rahul", amount_paise=60000) is None
