# Frontend (Monzo skin) — agent guide

**This is the Monzo-concept redesign of `../frontend` — same functionality,
different skin.** Dev server runs on **:5174** (`npm run dev`), proxying
`/api` to the same Django backend on :8000; the classic frontend stays on
:5173. Visual language comes from `../../monzo-concept-ui` (Dribbble Monzo
shot): coral `#ff4d56` primary, navy `#14213c` ink, warm pink `#fdebea`
paper, teal `#0c829a` for incoming money, Mulish as the only face, soft
warm shadows, pill CTAs.

Mobile-first React 18 PWA. Vite + Tailwind v4 + React Router 6. No state
library — one context store. No frontend test suite: verify with
`npm run typecheck` after every change.

## The Monzo screen pattern

Every screen is a coral banner + white sheet:

1. `CoralBanner` (tab roots: title + bell + avatar) or `PageBanner`
   (sub-screens: back arrow + title + optional action) from `banners.tsx`;
2. a `monzo-sheet` `<main>` (`mx-3 -mt-9`, rounded 36px, grab `sheet-handle`)
   holding the content;
3. lists as borderless rows: 49px white `shadow-soft` icon tile (coral glyph),
   bold navy title, grey semibold sub, w800 amount (teal in / coral out);
4. primary action = `btn-coral` pill (red glow) or `rounded-full shadow-soft`
   white pill for secondary. Section headers are muted grey
   (`text-[16px] font-semibold text-neutral-600`), not navy headings.

Google Sign-In: the OAuth client must allowlist `http://localhost:5174` as an
origin or the button 403s (phone OTP is unaffected).

## File map (`src/`)

| File | Contents |
|---|---|
| `main.tsx` | Entry: Router + `StoreProvider` + `App`. |
| `App.tsx` | All routes + auth gating (`loading/anon/onboarding/ready`) + `Shell` (max-width column, route-fade). Add new screens here. |
| `store.tsx` | Global context: `auth` state machine, `me`, `users`/`userMap`, `groups`, `name(id)`, login/logout/reload. Access via `useStore()`. |
| `api.ts` | **All server types + calls.** Interfaces mirror backend JSON; `apiClient` methods per endpoint; token storage + transparent refresh-on-401 (`AuthExpiredError` → `su-auth-expired` event → store logs out). Add new endpoints here, typed. |
| `ui.tsx` | Shared kit: `Icon` (Material Symbols name), `Avatar`, `BottomNav`, `InviteCard`, `useCountUp`, `categoryStyle` (stored server label first, keyword guess fallback — never defaults to Food), `guessCategory`, `groupTypeStyle`. Check here before writing new UI primitives. |
| `banners.tsx` | The Monzo coral header bands: `CoralBanner` (tab roots — title/sub + notifications + account) and `PageBanner` (sub-screens — back + title + optional `action`). Pair with a `monzo-sheet` main. |
| `format.ts` | `rupees()/rupees0()/signedRupees()` — the only paise→display conversion. Never format money inline. |
| `upiApp.ts` | Preferred-UPI-app persistence + `preferredIntent()` rewrite of `upi://` links. |
| `share.ts` | `shareText()` — Web Share API with clipboard fallback. |
| `invite.ts` | `inviteLink()`/`shareInvite()` — build + share the `/login?invite=…&phone=/&email=/&name=` join deep-link; invitee dedupes onto the placeholder on sign-in. |
| `index.css` | Tailwind v4 `@theme` tokens — the Monzo palette (sampled from `monzo-concept-ui/src/styles/tokens.css`), Mulish fonts, Monzo shadows (`shadow-soft/lift/coral/banner/tile-*`) — plus the signature component classes (`monzo-sheet`, `sheet-handle`, `btn-coral`), animations (`route-fade`, `sheet-up`, `pop-in`, `stagger`, `donut-sweep`) and reduced-motion opt-out. |
| `AddExpense.tsx` | Add-expense sheet (group and personal) — NL-parse-first, saves with an Undo toast. Top-level, not in screens/. |
| `ExpenseForm.tsx` | Shared expense form: `useExpenseForm()` state/money-math hook + `ExpenseFormFields` (amount, description, date chip, category chip picker from `EXPENSE_CATEGORIES` — auto-suggested, user tap overrides; collapsible payer/split/participants; `itemize` prop hides the split editor). Used by `AddExpense` and `EditExpense`. |
| `ItemizeEditor.tsx` | Receipt itemization UI: scan a photo (`/ai/itemize` vision) or paste bill text, or add lines manually; tag each line with who shared it. `validateItems()` checks items vs. the grand total. Used by `AddExpense`. |
| `activityRows.tsx` | Shared activity-event renderer: `renderActivity()` (event → title/icon/amount row), `ActivityRow`, `activityBucket`. Used by `ActivityFeed` and Home's Recent activity, so deletes/comments/settlements read identically everywhere. |
| `charts.tsx` | Dependency-free SVG/flex charts for Insights: `CategoryDonut`, `MonthlyBars`, `GroupBars`, `StatTile`, plus `catColor`/`catIcon`. |
| `toast.tsx` | `ToastProvider` + `useToast()` — global bottom toast with optional action (e.g. Undo). Mounted in `main.tsx`. |
| `dataEvents.ts` | `emitDataChanged()` / `useDataChanged()` — window event telling screens to refetch after out-of-band mutations (e.g. Undo). |

## `src/screens/` — route → screen

Routes are defined in `App.tsx`; screen files match their names
(`/groups/:id` → `GroupDetail.tsx`, `/settle/:groupId/:toUserId` → `SettleUp.tsx`,
`/expense/:id` → `ExpenseDetail.tsx`, etc.). Auth screens: `Login`, `OtpVerify`,
`Onboarding`. Tab roots: `Home`, `GroupsList`, `Insights` (`/insights` — spending
charts/analytics), `ActivityFeed`, `Profile`. Profile sub-screens:
`EditProfile` (`/profile/edit`), `UpiAppSettings` (`/profile/upi-app`),
`Feedback` (`/profile/feedback` — bug report / product feedback → `POST /feedback`).
Home's Monzo pieces live in their own modules: `BalanceDonut.tsx` (the hero
donut — teal owed / red owe arcs, sweep animation) and `SquareUpMoves.tsx`
(the coral Square-Up pill + per-person pay/remind list).
Public legal pages (viewable logged-out; linked from Login): `/privacy` →
`Privacy.tsx`, `/terms` → `Terms.tsx`, both built on `LegalLayout.tsx`.
(The classic frontend's `/concept` sample does not exist here — this whole
app *is* the concept.)

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


## Project Instructions

Always use Context7 before writing code involving:

* React

* Next.js

* Tailwind CSS

* TypeScript

* Expo

* React Native

Always use Playwright after making UI changes.

Workflow:

1. Implement the requested feature.

2. Start the development server if needed.

3. Open the page with Playwright.

4. Compare the UI with the provided design.

5. Fix spacing, typography, colours, shadows, and responsiveness.

6. Repeat until there are no obvious visual differences.

Never guess framework APIs when Context7 can verify them.