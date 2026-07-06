"""Test-session env. Set before Django settings load so `load_dotenv` (which is
non-overriding) keeps these — tests must use the console SMS provider so the OTP
flow works without a real gateway, regardless of what .env selects locally."""

import os

os.environ.setdefault("USE_SQLITE", "1")
# Force console provider for tests (overrides any .env SMS_PROVIDER=twilio).
os.environ["SMS_PROVIDER"] = "console"
