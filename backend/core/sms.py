"""SMS provider seam.

Providers (env ``SMS_PROVIDER``):
  * ``console`` (default) — logs the OTP; returns it as ``dev_code`` so the flow
    is testable with no gateway.
  * ``twilio``  — sends a real SMS via Twilio Programmable SMS (REST API,
    authenticated with a Twilio **API Key**). No SDK dependency; uses urllib.

Twilio env (see .env.example):
  TWILIO_ACCOUNT_SID          AC…  (required — account the number lives under)
  TWILIO_API_KEY_SID          SK…  (required — API Key SID, used as basic-auth user)
  TWILIO_API_KEY_SECRET       …    (required — API Key secret, basic-auth password)
  TWILIO_FROM                 +1…  (a Twilio number)  — OR —
  TWILIO_MESSAGING_SERVICE_SID MG… (a Messaging Service)
"""

import base64
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from domain import DomainError

log = logging.getLogger("squaredup.sms")

TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def send_otp(phone: str, code: str) -> None:
    provider = os.environ.get("SMS_PROVIDER", "console")
    if provider == "console":
        # Dev/local: code shows in the server log and (console only) in the
        # verify response, so no SMS account is needed to test the flow.
        log.warning("[DEV OTP] %s -> %s", phone, code)
        return
    if provider == "twilio":
        _send_twilio(phone, f"{code} is your Squared Up verification code. It expires in 10 minutes.")
        return
    raise RuntimeError(f"SMS_PROVIDER '{provider}' not configured")


def _require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise DomainError("VALIDATION_ERROR", f"{name} is not configured on the server")
    return val


def _send_twilio(to: str, body: str) -> None:
    account_sid = _require("TWILIO_ACCOUNT_SID")
    key_sid = _require("TWILIO_API_KEY_SID")
    key_secret = _require("TWILIO_API_KEY_SECRET")

    form = {"To": to, "Body": body}
    msg_service = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
    from_num = os.environ.get("TWILIO_FROM")
    if msg_service:
        form["MessagingServiceSid"] = msg_service
    elif from_num:
        form["From"] = from_num
    else:
        raise DomainError("VALIDATION_ERROR", "set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID")

    data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(TWILIO_API.format(sid=account_sid), data=data, method="POST")
    auth = base64.b64encode(f"{key_sid}:{key_secret}".encode()).decode()
    req.add_header("Authorization", f"Basic {auth}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
            log.info("Twilio SMS sent to %s (HTTP %s)", to, resp.status)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        log.error("Twilio send failed (HTTP %s): %s", e.code, detail)
        # Invalid-recipient errors are the user's fault → a clear, actionable
        # message. Everything else is a transient/server issue.
        if any(code in detail for code in ('"code": 21211', '"code":21211', '21614', '21610', '21408')):
            raise DomainError("VALIDATION_ERROR", "that mobile number doesn't look valid")
        raise DomainError("RATE_LIMITED", "couldn't send the code right now — try again")
    except urllib.error.URLError as e:
        log.error("Twilio network error: %s", e)
        raise DomainError("RATE_LIMITED", "couldn't send the code right now — try again")
