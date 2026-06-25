# Squared Up — Core Domain Specification (v1.0)

**Scope of this document:** the correctness-critical core — data model, money handling, split computation, balance derivation, settlements (UPI), debt simplification, and the **Turn to Pay** feature. This is the layer an AI builder must get exactly right. UI styling, infrastructure provisioning, and non-core modules are intentionally out of scope here.

---

## 0. How to use this document with an AI builder

This spec is contract-first and example-driven on purpose. To minimize wrong assumptions:

1. Treat **§3 Invariants** as hard requirements. The builder must write automated tests asserting every invariant.
2. Treat the **§14 Test Vectors** as ground truth. Turn each into a unit test; if the implementation disagrees with a vector, the implementation is wrong.
3. Implement money math exactly as in **§5** (largest-remainder allocation). Do not substitute floating-point arithmetic or a different rounding rule.
4. Anything not specified here (e.g., visual design, choice of HTTP framework) is a free implementation choice — but nothing in this document may be silently changed.

A spec cannot make an AI infallible. A human must still review the money math and run the §14 vectors before trusting output.

---

## 1. Conventions

- **Money:** all monetary values are **integer paise** (₹1 = 100 paise). Type `BIGINT`. **No floating-point math anywhere** in storage or computation. Convert to rupees only for display and for the UPI `am` field (`am = paise / 100`, two decimals).
- **Currency:** default `INR`. Other currencies may be *recorded*; conversion to a group's base currency uses a daily FX rate (out of scope for this doc, but conversion happens before split computation, so split math always operates on a single currency's paise).
- **IDs:** `BIGINT` surrogate primary keys. `idempotency_key` is a client-generated UUID on every mutating request.
- **Time:** all timestamps `TIMESTAMPTZ`, stored UTC. `expense_date` is a calendar `DATE` (user's local date).
- **Soft delete:** `deleted_at TIMESTAMPTZ NULL`. Deleted rows are excluded from all balance/turn computation but retained for history/restore.
- **Determinism:** wherever ordering affects an outcome (remainder paise, tie-breaks, simplification), the tie-break order is specified explicitly. Implementations must follow it so results are reproducible.

---

## 2. Data model (PostgreSQL DDL)

```sql
-- ============ ENUMS ============
CREATE TYPE split_type        AS ENUM ('equal','exact','percent','shares','adjustment');
CREATE TYPE settlement_method AS ENUM ('upi','manual');
CREATE TYPE settlement_status AS ENUM ('pending','confirmed','disputed','cancelled');
CREATE TYPE group_type        AS ENUM ('trip','home','couple','other');
CREATE TYPE rotation_mode     AS ENUM ('balanced','round_robin');
CREATE TYPE member_role       AS ENUM ('owner','member');
CREATE TYPE expense_source    AS ENUM ('manual','nl','import');

-- ============ USERS ============
CREATE TABLE users (
    id               BIGSERIAL PRIMARY KEY,
    phone            TEXT UNIQUE,                 -- E.164, primary identity in India
    email            TEXT UNIQUE,
    name             TEXT NOT NULL,
    avatar_url       TEXT,
    upi_vpa          TEXT,                        -- e.g. 'rahul@okhdfc'; required to be PAID via UPI
    default_currency CHAR(3) NOT NULL DEFAULT 'INR',
    locale           TEXT NOT NULL DEFAULT 'en',  -- 'en' | 'hi' | ...
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- ============ FRIENDSHIPS (1:1, non-group) ============
CREATE TABLE friendships (
    user_low   BIGINT NOT NULL REFERENCES users(id),  -- always LEAST(a,b)
    user_high  BIGINT NOT NULL REFERENCES users(id),  -- always GREATEST(a,b)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_low, user_high),
    CHECK (user_low < user_high)
);

-- ============ GROUPS ============
CREATE TABLE groups (
    id                        BIGSERIAL PRIMARY KEY,
    name                      TEXT NOT NULL,
    type                      group_type NOT NULL DEFAULT 'other',
    cover_url                 TEXT,
    base_currency             CHAR(3) NOT NULL DEFAULT 'INR',
    default_split_config      JSONB,              -- optional default split (see §5)
    rotation_enabled          BOOLEAN NOT NULL DEFAULT false,
    rotation_mode             rotation_mode NOT NULL DEFAULT 'balanced',
    rotation_rr_order         BIGINT[] NOT NULL DEFAULT '{}',  -- ordered user_ids, round_robin only
    rotation_rr_pos           INT NOT NULL DEFAULT 0,          -- index into rotation_rr_order
    created_by                BIGINT NOT NULL REFERENCES users(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                TIMESTAMPTZ
);

CREATE TABLE group_members (
    group_id    BIGINT NOT NULL REFERENCES groups(id),
    user_id     BIGINT NOT NULL REFERENCES users(id),
    role        member_role NOT NULL DEFAULT 'member',
    in_rotation BOOLEAN NOT NULL DEFAULT true,     -- participates in Turn to Pay
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at     TIMESTAMPTZ,                       -- NULL = active
    PRIMARY KEY (group_id, user_id)
);

-- ============ CATEGORIES ============
CREATE TABLE categories (
    id        BIGSERIAL PRIMARY KEY,
    parent_id BIGINT REFERENCES categories(id),
    name      TEXT NOT NULL,
    icon      TEXT
);

-- ============ EXPENSES ============
CREATE TABLE expenses (
    id           BIGSERIAL PRIMARY KEY,
    group_id     BIGINT REFERENCES groups(id),     -- NULL = 1:1 friendship expense
    description  TEXT NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency     CHAR(3) NOT NULL DEFAULT 'INR',
    category_id  BIGINT REFERENCES categories(id),
    expense_date DATE NOT NULL,
    source       expense_source NOT NULL DEFAULT 'manual',
    is_rotation  BOOLEAN NOT NULL DEFAULT false,    -- counts toward Turn to Pay fairness
    created_by   BIGINT NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    idempotency_key UUID UNIQUE                     -- prevents offline-replay double-post
);

-- One row per participant per expense. A pure payer has owed_paise = 0;
-- a pure ower has paid_paise = 0. Multiple payers are simply multiple rows with paid_paise > 0.
CREATE TABLE expense_shares (
    expense_id BIGINT NOT NULL REFERENCES expenses(id),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    paid_paise BIGINT NOT NULL DEFAULT 0 CHECK (paid_paise >= 0),
    owed_paise BIGINT NOT NULL DEFAULT 0 CHECK (owed_paise >= 0),
    PRIMARY KEY (expense_id, user_id)
);

-- ============ SETTLEMENTS ============
CREATE TABLE settlements (
    id           BIGSERIAL PRIMARY KEY,
    group_id     BIGINT REFERENCES groups(id),     -- NULL = 1:1
    from_user    BIGINT NOT NULL REFERENCES users(id),  -- payer (debtor)
    to_user      BIGINT NOT NULL REFERENCES users(id),  -- receiver (creditor)
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    method       settlement_method NOT NULL,
    status       settlement_status NOT NULL DEFAULT 'pending',
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ,
    idempotency_key UUID UNIQUE,
    CHECK (from_user <> to_user)
);

-- ============ INDEXES ============
CREATE INDEX idx_expenses_group        ON expenses(group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_group_rot    ON expenses(group_id) WHERE is_rotation AND deleted_at IS NULL;
CREATE INDEX idx_shares_user           ON expense_shares(user_id);
CREATE INDEX idx_settle_group_status   ON settlements(group_id, status) WHERE deleted_at IS NULL;
```

**Cross-row sum invariant (recommended enforcement):** because `SUM(paid)=SUM(owed)=amount` spans multiple rows, enforce it in the application layer inside the same transaction that writes the expense and its shares, **and** add a `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` that re-checks at commit. Both belt and suspenders.

---

## 3. Invariants (must always hold — write tests for each)

| # | Invariant |
|---|---|
| I1 | For every non-deleted expense: `SUM(paid_paise) = SUM(owed_paise) = amount_paise`. |
| I2 | For every expense: `SUM(paid_paise − owed_paise) = 0` across its shares. |
| I3 | For any balance scope (group, or a 1:1 pair): `SUM(member net balances) = 0` at all times. |
| I4 | All monetary values are integer paise. No floats are ever produced or stored. |
| I5 | Every split allocation sums **exactly** to the expense total (largest-remainder guarantees this). |
| I6 | A settlement moves `from_user` net **up** by `amount` and `to_user` net **down** by `amount` (only when `status='confirmed'`). |
| I7 | A member with non-zero net balance in a group **cannot** be removed (`left_at` cannot be set) until settled to zero. |
| I8 | Turn-to-Pay fairness is derived **only** from `is_rotation = true` expenses; group balances are derived from **all** expenses + confirmed settlements. |
| I9 | Replaying a mutation with a previously-seen `idempotency_key` returns the original result and creates nothing new. |

---

## 4. Currency note

If an expense is recorded in a currency other than the group's `base_currency`, convert `amount_paise` to base-currency paise using the day's FX rate **before** running split computation. Store both the original and converted amounts if you want auditability (optional column, not required for v1). All of §5–§9 assume a single currency.

---

## 5. Split computation

Given an expense total `T` (paise) and a split spec, produce `owed_paise` per participant. Payers' `paid_paise` come directly from the `payers` array and must satisfy `SUM(paid) = T` (else error `PAYERS_SUM_MISMATCH`).

### 5.1 Largest-remainder allocation (the one rounding rule)

Used by `equal`, `percent`, `shares`. Never use float rounding.

```
function allocate(T: int, weights: map<user_id,int>) -> map<user_id,int>:
    W = sum(weights.values())                 # W > 0
    base = {}; frac = {}
    for (u, w) in weights:
        base[u] = (T * w) div W               # integer floor
        frac[u] = (T * w) mod W               # remainder numerator; larger = higher priority
    allocated = sum(base.values())
    leftover  = T - allocated                 # 0 <= leftover < count(weights)
    # distribute leftover paise, one each, to the largest fractional remainders
    order = users sorted by (frac[u] DESC, u ASC)
    for k in 0 .. leftover-1:
        base[order[k]] += 1
    return base                               # sum(base) == T, exactly
```

### 5.2 Rules per split type

- **equal:** `weights[u] = 1` for every participant → `allocate(T, weights)`.
- **exact:** `owed[u]` given directly. Validate `SUM(owed) = T` else `SPLIT_SUM_MISMATCH`.
- **percent:** input is **basis points** `percent_bps[u]` (integers, sum = 10000, else `PERCENT_SUM_INVALID`). `weights[u] = percent_bps[u]` → `allocate(T, weights)`.
- **shares:** input integer `shares[u]` (each ≥ 1) → `allocate(T, shares)`.
- **adjustment:** input `adjustments_paise[u]` (signed; default 0). Let `A = SUM(adjustments)`. Compute `R = T − A`. `eq = allocate(R, equal weights)`. Then `owed[u] = eq[u] + adjustments_paise[u]`. Validate every `owed[u] ≥ 0` (else `NEGATIVE_OWED`) and `SUM(owed) = T`.

Tie-break for the leftover paise is **always** `(frac DESC, user_id ASC)`. This makes allocation deterministic and reproducible.

---

## 6. Balance derivation

A user's **net balance** in a scope is positive if the scope owes them, negative if they owe the scope.

```
net(u) = SUM over expense_shares in scope of (paid_paise − owed_paise)
       + SUM of confirmed settlements where from_user = u (+amount)
       − SUM of confirmed settlements where to_user   = u (−amount)
```

### 6.1 Group balances (SQL)

```sql
WITH expense_net AS (
  SELECT es.user_id, SUM(es.paid_paise - es.owed_paise) AS net
  FROM expense_shares es
  JOIN expenses e ON e.id = es.expense_id
  WHERE e.group_id = $1 AND e.deleted_at IS NULL
  GROUP BY es.user_id
),
settle_net AS (
  SELECT user_id, SUM(delta) AS net FROM (
    SELECT from_user AS user_id,  amount_paise AS delta
      FROM settlements WHERE group_id = $1 AND status='confirmed' AND deleted_at IS NULL
    UNION ALL
    SELECT to_user   AS user_id, -amount_paise AS delta
      FROM settlements WHERE group_id = $1 AND status='confirmed' AND deleted_at IS NULL
  ) s GROUP BY user_id
)
SELECT m.user_id,
       COALESCE(e.net,0) + COALESCE(s.net,0) AS net_paise
FROM (SELECT user_id FROM expense_net UNION SELECT user_id FROM settle_net) m
LEFT JOIN expense_net e ON e.user_id = m.user_id
LEFT JOIN settle_net  s ON s.user_id = m.user_id;
-- SUM(net_paise) MUST equal 0 (Invariant I3).
```

### 6.2 1:1 (friendship) balances

Same formula, but the scope is "expenses with `group_id IS NULL` whose share rows are exactly the pair `{X, Y}`" plus settlements with `group_id IS NULL AND {from_user,to_user} = {X,Y}`. A 1:1 net is a single number; the pairwise debt is trivially `X owes Y = max(0, −net(X))`.

### 6.3 Caching

Cache computed nets per group in Redis keyed by `group:{id}:balances`, invalidated on any expense/settlement write to that group. Always recomputable from Postgres (source of truth).

---

## 7. Settlements and UPI

### 7.1 Sign semantics

A settlement is the debtor paying the creditor. `from_user` = debtor, `to_user` = creditor. On `confirmed`: `net(from_user) += amount`, `net(to_user) −= amount` (Invariant I6). This drives both toward zero.

### 7.2 UPI flow (Squared Up never touches money)

1. Client requests a settlement. Server creates a `pending` settlement.
2. If `method='upi'` and `to_user.upi_vpa` is set, server returns a UPI intent string:
   `upi://pay?pa=<to_user.upi_vpa>&pn=<urlencoded to_user.name>&am=<amount/100, 2dp>&cu=INR&tn=<urlencoded note>`
   The client opens it; the OS shows the UPI app chooser with everything prefilled. The user pays inside their **own** UPI app. No payment-aggregator licence or PCI scope is required because we only construct a link.
3. UPI intents do **not** reliably report success back to a web app. So after returning to Squared Up, prompt **"Did the payment go through?"**. On Yes → `PATCH /settlements/{id}/confirm` → status `confirmed`, balances update, both users notified.
4. If `to_user.upi_vpa` is absent → `upi_intent = null`, treat as `method='manual'`; the user records it via the same confirm step ("Mark as settled").
5. Either party may dispute a confirmed settlement → status `disputed` reopens the balance (reverses the net effect) pending resolution.

Partial settlements are allowed: `amount_paise` may be less than the outstanding balance.

---

## 8. Debt simplification (minimum settlements)

Converts a set of member nets (Σ = 0) into a small set of "who pays whom". The point of Turn to Pay (§9) is to keep this set tiny; users still see it on demand.

```
function simplify(nets: map<user_id,int>) -> list<{from,to,amount}>:
    creditors = list of (net, u) where net > 0          # sort net DESC, then u ASC
    debtors   = list of (|net|, u) where net < 0         # sort |net| DESC, then u ASC
    transfers = []
    i = 0; j = 0
    while i < len(creditors) and j < len(debtors):
        (c_amt, c) = creditors[i]
        (d_amt, d) = debtors[j]
        t = min(c_amt, d_amt)
        transfers.append({from: d, to: c, amount_paise: t})   # debtor pays creditor
        c_amt -= t; d_amt -= t
        creditors[i] = (c_amt, c); debtors[j] = (d_amt, d)
        if c_amt == 0: i += 1
        if d_amt == 0: j += 1
    return transfers
```

Produces ≤ (n−1) transfers. The provably-minimal version is NP-hard; this greedy heuristic is the industry-standard approach and is near-optimal in practice. Tie-breaks (`amount DESC, user_id ASC`) keep output deterministic.

---

## 9. FEATURE: Turn to Pay

### 9.1 Goal

Instead of splitting every bill (which spawns many small debts to settle), Turn to Pay nominates **one person to pay the whole bill each time**, choosing the member who is currently most "behind". Over time everyone contributes roughly equally and balances stay near zero — so **settlements are needed rarely and remain small** ("minimum square-up").

**Important honesty:** debts are *not* abolished. Each Turn-to-Pay expense is still recorded and split equally, so balances are always exact and auditable. The feature only chooses the payer so the *simplified settlement set stays tiny*. Users can settle anytime but seldom need to.

### 9.2 How an expense participates

A Turn-to-Pay expense is an ordinary expense with:
- `is_rotation = true`
- exactly one payer (the suggested member, editable),
- `split.type = equal`, participants = **all active rotation members** (`in_rotation = true AND left_at IS NULL`).

If only a subset of members took part (e.g. 3 of 5 went to dinner), log it as a **regular** expense (`is_rotation = false`). Subset-aware rotation is future scope. This rule removes all ambiguity from the turn calculation.

### 9.3 Whose turn — balanced mode (default & primary)

Define each active rotation member's **rotation fairness**:

```
rotation_net(u) = SUM over is_rotation expenses (not deleted) in the group
                  of (paid_paise − owed_paise)   for user u
```

`rotation_net(u) > 0` ⇒ u has paid more than their share (ahead). `< 0` ⇒ behind.

**Next payer = the active rotation member with the most negative `rotation_net`** (paid least relative to share). Paying the next full bill pushes them back toward zero.

Tie-break order: `rotation_net ASC`, then **earliest `last_paid_on`** (the member who paid longest ago goes first; NULL = never paid, goes first), then `user_id ASC`.

```sql
SELECT gm.user_id,
       COALESCE(SUM(es.paid_paise - es.owed_paise), 0) AS rotation_net,
       MAX(e.expense_date) FILTER (WHERE es.paid_paise > 0) AS last_paid_on
FROM group_members gm
LEFT JOIN expenses e
       ON e.group_id = gm.group_id AND e.is_rotation AND e.deleted_at IS NULL
LEFT JOIN expense_shares es
       ON es.expense_id = e.id AND es.user_id = gm.user_id
WHERE gm.group_id = $1 AND gm.in_rotation AND gm.left_at IS NULL
GROUP BY gm.user_id
ORDER BY rotation_net ASC, last_paid_on ASC NULLS FIRST, gm.user_id ASC
LIMIT 1;     -- this row = whose turn
```

Because the suggestion is derived from balances, **no special handling is needed when someone pays out of turn** — the next computation simply reflects the new balances. Editing the payer on a rotation expense "just works".

### 9.4 Whose turn — round-robin mode (optional)

Fixed cyclic order in `groups.rotation_rr_order`; the turn is `rotation_rr_order[rotation_rr_pos]`. After a rotation expense is created, advance `rotation_rr_pos = (rotation_rr_pos + 1) mod len(order)` regardless of who actually paid. Ignores amounts; provides strict predictability. Balanced mode is recommended because it is the one that minimizes settlements.

### 9.5 Edge cases (specified, not left to inference)

- **New member joins rotation:** `in_rotation = true`; their `rotation_net` starts at 0 (no past rotation expenses include them). They only owe shares of expenses created **after** joining. The math self-corrects — they become negative as new expenses land and reach their turn naturally. No backfill.
- **Member leaves:** must be settled to zero first (Invariant I7). Set `left_at`; for round-robin, remove from `rotation_rr_order` and clamp `rotation_rr_pos`.
- **Expense deleted:** `rotation_net` is derived, so excluding the deleted expense automatically recomputes the turn.
- **Imbalance indicator:** expose `max_abs_rotation_net = MAX(|rotation_net|)` across members so the UI can nudge "you're fairly balanced" vs "consider squaring up" without forcing it.

### 9.6 UX rules

- Show **"It's Rahul's turn to pay"** prominently in a rotation group.
- When adding an expense in a rotation group, **pre-fill** payer = whose-turn, split = equal among rotation members, `is_rotation = true`. All editable.
- Balanced mode optimizes **cumulative** fairness, which can legitimately mean the same person pays twice in a row (because they were far behind). Surface a one-line explanation ("Rahul's up again — he was behind by ₹700") so it doesn't feel arbitrary. Users who want strict alternation can switch to round-robin.

### 9.7 Worked example (balanced, flatmates A=11, B=22, C=33)

Each row: someone pays the full grocery bill, split equally 3 ways. "Turn" before each is computed by §9.3.

| Wk | Turn (why) | Payer pays | Cumulative net after (A / B / C) |
|----|------------|-----------|----------------------------------|
| 1 | A (all 0; tie → lowest id) | A pays ₹900 | +600 / −300 / −300 |
| 2 | B (tie −300; lowest id) | B pays ₹1200 | +200 / +500 / −700 |
| 3 | C (−700, most behind) | C pays ₹600 | 0 / +300 / −300 |
| 4 | C (−300, still most behind) | C pays ₹600 | −200 / +100 / +100 |

After 4 weeks: A paid ₹900, B ₹1200, C ₹1200; each owed ₹1100. Residual nets: A −200, B +100, C +100 — max imbalance ₹200 against ₹3300 spent. `simplify` → **two** small transfers (A→B ₹100, A→C ₹100), or just carry it. Contrast with naive per-bill splitting, which would generate a settlement obligation every single week.

---

## 10. Key API contracts

All mutating endpoints require header `Idempotency-Key: <uuid>`. All amounts in paise. Auth omitted here for brevity (Bearer JWT; every endpoint authorizes group membership).

### 10.1 Create expense — `POST /api/v1/expenses`

Request:
```json
{
  "group_id": 123,
  "description": "Dinner at Toit",
  "amount_paise": 180000,
  "currency": "INR",
  "expense_date": "2026-06-25",
  "category_id": null,
  "source": "manual",
  "is_rotation": false,
  "payers": [ { "user_id": 11, "paid_paise": 180000 } ],
  "split": {
    "type": "equal",
    "participants": [11, 22, 33]
  }
}
```
Split-type-specific fields (replace the `split` object):
```json
{ "type": "exact",      "participants":[11,22,33], "amounts_paise": {"11":60000,"22":60000,"33":60000} }
{ "type": "percent",    "participants":[11,22,33], "percent_bps":   {"11":3333,"22":3333,"33":3334} }
{ "type": "shares",     "participants":[11,22,33], "shares":        {"11":1,"22":1,"33":2} }
{ "type": "adjustment", "participants":[11,22,33], "adjustments_paise": {"33":5000} }
```
Response `201`:
```json
{
  "id": 9001,
  "group_id": 123,
  "amount_paise": 180000,
  "is_rotation": false,
  "shares": [
    { "user_id": 11, "paid_paise": 180000, "owed_paise": 60000, "net_paise": 120000 },
    { "user_id": 22, "paid_paise": 0,      "owed_paise": 60000, "net_paise": -60000 },
    { "user_id": 33, "paid_paise": 0,      "owed_paise": 60000, "net_paise": -60000 }
  ],
  "created_at": "2026-06-25T19:02:00Z"
}
```

### 10.2 Group balances — `GET /api/v1/groups/{id}/balances`

Response `200`:
```json
{
  "group_id": 123,
  "members": [
    { "user_id": 11, "net_paise": 120000 },
    { "user_id": 22, "net_paise": -60000 },
    { "user_id": 33, "net_paise": -60000 }
  ],
  "simplified_settlements": [
    { "from_user": 22, "to_user": 11, "amount_paise": 60000 },
    { "from_user": 33, "to_user": 11, "amount_paise": 60000 }
  ]
}
```

### 10.3 Whose turn — `GET /api/v1/groups/{id}/turn`

Response `200` (balanced):
```json
{
  "group_id": 123,
  "mode": "balanced",
  "next_payer": { "user_id": 33, "rotation_net_paise": -70000 },
  "max_abs_rotation_net_paise": 70000,
  "reason": "Behind by ₹700 in the rotation"
}
```
If `rotation_enabled = false` → `404 ROTATION_DISABLED`.

### 10.4 Create settlement — `POST /api/v1/settlements`

Request:
```json
{ "group_id": 123, "from_user": 22, "to_user": 11, "amount_paise": 60000, "method": "upi", "note": "Dinner" }
```
Response `201`:
```json
{
  "id": 5001,
  "status": "pending",
  "upi_intent": "upi://pay?pa=rahul%40okhdfc&pn=Rahul&am=600.00&cu=INR&tn=Squared%20Up",
  "requires_confirmation": true
}
```
If `to_user.upi_vpa` is null → `"upi_intent": null`, `"method": "manual"`.

### 10.5 Confirm settlement — `PATCH /api/v1/settlements/{id}/confirm`

Sets `status='confirmed'`, `confirmed_at=now()`, applies the net effect (I6), invalidates the balance cache, notifies both users. Response `200` with the updated settlement.

---

## 11. Error codes (HTTP 422 unless noted)

| Code | Meaning |
|---|---|
| `PAYERS_SUM_MISMATCH` | `SUM(payers.paid_paise) ≠ amount_paise`. |
| `SPLIT_SUM_MISMATCH` | exact split `SUM(amounts) ≠ amount_paise`. |
| `PERCENT_SUM_INVALID` | `SUM(percent_bps) ≠ 10000`. |
| `SHARES_INVALID` | a share < 1 or no shares given. |
| `NEGATIVE_OWED` | adjustment split produced a negative owed amount. |
| `EMPTY_PARTICIPANTS` | participants list empty. |
| `NOT_GROUP_MEMBER` | a payer/participant is not an active member of the group. |
| `ROTATION_PARTICIPANTS_MISMATCH` | `is_rotation=true` but participants ≠ all active rotation members. |
| `MEMBER_HAS_BALANCE` (409) | attempt to remove a member whose net ≠ 0 (I7). |
| `ROTATION_DISABLED` (404) | `/turn` requested on a non-rotation group. |
| `IDEMPOTENCY_REPLAY` (200) | key already seen; original result returned (not an error per se). |

---

## 12. Mutation transaction & idempotency

Every expense or settlement write executes as:

```
BEGIN
  -- check Idempotency-Key: if seen, return stored response, COMMIT, exit
  validate payload (§5 rules; raise the matching §11 error on failure)
  compute owed_paise via §5
  INSERT expense; INSERT all expense_shares
  assert SUM(paid)=SUM(owed)=amount     -- I1/I2 (deferred constraint trigger re-checks)
  store (idempotency_key -> response)
  invalidate Redis balance cache for the group
COMMIT
```

All-or-nothing. The deferred constraint trigger is the final gate before commit.

---

## 13. Out of scope for this document
UI/visual design; auth/OTP internals; FX rate fetching; natural-language parsing contract; Splitwise import job; notifications transport; infrastructure provisioning. (Each is specified separately.)

---

## 14. Test vectors (ground truth — turn each into a test)

### 14.1 Split allocation — `allocate(T, weights)`, participants ordered by user_id `[11,22,33,44]`

| Split | Input | Expected `owed_paise` (by id) |
|---|---|---|
| equal | T=10000, 3 ppl [11,22,33] | 11→3334, 22→3333, 33→3333 |
| equal | T=10001, 3 ppl [11,22,33] | 11→3334, 22→3334, 33→3333 |
| equal | T=100, 3 ppl [11,22,33] | 11→34, 22→33, 33→33 |
| equal | T=10000, 4 ppl | 2500 each |
| shares | T=10000, shares {11:1,22:1,33:2} | 11→2500, 22→2500, 33→5000 |
| shares | T=100, shares {11:1,22:1,33:1} | 11→34, 22→33, 33→33 |
| percent | T=10000, bps {11:2500,22:2500,33:5000} | 11→2500, 22→2500, 33→5000 |
| exact | T=10000, amounts {11:4000,22:3000,33:3000} | as given; valid |
| exact (bad) | T=10000, amounts summing to 9999 | error `SPLIT_SUM_MISMATCH` |
| adjustment | T=10000, 2 ppl [11,22], adj {22:1000} | base R=9000 → 4500/4500; owed 11→4500, 22→5500 |

### 14.2 Per-expense net (I2)

Expense T=180000, payer 11 pays all, equal split [11,22,33]:
`shares → 11:(paid 180000, owed 60000, net +120000), 22:(0,60000,−60000), 33:(0,60000,−60000)`; Σnet = 0. ✓

### 14.3 Settlement effect (I6)

Start nets {11:+120000, 22:−60000, 33:−60000}. Confirm settlement `from 22 to 11, 60000`.
Result nets {11:+60000, 22:0, 33:−60000}; Σ = 0. ✓

### 14.4 Debt simplification

Input nets {11:+60000, 22:0, 33:−60000} → `[{from:33, to:11, amount_paise:60000}]`.
Input nets {11:+600, 22:−300, 33:−300} → `[{from:22,to:11,300},{from:33,to:11,300}]` (tie-break id asc). 

### 14.5 Turn to Pay (balanced) — sequence from §9.7

Group rotation members [11,22,33], all `rotation_net=0` initially.

| Step | `GET /turn` next_payer | After creating rotation expense | rotation_net (11/22/33) |
|---|---|---|---|
| 0 | 11 (tie → lowest id) | 11 pays 90000, equal | +60000 / −30000 / −30000 |
| 1 | 22 (tie −30000 → lowest id) | 22 pays 120000, equal | +20000 / +50000 / −70000 |
| 2 | 33 (−70000) | 33 pays 60000, equal | 0 / +30000 / −30000 |
| 3 | 33 (−30000) | 33 pays 60000, equal | −20000 / +10000 / +10000 |
| 4 | 11 (−20000) | — | — |

### 14.6 Idempotency (I9)

`POST /expenses` twice with the same `Idempotency-Key` → second call returns the first response, creates no second expense; group balance unchanged by the replay.
