"""User feedback / issue reports. Kept out of the oversized ``services.py``:
one small, self-contained concept (Spec has none — this is a product inbox).

The submitting user always comes from the JWT (passed as ``actor``); the client
can never attribute feedback to someone else.
"""

from domain import DomainError

from .models import Feedback

KINDS = ("issue", "feedback")
MAX_MESSAGE_LEN = 5000


def _to_dict(f: Feedback) -> dict:
    return {
        "id": f.id,
        "kind": f.kind,
        "message": f.message,
        "created_at": f.created_at.isoformat(),
    }


def submit_feedback(actor: int, message: str, kind: str) -> dict:
    message = (message or "").strip()
    if not message:
        raise DomainError("VALIDATION_ERROR", "message is required")
    if len(message) > MAX_MESSAGE_LEN:
        raise DomainError("VALIDATION_ERROR", "message is too long")
    # Unknown/absent kind falls back to "feedback" rather than rejecting — the
    # goal is to never lose an early user's report over a bad enum.
    kind = kind if kind in KINDS else "feedback"
    f = Feedback.objects.create(user_id=actor, kind=kind, message=message)
    return _to_dict(f)
