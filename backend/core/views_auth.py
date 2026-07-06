"""Auth endpoints: phone-OTP request/verify, token refresh, current-user
read/update. These are the only routes that stay public (AllowAny); everything
else requires a Bearer access token."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import auth_service, services
from .auth import refresh_access
from .exceptions import bad_request


@api_view(["POST"])
@permission_classes([AllowAny])
def request_otp(request):
    phone = request.data.get("phone")
    return Response(auth_service.request_otp(phone))


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp(request):
    phone = request.data.get("phone")
    code = request.data.get("code")
    return Response(auth_service.verify_otp(phone, code))


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_token(request):
    token = request.data.get("refresh")
    if not token:
        raise bad_request("VALIDATION_ERROR", "refresh token is required")
    return Response(refresh_access(token))


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    if request.method == "PATCH":
        return Response(services.update_user(request.user.id, request.data))
    return Response(services.user_to_dict(request.user))
