# Squared Up

Split expenses with friends, settle in one UPI tap. India-first, free, ad-free —
the Splitwise people liked before it got worse. Built per the **PRD** and the
**Core Domain Specification** in this repo.

## What's here

Backend and frontend are separate apps in separate folders:

| Folder | What it is |
|---|---|
| `backend/domain/` | **Correctness core** — pure Python, framework-free money math (integer paise): largest-remainder split allocation, balance derivation, debt simplification, Turn to Pay, UPI intent. Fully tested against the spec's §14 vectors + Hypothesis property tests. |
| `backend/` (Django + DRF) | **Modular monolith** — Django REST Framework over PostgreSQL. `core` app: phone-OTP + JWT auth, directory (users/groups/friends), group membership, expenses (create/edit/delete), balances, turn, settlements, AI (NL entry + categorize). Idempotency keys, §11 error envelope, ORM models ported 1:1 from the canonical DDL. |
| `frontend/` | **Mobile-first PWA** — React + Vite + Tailwind + React Router. Full journey: register/login (phone OTP) → onboarding → home → groups → members → add/edit/delete expense → UPI settle → activity → friends → profile. Warm "Monzo-inspired" design system. Installable, service worker. |

## Run it — one command (Docker)

```bash
cp .env.example .env            # set DJANGO_SECRET_KEY for anything real
docker compose up --build       # Postgres + Django(gunicorn) + nginx frontend
```

Open **http://localhost:8080**. `SEED_DEMO=1` provisions demo users/groups on
first boot. Register with any 10-digit mobile number — since `SMS_PROVIDER=console`,
the OTP is logged by the backend **and** returned as `dev_code` (the frontend
auto-fills it), so no SMS gateway is needed to try the app.

## Run it — local dev (hot reload)

**1. Database:** `docker compose up -d postgres`

**2. Backend** (→ http://localhost:8000/api/v1):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed            # optional demo data
python manage.py runserver 8000
# (or set USE_SQLITE=1 to skip Postgres entirely)
```

**3. Frontend** (Vite PWA → http://localhost:5173, proxies `/api` → :8000):

```bash
cd frontend
npm install
npm run dev
```

Register with your mobile number, complete onboarding, create a group, add
members, split an expense, and settle up over UPI. Log in as a seeded phone
(e.g. `9000000001` = Aarav) to land in **Flat 304** / **Goa Trip** with data.

## Authorization model

Every group-scoped read/write (`groups/<id>`, `/expenses`, `/balances`, `/turn`,
group settlements) requires the caller to be an **active member** — outsiders
get 404 so ids can't be probed. Expenses are visible to their group's members
(personal ones only to their creator/participants); settlements can only be
confirmed/disputed by the two parties involved; `GET /users` returns only
people you already know (self, friends, co-members). Invites by phone number
are normalized to E.164 and deduped, so the invited placeholder and the account
that later signs in with that number are the same user. See
`tests/test_authz.py` for the enforced matrix.

## Auth model

Phone-OTP → JWT. `POST /auth/request-otp` issues a 6-digit code (hashed at rest,
rate-limited, attempt-capped); `POST /auth/verify-otp` verifies it, lazily
creates the user on first login, and returns `access` + `refresh` tokens. All
other endpoints require `Authorization: Bearer <access>`; the acting user is
taken from the token, never the request body. The frontend stores tokens, adds
the header, and transparently refreshes on 401.

### SMS delivery

`SMS_PROVIDER` selects the gateway (`core/sms.py`):

- `console` (default) — logs the OTP and returns it as `dev_code`; no gateway needed.
- `twilio` — real SMS via Twilio Programmable SMS (REST, authenticated with a
  Twilio **API Key**; no SDK dependency). Set in `backend/.env`:

  ```ini
  SMS_PROVIDER=twilio
  TWILIO_ACCOUNT_SID=AC…        # required
  TWILIO_API_KEY_SID=SK…        # required (API Key SID)
  TWILIO_API_KEY_SECRET=…       # required (API Key secret)
  TWILIO_FROM=+1…               # a Twilio number (or TWILIO_MESSAGING_SERVICE_SID=MG…)
  ```

  Keep each value on its own line — python-dotenv does not strip inline comments.
  With `twilio` selected, `dev_code` is never returned; users receive the code by SMS.

## Tests

```bash
cd backend
pytest tests/test_vectors.py tests/test_property.py   # pure domain, no DB
pytest                                                # + API tests (needs Postgres)
```

Every §14 vector and both invariant property suites are ported from the original
TypeScript domain tests.

## Spec fidelity

- **Money:** integer paise everywhere, no floats. Largest-remainder rounding
  (Core Spec §5.1) — leftover paise to largest fractional remainders,
  tie-break `(frac DESC, user_id ASC)`. Every §14 vector is a passing test.
- **Invariants I1–I9** enforced in `core/services.py`; `SUM(paid)=SUM(owed)=amount`
  asserted before persist.
- **Turn to Pay** (§9): balanced mode picks the most-behind rotation member;
  round-robin supported. Fairness derived only from `is_rotation` expenses (I8).
- **UPI settle** (§7): server builds the `upi://pay?...` intent only — Squared
  Up never touches money. Confirm-after-pay flow; manual fallback when no VPA.
- **Idempotency** (§12): `Idempotency-Key` header on mutations; replay returns
  the stored response, creates nothing new (I9).

## Scope built vs deferred

Built: phone-OTP + JWT auth, registration/onboarding, per-user authorization,
core splitting (all 5 split types, multiple payers), balances + debt
simplification, Turn to Pay, UPI settle, expense create/edit/delete, friends +
group membership management, NL entry + auto-categorize, activity feed,
offline-ready PWA, full mobile UI (all 10+ screens), Dockerized deployment.

Deferred / roadmap: real SMS + Google/Apple OAuth (seams in place —
`core/sms.py`, stub buttons), Splitwise import, FX conversion, realtime
WebSocket, Hindi i18n strings, receipt OCR, bank linking, native apps.
