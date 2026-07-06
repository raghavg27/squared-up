"""Lightweight JWT auth for the custom ``core.User`` model.

The project uses a bespoke User table (no Django auth, no password), so we mint
HS256 tokens with PyJWT and resolve them back to a ``User`` row in a DRF
authentication class. Two token kinds: short-lived ``access`` and longer
``refresh``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User

ACCESS_TTL = timedelta(minutes=30)
REFRESH_TTL = timedelta(days=30)


def _encode(user_id: int, kind: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "type": kind, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def issue_tokens(user_id: int) -> dict:
    return {
        "access": _encode(user_id, "access", ACCESS_TTL),
        "refresh": _encode(user_id, "refresh", REFRESH_TTL),
    }


def decode_token(token: str, expect: str) -> int:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise AuthenticationFailed("token expired")
    except jwt.InvalidTokenError:
        raise AuthenticationFailed("invalid token")
    if payload.get("type") != expect:
        raise AuthenticationFailed("wrong token type")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise AuthenticationFailed("invalid subject")


def refresh_access(refresh_token: str) -> dict:
    user_id = decode_token(refresh_token, "refresh")
    if not User.objects.filter(id=user_id).exists():
        raise AuthenticationFailed("user not found")
    return {"access": _encode(user_id, "access", ACCESS_TTL)}


class JWTAuthentication(BaseAuthentication):
    """Reads ``Authorization: Bearer <access>`` and loads the User."""

    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith(self.keyword + " "):
            return None  # let AllowAny / other auth decide
        token = header[len(self.keyword) + 1 :].strip()
        user_id = decode_token(token, "access")
        user = User.objects.filter(id=user_id).first()
        if not user:
            raise AuthenticationFailed("user not found")
        return (user, token)
