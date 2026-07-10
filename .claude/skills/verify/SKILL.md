---
name: verify
description: Build/launch/drive recipe for verifying Squared Up frontend+backend changes end-to-end in a real browser.
---

# Verifying Squared Up changes

## Handles

- **Docker stack** (`docker compose up`) serves the *built* image on :8080 — stale
  for uncommitted frontend work. Backend is published on **:8000** (URL prefix is
  `/api/v1`, not `/api`), Postgres creds `squaredup/squaredup/squaredup`.
- **Uncommitted frontend changes**: run `npm run dev` in `frontend/` (Vite :5173,
  proxies `/api` → :8000, so the docker backend works as the API).

## Login without a phone

`SMS_PROVIDER=console` (in `.env`) makes `POST /api/v1/auth/request-otp` return
`dev_code` in the response body; `POST /auth/verify-otp` with it returns
`{access, refresh}`. Set `localStorage.su_access` / `su_refresh` on :5173 and
reload — the app is logged in. **Rate limit: 5 OTP requests / 15 min / phone**
— cache tokens between script runs, or `delete from otp_codes where phone=...`
in the dev DB to reset.

## Browser driving

No Playwright in the repo. `npm i playwright-core` in the scratchpad and launch
the cached browser directly (skips the download):

```js
chromium.launch({ executablePath: HOME +
  '/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' })
```

Viewport 390×844 (mobile-first PWA). Screenshot with `animations: 'disabled'`
or shots capture first-frame of route-fade (page looks washed out — not a bug).

## Gotchas

- Segmented-control buttons render lowercase text with CSS `capitalize` — role
  name is `"equal"`/`"exact"`, so match `{ name: /^exact$/i }`.
- Test data: use group 3 (Raghav +919818476527 / user 4). DB is the user's live
  dev data — clean up expenses you create (Undo toast or Edit → Delete both work
  and are themselves worth driving). Expenses soft-delete (`deleted_at`).
- NL parse (`/ai/parse`) may fall back to rules if Gemini quota is dead; both
  paths return 200 with a draft.
