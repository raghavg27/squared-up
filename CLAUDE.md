# Squared Up — agent guide

Split-expenses PWA: React frontend + Django REST backend + pure-Python domain core.
India-first, UPI settle, money is **integer paise everywhere — no floats**.

## Layout

| Path | What lives there | Details |
|---|---|---|
| `backend/domain/` | Framework-free money math (split, balance, simplify, turn, UPI). No Django imports allowed here. | `backend/CLAUDE.md` |
| `backend/core/` | Django app: auth, views, services, models, validators. Views are thin; all logic in `services.py`. | `backend/CLAUDE.md` |
| `frontend/src/` | React + Vite + Tailwind v4 PWA. Screens in `src/screens/`, shared kit in `src/ui.tsx`. | `frontend/CLAUDE.md` |
| `Squared-Up-Core-Domain-Spec.md` | Canonical spec: DDL, invariants I1–I9, §14 test vectors. Domain changes must cite it. | — |
| `Squared-Up-PRD.md`, `DESIGN_BRIEF.md` | Product + visual design references. | — |
| `graphify-out/` | Generated knowledge graph of this repo (query with `/graphify`). | — |

## Commands

```bash
# Backend (from backend/, venv active; USE_SQLITE=1 skips Postgres)
pytest tests/test_vectors.py tests/test_property.py   # pure domain, no DB
pytest                                                # full suite (needs DB)
python manage.py runserver 8000

# Frontend (from frontend/)
npm run dev          # Vite dev server :5173, proxies /api -> :8000
npm run typecheck    # tsc --noEmit — run after any .ts/.tsx change
npm run build

# Full stack
docker compose up --build    # Postgres + gunicorn + nginx on :8080
```

## Code standards (all new/changed code)

1. **~300 lines max per file, one concept per file.** Name files so the path
   is documentation (`auth_service.py`, `screens/SettleUp.tsx`). Existing
   oversized files (`core/services.py`, `screens/Home.tsx`) are legacy — don't
   grow them; extract new logic into new modules. Don't refactor them unasked.
2. **Predictable structure over clever structure.** New backend endpoint =
   route + thin view + service function (see `backend/CLAUDE.md` recipe). New
   screen = file in `screens/` + route in `App.tsx`. Follow the existing
   pattern even if a "smarter" layout is possible.
3. **Python: type hints on every function signature** (params + return), as the
   existing services/domain code does.
4. **Comments explain *why*, not *what*.** No narration of the next line; state
   constraints the code can't show (see `App.tsx` Shell comment for the bar).

## Keeping these docs honest

CLAUDE.md files are part of the change, not an afterthought. In the **same
commit** that adds/renames/removes a module, route, endpoint, env var, or
command: update the file maps in `CLAUDE.md` / `backend/CLAUDE.md` /
`frontend/CLAUDE.md`. If a doc claim contradicts the code you're reading,
fix the doc.

## Non-negotiable invariants

- **Money**: integer paise (`amount_paise`), never floats. Largest-remainder
  rounding, tie-break `(frac DESC, user_id ASC)`. `SUM(paid) = SUM(owed) = amount`
  asserted before every persist.
- **Auth**: actor comes from the JWT (`request.user.id`), never from the request
  body. Every group-scoped endpoint requires active membership; outsiders get
  **404, not 403** (no id probing). Matrix enforced in `backend/tests/test_authz.py`.
- **Idempotency**: mutating endpoints require `Idempotency-Key` header; replays
  return the stored response (I9).
- **Errors**: every error is the §11 envelope `{"error": {"code", "message"}}` —
  see `backend/core/exceptions.py`.
- **UPI**: server only builds the `upi://pay?...` intent string; the app never
  moves money.

## Cross-cutting gotchas

- **Tailwind v4 spacing**: never name custom `--spacing-*` tokens `sm/md/lg/xl`
  in `frontend/src/index.css` — they hijack `max-w-*`/`w-*` utilities.
- **Route transitions**: `route-fade` (App.tsx Shell) must stay opacity-only;
  transforms break the fixed bottom nav / FAB / sheets.
- **python-dotenv**: no inline comments in `.env` files — values keep everything
  after `=`, comments included.
- Verify frontend changes with `npm run typecheck` (no frontend test suite);
  verify backend changes with `pytest`.
