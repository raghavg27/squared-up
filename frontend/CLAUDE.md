# Frontend — agent guide

Mobile-first React 18 PWA. Vite + Tailwind v4 + React Router 6. No state
library — one context store. No frontend test suite: verify with
`npm run typecheck` after every change.

## File map (`src/`)

| File | Contents |
|---|---|
| `main.tsx` | Entry: Router + `StoreProvider` + `App`. |
| `App.tsx` | All routes + auth gating (`loading/anon/onboarding/ready`) + `Shell` (max-width column, route-fade). Add new screens here. |
| `store.tsx` | Global context: `auth` state machine, `me`, `users`/`userMap`, `groups`, `name(id)`, login/logout/reload. Access via `useStore()`. |
| `api.ts` | **All server types + calls.** Interfaces mirror backend JSON; `apiClient` methods per endpoint; token storage + transparent refresh-on-401 (`AuthExpiredError` → `su-auth-expired` event → store logs out). Add new endpoints here, typed. |
| `ui.tsx` | Shared kit: `Icon` (Material Symbols name), `Avatar`, `BottomNav`, `InviteCard`, `useCountUp`, `categoryFor`, `groupTypeStyle`. Check here before writing new UI primitives. |
| `format.ts` | `rupees()/rupees0()/signedRupees()` — the only paise→display conversion. Never format money inline. |
| `upiApp.ts` | Preferred-UPI-app persistence + `preferredIntent()` rewrite of `upi://` links. |
| `share.ts` | `shareText()` — Web Share API with clipboard fallback. |
| `invite.ts` | `inviteLink()`/`shareInvite()` — build + share the `/login?invite=…&phone=/&email=/&name=` join deep-link; invitee dedupes onto the placeholder on sign-in. |
| `index.css` | Tailwind v4 `@theme` tokens (colors, radii) + animation classes (`route-fade`, `sheet-up`, `pop-in`, `stagger`) + reduced-motion opt-out. |
| `AddExpense.tsx` | Add-expense flow (group and personal) — top-level, not in screens/. |

## `src/screens/` — route → screen

Routes are defined in `App.tsx`; screen files match their names
(`/groups/:id` → `GroupDetail.tsx`, `/settle/:groupId/:toUserId` → `SettleUp.tsx`,
`/expense/:id` → `ExpenseDetail.tsx`, etc.). Auth screens: `Login`, `OtpVerify`,
`Onboarding`. Tab roots: `Home`, `GroupsList`, `ActivityFeed`, `Profile`.

## Conventions

- **Money**: all amounts are integer paise until the last render step through
  `format.ts`. No float arithmetic, no inline `/100`.
- **API**: never `fetch` directly — go through `apiClient` so auth headers and
  401-refresh apply. New endpoint = interface + method in `api.ts`.
- **Imports** use `.js` extensions (`from './store.js'`) — required by the TS
  module settings; keep the pattern.
- **Mutations** that need idempotency pass a UUID `Idempotency-Key` (see
  existing `apiClient` methods).

## Gotchas

- Tailwind v4: never define `--spacing-sm/md/lg/xl` in `@theme` — those names
  hijack `max-w-*`/`w-*` utilities silently.
- `route-fade` in `App.tsx` `Shell` must stay **opacity-only**; a transform
  creates a containing block that breaks the fixed `BottomNav`/FAB/sheets.
- PWA service worker (`vite-plugin-pwa`) caches builds — hard-refresh when a
  prod build looks stale.
