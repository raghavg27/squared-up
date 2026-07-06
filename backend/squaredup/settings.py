"""Django settings for the Squared Up backend.

Config via environment (12-factor). A local .env is loaded if present.
Database defaults match docker-compose.yml (Postgres). Money is integer paise;
no Django auth flow is used — the app has no login (actor is passed explicitly),
so contrib.auth stays only for the admin/migrations baseline.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(key: str, default: bool) -> bool:
    return os.environ.get(key, str(default)).lower() in ("1", "true", "yes", "on")


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-change-me")
# OAuth: Google Sign-In. Empty = feature disabled (endpoint returns a clear
# error). Set to the OAuth 2.0 Web client ID from Google Cloud Console; it must
# match the client_id the frontend initializes GIS with.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "core.middleware.RequestLogMiddleware",
]

ROOT_URLCONF = "squaredup.urls"
WSGI_APPLICATION = "squaredup.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

# Postgres is the system of record. Set USE_SQLITE=1 only for a fast, DB-less
# local test run (CI/dev convenience) — not for real data.
if env_bool("USE_SQLITE", False):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "dev.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "squaredup"),
            "USER": os.environ.get("POSTGRES_USER", "squaredup"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "squaredup"),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
    # Custom PyJWT auth for the bespoke User model (see core.auth).
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.auth.JWTAuthentication"],
    # Locked down by default; auth endpoints opt back into AllowAny.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "UNAUTHENTICATED_USER": None,
    # JSON-only API — no browsable API (avoids missing-static 500s in prod).
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

# Dev: allow the Vite frontend. In prod, restrict via CORS_ALLOWED_ORIGINS.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", True)
_cors_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "")
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]
    CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_HEADERS = ["content-type", "idempotency-key", "authorization"]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "squaredup.sms": {"handlers": ["console"], "level": "INFO"},
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# Production hardening (behind an nginx/TLS terminator).
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    if SECRET_KEY == "dev-insecure-change-me":
        import warnings

        warnings.warn("DJANGO_SECRET_KEY is unset — set a strong key in production.")
