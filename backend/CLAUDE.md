# Backend — agent guide

Django 5 + DRF modular monolith over Postgres (or SQLite with `USE_SQLITE=1`).
Layering rule: **views → services → domain**. Views stay thin (parse request,
call service, wrap response); business logic lives in `core/services.py`; pure
math lives in `domain/` and must never import Django.

## File map

### `domain/` — pure Python, no Django, no DB

| File | Contents |
|---|---|
| `money.py` | `allocate()` — largest-remainder paise allocation (Spec §5.1) |
| `split.py` | `compute_shares()` — all 5 split types, multiple payers |
| `balance.py` | `compute_nets()`, `assert_balanced()` — per-user nets from shares |
| `simplify.py` | `simplify()` — greedy debt-graph reduction |
| `turn.py` | Turn to Pay (§9): balanced + round-robin next-payer |
| `upi.py` | `build_upi_intent()` — `upi://pay?...` string; `paise_to_rupee_string()` |
| `errors.py` | `DomainError`, `DomainErrorCode` |

Everything is re-exported from `domain/__init__.py`.

### `core/` — the Django app

| File | Contents |
|---|---|
| `models.py` | ORM, 1:1 with Spec §2 DDL. Money columns are `BigIntegerField` paise. Soft delete via `deleted_at`. |
| `services.py` | **All business logic**, grouped by `# ──` section headers: directory, friends, membership, expenses, comments, balances, turn, settlements, activity. Authz helpers at top (`require_group_member`, `require_expense_access`). |
| `views.py` | Thin DRF function views, one per route. `_actor(request)` reads the JWT user — never trust actor ids from the body. |
| `views_auth.py` | Public auth endpoints (request-otp, verify-otp, google, refresh, me). |
| `auth.py` | PyJWT encode/decode, `JWTAuthentication` (DRF class). Access + refresh token pair. |
| `auth_service.py` | OTP lifecycle: hashed codes, rate limit, attempt cap, lazy user creation, `normalize_phone()` → E.164. Google credential verify. |
| `validators.py` | Request-body validation; raises domain/API errors before services run. |
| `exceptions.py` | §11 error envelope: exception handler mapping codes → HTTP status. |
| `middleware.py` | Request plumbing (see file). |
| `sms.py` | OTP delivery seam: `console` (logs + returns `dev_code`) or `twilio` (REST, no SDK). Selected by `SMS_PROVIDER`. |
| `ai.py` | NL expense parse + auto-categorize (draft only — never writes). |
| `urls.py` | Full route table with comments — **read this first to find an endpoint**. |
| `management/commands/seed.py` | Demo data (`python manage.py seed`, or `SEED_DEMO=1` in Docker). |

### `tests/`

| File | Covers |
|---|---|
| `test_vectors.py` | Spec §14 vectors against `domain/` — no DB |
| `test_property.py` | Hypothesis invariants (I1–I9) — no DB |
| `test_authz.py` | Authorization matrix: outsider → 404, party-only settlement actions, etc. |
| `test_api.py` | End-to-end API flows (needs DB) |

`conftest.py` wires Django settings for pytest.

## Rules when changing things

- New endpoint = route in `urls.py` + thin view + service function + authz check
  + test in `test_api.py` (and `test_authz.py` if group/party-scoped).
- Money math changes go in `domain/` with a vector or property test; services
  only orchestrate.
- Unauthorized access returns **404** (`NOT_FOUND`), not 403 — deliberate,
  prevents id probing. Don't "fix" this.
- Mutations take `Idempotency-Key`; response stored in `IdempotencyRecord`.
- Schema changes need a migration (`python manage.py makemigrations core`) and
  must stay faithful to the Spec §2 DDL (table names are set via `db_table`).

## Env

`.env` at `backend/.env` (copy `.env.example`). Key vars: `DJANGO_SECRET_KEY`,
`USE_SQLITE`, `POSTGRES_*`, `SMS_PROVIDER` (+ `TWILIO_*`), `GOOGLE_CLIENT_ID`,
`CORS_ALLOWED_ORIGINS`. No inline comments in `.env` — python-dotenv keeps them
as part of the value.
