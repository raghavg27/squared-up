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
| `itemize.py` | `allocate_items()` — itemized-bill split: per-line equal split + shared remainder (Spec §5 extension) |
| `simplify.py` | `simplify()` — greedy debt-graph reduction |
| `turn.py` | Turn to Pay (§9): balanced + round-robin next-payer |
| `upi.py` | `build_upi_intent()` — `upi://pay?...` string; `paise_to_rupee_string()` |
| `errors.py` | `DomainError`, `DomainErrorCode` |

Everything is re-exported from `domain/__init__.py`.

### `core/` — the Django app

| File | Contents |
|---|---|
| `models.py` | ORM, 1:1 with Spec §2 DDL (one deviation: `Group.type` is free text, not the `group_type` enum — users can define custom types). Money columns are `BigIntegerField` paise. Soft delete via `deleted_at`. |
| `services.py` | **All business logic**, grouped by `# ──` section headers: directory, friends, membership, expenses, comments, balances, turn, settlements, activity. Authz helpers at top (`require_group_member`, `require_expense_access`). |
| `views.py` | Thin DRF function views, one per route. `_actor(request)` reads the JWT user — never trust actor ids from the body. |
| `views_auth.py` | Public auth endpoints (request-otp, verify-otp, google, refresh, me). |
| `auth.py` | PyJWT encode/decode, `JWTAuthentication` (DRF class). Access + refresh token pair. |
| `auth_service.py` | OTP lifecycle: hashed codes, rate limit, attempt cap, lazy user creation, `normalize_phone()` → E.164. Google credential verify. |
| `membership_service.py` | Membership side-effects: `befriend()` (group co-members auto-become friends; backfilled by migration 0010) + `include_member_in_history()` (fold a new member into past *equal-split* expenses — exact/itemized untouched). Called from `add_group_member`/`create_group`. |
| `validators.py` | Request-body validation; raises domain/API errors before services run. `GROUP_TYPES` includes `personal` (solo tracker: no member_ids, rotation forced off). |
| `exceptions.py` | §11 error envelope: exception handler mapping codes → HTTP status. |
| `middleware.py` | Request plumbing (see file). |
| `sms.py` | OTP delivery seam: `console` (logs + returns `dev_code`) or `twilio` (REST, no SDK). Selected by `SMS_PROVIDER`. |
| `categories.py` | Canonical expense categories: `CATEGORIES` (the 10-item enum), `normalize_category()` (client text → canonical or None), `categorize()` (keyword rules). Single source of truth — LLM enums, validator, and analytics all use it; mirrored in frontend `api.ts` `EXPENSE_CATEGORIES`. |
| `ai.py` | NL expense parse (draft only — never writes). `parse_expense()` = Gemini first (via `ai_llm.py`), deterministic rules fallback. Both emit one contract; names always resolved against the caller's member list. Re-exports `categorize` from `categories.py`. |
| `ai_llm.py` | Gemini structured-output client for NL parse. All money math (rupee→paise, per-head, exact-share balancing) done server-side; any failure returns `None` → rules fallback. Needs `GEMINI_API_KEY`. |
| `ai_itemize.py` | Receipt itemization (`/ai/itemize`): Gemini **vision** (photo) or text → draft line items; deterministic line parser fallback. Draft only; money in paise. |
| `expense_items.py` | Itemized-bill helpers: `split_from_items()` (items → `exact` split via `domain.itemize`), `persist_items()`, `items_of()`. Keeps item logic out of `services.py`. |
| `analytics.py` | `spending_summary()` — the caller's own `owed` share aggregated by category / month / group for the Insights screen (`/analytics/summary`). Read-only. |
| `exports.py` | `build_group_xlsx(group_id, actor)` → `(bytes, filename)`. Splitwise-style ledger: expense + confirmed-settlement rows, per-member net columns, `Total balance` footer reconciling to `group_balances` (§6). Paise→rupees only here. Needs `openpyxl`. |
| `urls.py` | Full route table with comments — **read this first to find an endpoint**. |
| `management/commands/seed.py` | Demo data (`python manage.py seed`, or `SEED_DEMO=1` in Docker). |

### `tests/`

| File | Covers |
|---|---|
| `test_vectors.py` | Spec §14 vectors against `domain/` — no DB |
| `test_property.py` | Hypothesis invariants (I1–I9) — no DB |
| `test_authz.py` | Authorization matrix: outsider → 404, party-only settlement actions, etc. |
| `test_api.py` | End-to-end API flows (needs DB) |
| `test_hardening.py` | Stress-test regressions: OTP attempt cap, idempotency scoping, archived read-only, round-robin advance, search privacy, unfriend |
| `test_ai_parse.py` | NL parse: Gemini normalization (mocked, no network), rules fallback, /ai/parse endpoint contract |
| `test_export.py` | Group .xlsx export: reconciliation to balances, outsider → 404 |
| `test_itemize.py` | `domain.itemize.allocate_items` vectors — pure, no DB |
| `test_insights.py` | Itemized expenses (shares derived + persisted), `/analytics/summary` breakdowns + group-scope 404, `/ai/itemize` rules path |
| `test_categories.py` | Category keyword rules, `normalize_category` aliases, create/edit API round-trip (user's pick wins, garbage falls back to auto) |
| `test_group_types.py` | Group `type` free text: standard values pass, custom labels saved/normalized, 2-24 char bounds (deliberate deviation from Spec §2 enum) |
| `test_membership.py` | Membership side-effects: `include_history` re-splits equal expenses only, auto-friend on create/add (unfriend sticks), `personal` tracker is solo |

`conftest.py` wires Django settings for pytest.

## Rules when changing things

- New endpoint = route in `urls.py` + thin view + service function + authz check
  + test in `test_api.py` (and `test_authz.py` if group/party-scoped).
- Money math changes go in `domain/` with a vector or property test; services
  only orchestrate.
- Unauthorized access returns **404** (`NOT_FOUND`), not 403 — deliberate,
  prevents id probing. Don't "fix" this.
- Mutations take `Idempotency-Key`; response stored in `IdempotencyRecord`,
  keyed per endpoint + actor (one user's key never replays another's response).
- Schema changes need a migration (`python manage.py makemigrations core`) and
  must stay faithful to the Spec §2 DDL (table names are set via `db_table`).

## Env

`.env` at `backend/.env` (copy `.env.example`). Key vars: `DJANGO_SECRET_KEY`,
`USE_SQLITE`, `POSTGRES_*`, `SMS_PROVIDER` (+ `TWILIO_*`), `GOOGLE_CLIENT_ID`,
`GEMINI_API_KEY`/`GEMINI_MODEL` (NL parse LLM; empty key = rules-only),
`CORS_ALLOWED_ORIGINS`. No inline comments in `.env` — python-dotenv keeps them
as part of the value.
