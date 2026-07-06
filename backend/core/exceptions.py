"""Consistent error envelope (PRD §7.2): { error: { code, message, details? } }."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import (
    ValidationError,
    NotFound,
    NotAuthenticated,
    AuthenticationFailed,
    PermissionDenied,
    APIException,
)

from domain import DomainError


class ApiError(APIException):
    """Non-domain API error with an explicit code + status (e.g. missing header)."""

    def __init__(self, http_status: int, code: str, message: str | None = None):
        self.status_code = http_status
        self.code = code
        self.detail = message or code


def bad_request(code: str, message: str | None = None) -> ApiError:
    return ApiError(400, code, message)


def not_found(message: str = "Resource not found") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def api_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response(
            {"error": {"code": exc.code, "message": str(exc)}},
            status=exc.http_status,
        )
    if isinstance(exc, ApiError):
        return Response(
            {"error": {"code": exc.code, "message": str(exc.detail)}},
            status=exc.status_code,
        )
    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return Response(
            {"error": {"code": "UNAUTHORIZED", "message": str(exc.detail)}},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if isinstance(exc, PermissionDenied):
        return Response(
            {"error": {"code": "FORBIDDEN", "message": str(exc.detail)}},
            status=status.HTTP_403_FORBIDDEN,
        )
    if isinstance(exc, NotFound):
        return Response(
            {"error": {"code": "NOT_FOUND", "message": str(exc.detail)}},
            status=status.HTTP_404_NOT_FOUND,
        )
    if isinstance(exc, ValidationError):
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request body",
                    "details": exc.detail,
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    # Unknown error → 500 with a stable envelope.
    return Response(
        {"error": {"code": "INTERNAL", "message": "Internal server error"}},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
