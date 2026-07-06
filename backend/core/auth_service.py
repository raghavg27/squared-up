"""Phone-OTP registration/login. Codes are hashed at rest; verification is
rate-limited and attempt-capped. Issues JWTs on success and lazily creates the
User on first login (registration == first verified OTP)."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from domain import DomainError

from .auth import issue_tokens
from .models import OtpCode, User
from .services import user_to_dict
from .sms import send_otp

OTP_TTL = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(seconds=30)
MAX_PER_WINDOW = 5
RATE_WINDOW = timedelta(minutes=15)
MAX_ATTEMPTS = 5

_PHONE_RE = re.compile(r"^\+?[0-9]{8,15}$")


def normalize_phone(raw: str) -> str:
    if not isinstance(raw, str):
        raise DomainError("VALIDATION_ERROR", "phone is required")
    phone = re.sub(r"[\s\-()]", "", raw.strip())
    if not _PHONE_RE.match(phone):
        raise DomainError("VALIDATION_ERROR", "invalid phone number")
    if not phone.startswith("+"):
        # Default to India country code for bare 10-digit numbers.
        phone = "+91" + phone if len(phone) == 10 else "+" + phone
    return phone


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def request_otp(raw_phone: str) -> dict:
    phone = normalize_phone(raw_phone)
    now = timezone.now()

    recent = OtpCode.objects.filter(phone=phone, created_at__gte=now - RATE_WINDOW)
    if recent.count() >= MAX_PER_WINDOW:
        raise DomainError("RATE_LIMITED", "too many OTP requests, try again later")
    last = recent.order_by("-created_at").first()
    if last and (now - last.created_at) < RESEND_COOLDOWN:
        raise DomainError("RATE_LIMITED", "please wait before requesting another code")

    code = f"{secrets.randbelow(1_000_000):06d}"
    OtpCode.objects.create(phone=phone, code_hash=_hash(code), expires_at=now + OTP_TTL)
    # Send — if the gateway rejects, this raises and the client sees an error
    # instead of a false "code sent".
    send_otp(phone, code)

    resp = {"sent": True, "phone": phone, "expires_in": int(OTP_TTL.total_seconds())}
    # Only expose the code for the console provider (dev). Real SMS never leaks it.
    if os.environ.get("SMS_PROVIDER", "console") == "console":
        resp["dev_code"] = code
    return resp


@transaction.atomic
def verify_otp(raw_phone: str, code: str) -> dict:
    phone = normalize_phone(raw_phone)
    if not isinstance(code, str) or not code.strip():
        raise DomainError("VALIDATION_ERROR", "code is required")
    now = timezone.now()

    otp = (
        OtpCode.objects.select_for_update()
        .filter(phone=phone, consumed_at__isnull=True, expires_at__gte=now)
        .order_by("-created_at")
        .first()
    )
    if not otp:
        raise DomainError("INVALID_OTP", "no valid code — request a new one")
    if otp.attempts >= MAX_ATTEMPTS:
        raise DomainError("INVALID_OTP", "too many attempts — request a new code")

    otp.attempts += 1
    if _hash(code.strip()) != otp.code_hash:
        otp.save(update_fields=["attempts"])
        raise DomainError("INVALID_OTP", "incorrect code")

    otp.consumed_at = now
    otp.save(update_fields=["attempts", "consumed_at"])

    user = User.objects.filter(phone=phone).first()
    is_new = user is None
    if is_new:
        # Placeholder name until onboarding; user fills it in next.
        user = User.objects.create(phone=phone, name="")

    return {"is_new": is_new, "user": user_to_dict(user), **issue_tokens(user.id)}


@transaction.atomic
def google_login(credential: str) -> dict:
    """Verify a Google ID token (the ``credential`` a GIS client returns) and
    log the holder in, creating the User on first sign-in. Identity is keyed on
    the verified Google email, so a Google account and a phone account that
    share an email resolve to the same User."""
    if not isinstance(credential, str) or not credential.strip():
        raise DomainError("VALIDATION_ERROR", "google credential is required")

    client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise DomainError("CONFIG_ERROR", "Google sign-in is not configured")

    # Imported lazily so the dependency is only needed when the feature is used.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        info = id_token.verify_oauth2_token(
            credential.strip(), google_requests.Request(), client_id
        )
    except ValueError:
        # Bad signature, wrong audience, expired, or malformed token.
        raise DomainError("INVALID_CREDENTIAL", "could not verify Google sign-in")

    email = info.get("email")
    if not email or not info.get("email_verified"):
        raise DomainError("INVALID_CREDENTIAL", "Google account email is not verified")
    email = email.strip().lower()

    user = User.objects.filter(email=email).first()
    is_new = user is None
    if is_new:
        user = User.objects.create(
            email=email,
            name=info.get("name") or "",
            avatar_url=info.get("picture"),
        )

    return {"is_new": is_new, "user": user_to_dict(user), **issue_tokens(user.id)}
