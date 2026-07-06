"""Pure-Python port of the Squared Up domain core (Core Domain Spec).

No Django imports here — this package is framework-free so it can be unit-tested
in isolation and reused. Money is integer paise (₹1 = 100 paise); no floats.
"""

from .errors import DomainError, DomainErrorCode
from .money import allocate
from .split import compute_shares
from .balance import compute_nets, assert_balanced
from .simplify import simplify
from .turn import (
    compute_rotation_nets,
    next_payer_balanced,
    next_payer_round_robin,
    advance_round_robin,
    TurnResult,
)
from .upi import paise_to_rupee_string, build_upi_intent

__all__ = [
    "DomainError",
    "DomainErrorCode",
    "allocate",
    "compute_shares",
    "compute_nets",
    "assert_balanced",
    "simplify",
    "compute_rotation_nets",
    "next_payer_balanced",
    "next_payer_round_robin",
    "advance_round_robin",
    "TurnResult",
    "paise_to_rupee_string",
    "build_upi_intent",
]
