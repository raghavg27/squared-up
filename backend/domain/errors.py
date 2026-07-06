"""Domain error codes — Core Domain Spec §11. HTTP 422 unless noted."""

# code -> http status
HTTP_STATUS = {
    "PAYERS_SUM_MISMATCH": 422,
    "SPLIT_SUM_MISMATCH": 422,
    "PERCENT_SUM_INVALID": 422,
    "SHARES_INVALID": 422,
    "NEGATIVE_OWED": 422,
    "EMPTY_PARTICIPANTS": 422,
    "NOT_GROUP_MEMBER": 422,
    "ROTATION_PARTICIPANTS_MISMATCH": 422,
    "MEMBER_HAS_BALANCE": 409,
    "ROTATION_DISABLED": 404,
    # Auth / generic
    "VALIDATION_ERROR": 422,
    "INVALID_OTP": 400,
    "RATE_LIMITED": 429,
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "CONFLICT": 409,
}

DomainErrorCode = str  # one of HTTP_STATUS keys


class DomainError(Exception):
    """Raised by the domain layer; carries a stable code + HTTP status."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code
        self.http_status = HTTP_STATUS[code]
