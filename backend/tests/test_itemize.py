"""Itemized-split money math — pure domain, no DB (mirrors test_vectors style)."""

import pytest

from domain import allocate_items
from domain.errors import DomainError


def test_two_items_plus_shared_tax():
    # ₹1000 bill: Aarav's ₹300 dish, Bhavna's ₹500 dish, ₹200 tax shared by both.
    owed = allocate_items(
        100000,
        [
            {"amount_paise": 30000, "participant_ids": [1]},
            {"amount_paise": 50000, "participant_ids": [2]},
        ],
        [1, 2],
    )
    assert owed == {1: 40000, 2: 60000}
    assert sum(owed.values()) == 100000


def test_shared_item_split_equally():
    owed = allocate_items(90000, [{"amount_paise": 90000, "participant_ids": [1, 2, 3]}], [1, 2, 3])
    assert owed == {1: 30000, 2: 30000, 3: 30000}


def test_odd_paise_uses_largest_remainder():
    # 100 paise shared by 3 → 34/33/33, leftover to smallest user_id (tie-break).
    owed = allocate_items(100, [{"amount_paise": 100, "participant_ids": [1, 2, 3]}], [1, 2, 3])
    assert sum(owed.values()) == 100
    assert sorted(owed.values()) == [33, 33, 34]
    assert owed[1] == 34  # (frac tie) lowest user_id wins the extra paise


def test_remainder_only_when_no_items():
    owed = allocate_items(100000, [], [1, 2, 3, 4])
    assert sum(owed.values()) == 100000
    assert owed == {1: 25000, 2: 25000, 3: 25000, 4: 25000}


def test_participant_not_on_bill_rejected():
    with pytest.raises(DomainError) as e:
        allocate_items(1000, [{"amount_paise": 1000, "participant_ids": [1, 9]}], [1, 2])
    assert e.value.code == "ITEM_PARTICIPANT_INVALID"


def test_items_over_total_rejected():
    with pytest.raises(DomainError) as e:
        allocate_items(1000, [{"amount_paise": 2000, "participant_ids": [1]}], [1])
    assert e.value.code == "ITEM_SUM_EXCEEDS_TOTAL"


def test_always_sums_to_total_property():
    # A grab-bag of shapes; the invariant is total conservation.
    cases = [
        (99999, [{"amount_paise": 33333, "participant_ids": [1, 2]}], [1, 2, 3]),
        (12345, [{"amount_paise": 1, "participant_ids": [1]},
                 {"amount_paise": 2, "participant_ids": [2, 3]}], [1, 2, 3]),
        (777, [{"amount_paise": 0, "participant_ids": [1]}], [1, 2]),
    ]
    for total, items, party in cases:
        assert sum(allocate_items(total, items, party).values()) == total
