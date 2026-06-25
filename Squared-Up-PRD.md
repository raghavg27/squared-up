# Squared Up — Product Requirements Document

| | |
|---|---|
| **Product** | Squared Up — split expenses with friends, settle in one tap via UPI |
| **Version** | 1.0 (Launch PRD) |
| **Status** | Draft for engineering review |
| **Primary market** | India |
| **Platform at launch** | Mobile-first Progressive Web App (PWA); native apps are future scope |
| **Pricing** | Free, no ads |

---

## 1. Overview

### 1.1 The problem
Splitting shared expenses among friends, roommates, and travel groups is a universal source of low-grade friction and the occasional ruined friendship. Splitwise solved this well — and then made its free tier worse: a hard limit of roughly three expenses per day, ads between screens, and several genuinely useful features (currency conversion, spending charts, search, default splits) moved behind a paywall.

That degradation is the opening. **Squared Up is not "a better Splitwise" — it is the Splitwise people already liked, before it got worse, rebuilt India-first.** Everything Splitwise now charges for, we give away. On top of that, we add the two things Splitwise does poorly in India: one-tap **UPI settlement** and **natural-language expense entry that understands how Indians actually type** (code-mixed Hindi/English).

### 1.2 The strategy in one line
Reach feature parity with Splitwise's free *and* paid tiers, remove every paywall and ad, make settling a debt a single UPI tap, and make logging an expense feel like sending a text message — then make migrating your entire history a guided, one-tap flow so users have no reason to stay.

### 1.3 Why this can win
- **Cost wedge:** Splitwise's tightening free tier and ads create active dissatisfaction we convert into switching intent.
- **India fit:** UPI settlement and code-mixed input are things the incumbent structurally does not do well here.
- **Settle less, not just faster:** *Turn to Pay* nominates who pays the next bill so group balances stay near zero and members rarely need to square up at all — a fairness feature Splitwise doesn't offer.
- **Migration is frictionless:** Splitwise exposes a public REST API; we use it to pull a user's groups, friends, and expenses on their consent, so switching does not mean losing years of history.
- **Network effects, handled:** the unit of adoption is a *group*, not a person. Import pulls whole groups across at once, and non-users can participate before they ever sign up.

---

## 2. Goals and non-goals

### 2.1 Goals (v1)
1. Full parity with Splitwise core + Pro features (minus the deliberately deferred ones in §3).
2. One-tap UPI settlement as the signature feature.
3. **Turn to Pay** — a fairness rotation that nominates who pays next so balances stay near zero and squaring-up becomes rare.
4. Natural-language expense entry and silent auto-categorization.
5. Frictionless one-tap migration from Splitwise.
6. A web app that feels instant on a mid-range Android phone over a patchy 3G/4G connection.
7. An engineering foundation that is robust, correct with money, and simple enough for a small team to understand and extend.

### 2.2 Non-goals (v1) — see §3 for rationale
- Bank/card account linking.
- Receipt scanning / OCR / auto-assign.
- Settlement rails outside India (UPI-only at launch).
- Native iOS/Android apps.
- Any paid tier or advertising.

### 2.3 Guiding principles
- **Free forever for the core.** We only ever monetize genuinely expensive extras, and never with ads (§14).
- **Correctness over cleverness when money is involved.** Balances are sacred.
- **Fast on weak hardware and weak networks.** Performance is a feature, not a polish item.
- **Robust yet legible.** We choose the simplest architecture that is correct, and we write down what we deliberately do *not* build (§7.7).

---

## 3. Scope and explicit decisions

| Area | Decision | Rationale |
|---|---|---|
| Core Splitwise free features | **In v1** | Table stakes — parity or users won't switch. |
| Splitwise Pro features (unlimited expenses, no ads, currency conversion, charts, search, default splits) | **In v1, free** | This is the migration argument. |
| UPI one-tap settle-up | **In v1 (hero feature)** | India-first differentiator. |
| Turn to Pay (fairness rotation) | **In v1** | Squared-Up original; nominates the most-behind member to pay next, minimizing how often anyone has to settle. |
| Natural-language entry + silent auto-categorization | **In v1** | Removes the biggest friction; strong demo; India-specific edge via code-mixed parsing. |
| Import / migrate from Splitwise | **In v1** | Removes the #1 reason users stay put. |
| Bank/card account linking | **Deferred (post-launch)** | US-only on Splitwise; requires a regulated data-aggregator (e.g., account aggregator framework), KYC, and ongoing cost. Conflicts with free/lightweight launch. |
| Receipt scanning / OCR auto-assign | **Out of v1** | Per-image vision-model cost is hard to sustain on a free tier at launch; revisit when there's a monetization path. |
| Settlement outside India | **Out of v1** | App is India-first; UPI-only. Architecture leaves a pluggable settlement interface for later. |
| Native mobile apps | **Future scope** | PWA delivers a no-compromise mobile experience now; codebase is structured for a later React Native port. |

---

## 4. Target users and core use cases

**Primary users:** Indians aged ~18–40 who share recurring or trip expenses.

| Persona | Scenario | What they need |
|---|---|---|
| Flatmates | Rent, electricity, maid, groceries, Wi-Fi, monthly | Recurring expenses, running balances, simple monthly settle-up over UPI |
| Trip group | A week in Goa: cabs, stays, restaurants, activities | Fast bulk entry (no daily cap), unequal splits, currency conversion when abroad, end-of-trip settle |
| Couples | Shared dinners, dates, household | Default split (e.g., 60/40), private 1:1 balance |
| Friend circle | Frequent dinners, movies, cab pools | Quick entry, debt simplification, one-tap UPI to square up |

**Key insight:** every persona ends at the same moment — *"who owes whom, and let me just pay it."* That moment is our hero flow, and in India it should be a single UPI tap.

---

## 5. Functional requirements

### 5.1 Core expense splitting (parity)

- **Groups and 1:1 friendships.** A user can create groups (Trip, Home, Couple, Other) or have a direct friendship. Balances net across all groups *and* private expenses with a person.
- **Adding people.** By phone number (primary in India), email, or a shareable invite link. **Non-users can be added and participate** — they receive an invite and can see/settle via link before installing anything. This is critical for overcoming network effects.
- **Expenses.** Each expense has: amount, currency (INR default), payer(s), participants, split, category, date, optional note, optional comment thread.
- **Multiple payers** on a single expense (e.g., two people covered one bill).
- **Split types:** equally, by exact amounts, by percentage, by shares, and by adjustments. This flexibility is the heart of the product and is non-negotiable.
- **Default group splits** (e.g., a couple permanently 60/40; families by shares) — set once, applied automatically.
- **Recurring expenses:** weekly, fortnightly, monthly, yearly (rent, subscriptions).
- **Debt simplification:** collapse circular debts so fewer payments are needed (A→B→C becomes A→C). High-value, much-loved feature; see the Core Domain Spec §8 for the algorithm.
- **Activity feed, push notifications, edit history, soft-delete with restore.** Every change is transparent and reversible.
- **CSV export** of expenses and balances.
- **Search** across all expenses (free here; Pro-gated on Splitwise).

### 5.2 UPI one-tap settlement (hero feature)

The signature flow. When a user has a balance with someone, the **Settle Up** button constructs a prefilled UPI intent.

- **Mechanics:** tapping "Settle ₹450 with Rahul" fires a standard UPI deep link:
  `upi://pay?pa=<rahul_vpa>&pn=<Rahul>&am=450.00&cu=INR&tn=<note>`
  This opens the user's UPI app chooser (GPay / PhonePe / Paytm / BHIM) with payee, amount, and note prefilled. The payer confirms inside their own UPI app.
- **Prerequisite:** to be *paid* via this flow, a user must have a UPI VPA saved in their Squared Up profile. Onboarding and profile prompt for it; if a recipient has no VPA on file, we fall back to "Mark as settled" (manual record).
- **Deliberate compliance advantage:** **Squared Up never touches money.** We only build the intent link; the licensed UPI apps move the funds. This means **no payment-aggregator licence, no PCI-DSS scope, no settlement liability** — a major reason this is feasible for a free app.
- **Confirmation flow (honest UX):** UPI intents do not reliably return success status to a web app. So the flow is: fire intent → user pays in their UPI app → returns to Squared Up → we ask "Did the payment go through?" → on confirm, we record the settlement and update balances. Both parties get a notification; either can dispute, which reopens the balance.
- **Partial settlements** are supported (pay part of a balance).

### 5.3 The "free wedge" (Splitwise Pro features, given free)
- **Unlimited expenses** — no daily cap. (Splitwise's ~3/day limit is the single biggest trip pain point.)
- **No ads** — anywhere, ever.
- **Currency conversion** — record expenses in any currency and auto-convert to the group's base currency using daily FX rates (useful for Indians travelling abroad). Rates fetched from a free/low-cost FX source, cached daily.
- **Spending insights** — charts and category breakdowns over time.
- **Search and default splits** — both free, as above.

### 5.4 AI features

**Natural-language expense entry (build first).**
- User types free text; an LLM returns a structured expense for one-tap confirm.
- Example: `"dinner 1800, I paid, split with Rahul and Priya"` → ₹1800, paid by me, split equally three ways, category Food → shown for confirmation.
- **India edge:** the model parses code-mixed input a rules engine never could — e.g., `"chai ke 200 Rahul ke saath"` or `"auto 150 mera, baaki Priya ka"`.
- **Implementation:** a single server-side LLM call returning JSON mapped to the expense schema; short input, short output, a small/cheap model suffices.
- **Two hard rules (see §9):** (1) AI entry is never the *only* path — the manual form is always one tap away, and works fully offline. (2) Nothing is written to a balance until the user confirms the parsed result.

**Silent auto-categorization.**
- Every expense is tagged (Food, Travel, Rent, Groceries, Entertainment…) from its description in the background. Mostly rules with a small-model fallback for robustness. Zero UI friction, feeds the spending charts. Users can override; overrides train future suggestions.

### 5.5 Import / migrate from Splitwise

Removes the biggest reason users stay. Two paths:

- **Primary — OAuth import.** User connects their Splitwise account via Splitwise's OAuth 2.0 (Authorization Code + PKCE). We call `get_groups`, `get_friends`, and `get_expenses`, then reconstruct groups, members, historical expenses, and current balances inside Squared Up. Presented as a guided, one-tap-feeling flow with a progress view.
- **Fallback — CSV upload.** For users who prefer not to connect accounts, ingest Splitwise's CSV export.
- **Engineering constraints to respect:** Splitwise enforces conservative API rate limits (expect HTTP 429; use exponential backoff and run imports as background jobs). The import only ever reads the user's *own* consented data. Note Splitwise's API Terms of Use in the build; the CSV path is the conservative fallback if API access is ever restricted.
- **Mapping concerns:** Splitwise categories map to ours via a lookup table; non-user group members map to placeholder contacts that can later be matched to real Squared Up users by phone/email.

### 5.6 Turn to Pay (fairness rotation)

Splitting every bill spawns many small debts that someone then has to chase and settle. Turn to Pay removes most of that churn: in a rotation-enabled group, the app nominates **one person to pay the whole bill each time** — the member currently most "behind" — so over time everyone contributes roughly equally and balances stay near zero. The result is **minimal squaring-up**: members can settle whenever they like, but rarely need to.

- **"It's Rahul's turn to pay."** A rotation group prominently shows whose turn it is. When anyone adds an expense, the app pre-fills the suggested payer, splits it equally among rotation members, and tags it as a rotation expense — all editable.
- **Balanced mode (default):** the most-behind member (paid least relative to their share) is nominated next; paying the full bill rebalances them toward zero. **Round-robin mode (optional):** a fixed cyclic order for groups that prefer strict predictability.
- **Honest by design:** debts are **not** abolished — each rotation bill is still recorded and split equally, so balances stay exact and auditable. Turn to Pay simply chooses the payer so the *outstanding-settlement set stays tiny*.
- **Self-correcting:** because the suggestion is computed from live balances, paying out of turn and members joining or leaving all "just work" — the next suggestion reflects the new balances. A member with an outstanding balance can't leave the rotation until settled.
- **Why it matters here:** it amplifies the UPI story — fewer, smaller settlements means the occasional UPI tap is all that's left. Splitwise has no equivalent.

Full algorithm (the "most-behind pays next" rule, tie-breaks, edge cases, API, and worked examples) is specified in the **Core Domain Specification §9**.

---

## 6. UX principles (non-negotiable)

The whole pitch is "as good as what they have, but free and friendlier." UX regressions are launch blockers.

- **Instant feel.** Optimistic UI: an action reflects immediately, syncs in the background. Logging an expense must feel like it already happened.
- **Works offline.** Expense entry, viewing balances, and editing must work with no connection. Mutations queue locally and sync when back online. Indian users on trips and weak networks depend on this.
- **Low-spec friendly.** Small JS bundle, code-splitting, lazy loading, optimized images. Smooth on a 3-year-old ₹12k Android phone.
- **Minimal taps to the common case.** Add expense and settle up are each reachable in one or two taps from anywhere.
- **Forgiving.** Soft-delete + restore, edit history, and a confirm step before money-affecting writes.
- **Localized.** English and Hindi at launch (framework ready for more Indian languages). ₹/INR formatting (lakh/crore where appropriate).

---

## 7. System architecture (overview)

```
                 ┌──────────────────────────────────────┐
                 │         PWA (React + TypeScript)       │
                 │  Service Worker · IndexedDB outbox      │
                 │  Optimistic UI · offline-first cache    │
                 └───────────────┬───────────────────────┘
                                 │ HTTPS (REST /api/v1) + WebSocket
                 ┌───────────────▼───────────────────────┐
                 │   Modular monolith API (Node + TS)      │
                 │  Auth · Groups · Expenses · Settlements │
                 │  Import · AI gateway · Notifications     │
                 └───┬─────────┬──────────┬──────────┬────┘
                     │         │          │          │
              ┌──────▼──┐ ┌────▼───┐ ┌────▼────┐ ┌───▼─────┐
              │Postgres │ │ Redis  │ │ Worker  │ │ Object   │
              │(source  │ │(cache, │ │(BullMQ  │ │ storage  │
              │of truth)│ │ psubsub│ │ jobs)   │ │(avatars, │
              │         │ │ rate-  │ │         │ │ exports) │
              │         │ │ limit) │ │         │ │          │
              └─────────┘ └────────┘ └────┬────┘ └──────────┘
                                          │
                          ┌───────────────┼────────────────┐
                          ▼               ▼                ▼
                     LLM API         Splitwise API      FX rates API
                  (NL parsing)    (OAuth import)      (daily convert)
```

### 7.1 Frontend — PWA
- **Stack:** React + TypeScript, Vite, Tailwind CSS. Chosen so a future **React Native** port reuses most logic and all types.
- **Offline-first:** a Service Worker caches the app shell; an **IndexedDB outbox** holds pending mutations created offline.
- **Server state:** a query/cache layer (e.g., React Query) with optimistic updates and background revalidation.
- **Realtime:** WebSocket subscription per group so a member's new expense appears live; degrades gracefully to polling.
- **Installable:** add-to-home-screen, app icon, splash — feels native without an app store.

### 7.2 Backend — a modular monolith (deliberately not microservices)
- **Stack:** Node.js + TypeScript, organized as clean modules (Auth, Users/Friends, Groups, Expenses, Settlements, Import, AI Gateway, Notifications) with dependency injection and clear boundaries.
- **Why a monolith:** at launch scale, a well-structured modular monolith is faster to build, easier to reason about, trivial to deploy, and avoids distributed-systems complexity. Module boundaries are drawn so any module can later be extracted into a service if load demands it. This is the "robust yet easy to understand" choice.
- **API:** versioned REST (`/api/v1`), consistent error envelope, proper status codes. Runtime validation at every boundary (e.g., zod), with types shared between client and server to eliminate drift.

### 7.3 Data model (key entities)

Money is stored as **integers in paise** (smallest currency unit). Never floats — this prevents rounding errors in splits and balances.

| Table | Key fields |
|---|---|
| `users` | id, phone (unique), email, name, avatar_url, upi_vpa, default_currency, locale |
| `friendships` | user_a, user_b, status |
| `groups` | id, name, type, cover_url, base_currency, default_split_config (JSON) |
| `group_members` | group_id, user_id, role, joined_at |
| `expenses` | id, group_id (nullable for 1:1), description, amount_paise, currency, category_id, date, created_by, deleted_at |
| `expense_payers` | expense_id, user_id, paid_paise *(supports multiple payers)* |
| `expense_splits` | expense_id, user_id, owed_paise, split_meta (share/percent for re-edit) |
| `settlements` | id, from_user, to_user, amount_paise, method (upi/manual), status, group_id (nullable), confirmed_at |
| `comments` | expense_id, user_id, body, created_at |
| `activity_events` | actor, type, target, payload, created_at |
| `categories` | id, parent_id, name, icon |
| `import_jobs` | id, user_id, source, status, counts, error |

- **Invariant:** for every expense, `sum(paid_paise) == sum(owed_paise) == amount_paise`. Enforced in code and tested.
- **Balances** are derived from expenses and settlements (a ledger), cached in Redis and recomputed on change.

### 7.4 Infrastructure
- **Database:** PostgreSQL — relational integrity and ACID transactions are essential for financial data.
- **Cache / pub-sub / rate-limiting:** Redis.
- **Async jobs:** **BullMQ on Redis** for background work — push notifications, recurring-expense generation, Splitwise import, FX refresh, LLM offload. (See §8.7 on why not RabbitMQ/Kafka yet.)
- **Object storage:** S3-compatible (e.g., Cloudflare R2 / AWS S3) for avatars, group covers, CSV exports.
- **Hosting & region:** deploy in an India region (e.g., Mumbai / `ap-south-1`) for low latency to the primary user base. Static PWA assets served via CDN/edge.
- **Containerization:** Docker; reproducible environments from dev to prod.

### 7.5 Money correctness (the part we cannot get wrong)
- Integer paise everywhere; a single rounding policy for split remainders (largest-remainder method so splits always sum exactly to the total — the leftover paisa is assigned deterministically).
- Every expense write (expense + payers + splits) happens in **one database transaction** — all or nothing.
- **Idempotency keys** on all mutating requests so the offline outbox can safely retry without double-posting an expense.

### 7.6 Debt simplification (algorithm)
- Compute each member's **net balance** (total paid − total owed) within a settlement scope.
- Greedily match the largest creditor to the largest debtor, settle the smaller of the two amounts, repeat until all nets are zero.
- The provably-minimal-transaction version is NP-hard; this greedy heuristic is what production splitters use and produces near-minimal results instantly. Toggleable per group (some users prefer to see raw who-paid-what).

### 7.7 What we deliberately do NOT build yet (and why)
Engineering maturity is as much about what you omit as what you ship.

| Not building (yet) | Why |
|---|---|
| **Microservices** | Distributed complexity with no scale to justify it; the modular monolith extracts cleanly later. |
| **Kafka** | Event-streaming/high-throughput log is overkill at launch; BullMQ covers our async needs. Revisit if we need durable event streaming or analytics fan-out. |
| **RabbitMQ (at launch)** | A separate broker is one more thing to operate. BullMQ-on-Redis gives us reliable jobs with infra we already run. Move to RabbitMQ when we need complex routing/guaranteed-delivery semantics beyond BullMQ. |
| **InfluxDB** | We don't have a time-series metrics need that Prometheus/Grafana won't serve. Don't add a database for a problem we don't have. |
| **Receipt OCR / bank linking** | Scope decisions in §3 — cost and compliance. |

---

## 8. Engineering best practices

- **End-to-end type safety:** shared TypeScript types across client/server; runtime validation (zod) at all boundaries.
- **Database access:** a typed query builder/ORM (e.g., Prisma or Drizzle) with **versioned migrations** in source control. No raw string SQL; parameterized everywhere.
- **Authentication:** phone + OTP primary (Google and email as alternatives) → short-lived JWT access token + rotating refresh token. OTP requests are rate-limited and abuse-monitored.
- **Authorization:** every resource access checks group membership / friendship. No object is returned without an ownership check.
- **Testing strategy (correctness-first):**
  - **Unit tests** with heavy coverage on split math, rounding, balance computation, and debt simplification — this is the core correctness surface and gets property-based tests (random splits must always reconcile to the total).
  - **Integration tests** on API + DB (transactions, idempotency, import mapping).
  - **End-to-end tests** on the critical flows: add expense, settle via UPI, import from Splitwise, offline-then-sync.
- **Security:** OWASP basics, input validation, output encoding, secrets in a vault/manager (never in code), HTTPS only, per-endpoint rate limits, dependency scanning in CI.
- **Privacy & compliance:** designed for India's **DPDP Act 2023** — explicit consent, data minimization (we store only what we need), user-initiated data export and account deletion, and India data residency. Phone numbers and UPI VPAs treated as sensitive (encrypted at rest).
- **Observability:** structured JSON logging with request tracing, error tracking (e.g., Sentry), health/readiness endpoints, and metrics (Prometheus/Grafana). Alerting on error-rate and latency budgets.
- **CI/CD:** GitHub Actions — lint, typecheck, test, build, and deploy on green. Preview environments for PRs. Feature flags for risky launches (e.g., AI entry, import).
- **Performance discipline:** bundle-size budget enforced in CI; code-splitting and lazy routes; image optimization; payload compression; query/caching to keep API responses fast on weak networks.

---

## 9. Two AI rules treated as architecture (because it's money and cost)
1. **AI is the fast lane, never the only road.** NL entry requires a network call and can fail or misread. The manual form is always one tap away and works fully offline. We never let an AI dependency break the core loop.
2. **Always confirm before committing.** AI parses → the structured expense is shown → the user confirms or edits → only then does it write to balances. One extra tap buys correctness and trust on the one surface where errors are unacceptable. Cost is contained with a small model, per-user server-side rate limits, and caching.

---

## 10. Non-functional requirements

| Category | Target |
|---|---|
| **Performance** | App interactive in ≤ ~3s on a mid-range Android over 3G; core interactions feel instant via optimistic UI. |
| **Offline** | Add/edit expenses and view balances fully functional offline; auto-sync on reconnect with no double-posting. |
| **Availability** | 99.9% target for the API; graceful degradation (read-only / queued writes) on partial outages. |
| **Scalability** | Comfortably handle the early user base on a modular monolith; documented extraction path for hotspots. |
| **Security** | OWASP-aligned; encrypted sensitive PII; rate-limited auth. |
| **Privacy** | DPDP-compliant consent, export, and deletion. |
| **Localization** | English + Hindi at launch; ₹/INR formatting; framework-ready for more Indian languages. |

---

## 11. Success metrics

| Metric | Why it matters |
|---|---|
| **Activation:** % of new users who log their first expense within 24h | The core "aha." |
| **Import completion rate** | Migration is the growth engine — measure it directly. |
| **Group creation / invite acceptance** | Network-effect health; are whole groups coming across? |
| **Settle-up usage (UPI taps)** | Validates the hero feature. |
| **Settlements avoided** — average outstanding settlements per active rotation group (lower is better) | Validates Turn to Pay's promise of minimal squaring-up. |
| **% of expenses created via NL entry** | Friction-reduction signal and India-edge validation. |
| **D7 / D30 retention** | The real proof users switched, not just tried. |
| **Performance (p75 TTI on low-end devices/3G)** | Performance is a feature; regressions are bugs. |

---

## 12. Phased roadmap

| Phase | Scope | Outcome |
|---|---|---|
| **0 — Foundations** | Repo, CI/CD, auth (phone OTP), data model + migrations, observability skeleton | A deployable skeleton with the correctness primitives in place. |
| **1 — Core parity (MVP)** | Groups, friends, expenses, all split types, multiple payers, balances + debt simplification, recurring, comments, activity, soft-delete/restore, offline outbox + sync | A usable, correct splitting app. |
| **2 — UPI + the wedge** | UPI settle-up flow, Turn to Pay rotation, currency conversion, charts, search, default splits, CSV export | The differentiators and the "free Pro" pitch. |
| **3 — AI + migration** | NL entry (code-mixed), silent auto-categorization, Splitwise OAuth import + CSV fallback | The growth engine and the friction-killer. |
| **4 — Harden + launch** | Performance budgets, low-spec QA, Hindi localization, security pass, DPDP review | Ship-ready, live to Indian users. |
| **Future** | Native apps (React Native), receipt scanning, bank/account-aggregator linking, expansion beyond India, monetization (§14) | Post-launch growth. |

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Network effects** — a group only works if everyone joins | Non-users participate via invite link before signup; import brings whole groups across at once; frictionless phone-based invites. |
| **Splitwise API ToS / rate limits** for import | OAuth-primary with CSV fallback; respect rate limits with backoff and background jobs; only the user's own consented data; honor API Terms. |
| **UPI deep-link inconsistency** across apps | Use the standard UPI intent URL; test across GPay/PhonePe/Paytm/BHIM; always offer "Mark as settled" fallback; explicit "did it go through?" confirmation since UPI intents don't reliably return status. |
| **LLM cost/latency** on a free tier | Small/cheap model, caching, per-user rate limits, manual fallback; route on-device later if viable. |
| **Money correctness bugs** | Integer paise, single-transaction writes, idempotency keys, property-based tests on split/balance math, full audit log. |
| **Cost of "free" at scale** | Lean infra (monolith, Redis-backed jobs, India region), and a planned, non-intrusive sustainability path (§14). |
| **DPDP non-compliance** | Consent-first design, data minimization, export/delete, India residency from day one. |

---

## 14. Sustainability and future monetization (planning note)

The core stays **free forever and ad-free** — that is the entire reason to switch, and breaking it would repeat the mistake we're exploiting. But "free" has real recurring cost (servers, FX, LLM calls, push). We plan a path that monetizes only genuinely expensive extras, never the core, and never with ads:

- **Optional "Supporter" one-time unlock** — cosmetic extras (themes, custom avatars/group covers, app icons). Pure goodwill + vanity; costs us nothing per use.
- **Tip jar** — let happy users contribute voluntarily.
- **A future low-cost premium tier** for features that genuinely cost money to run — e.g., higher-frequency FX refresh, and later receipt OCR if/when it ships. The free tier always remains fully usable for everyday splitting.
- **B2B/SMB angle (later)** — shared-expense tracking for small teams, flat-shares-as-a-service, or NGO/field-team expense splitting.

Principle: monetize the *expensive edges*, keep the *useful middle* free.

---

## 15. Open questions / future scope
- **Native apps:** when do PWA limits (e.g., richer push, contacts access) justify the React Native port?
- **Friend matching:** auto-matching imported placeholder contacts to real users by phone/email — privacy-safe approach (hashed matching).
- **Receipt scanning & account-aggregator linking:** revisit once a monetization path funds the per-use cost and compliance.
- **Beyond India:** the settlement layer is built as a pluggable interface; adding non-UPI rails (PayPal/Wise/etc.) is a future market-expansion lever.
- **Group chat / planning:** trips already happen in WhatsApp — is there a light planning layer worth adding, or does that bloat the product?
