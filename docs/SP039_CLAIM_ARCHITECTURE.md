# SP-039 Slice 2 — Sauna Master Profile Claim: Architecture & Security Review

Status: **DESIGN — NOT IMPLEMENTED**. This is the authoritative architecture,
security model, SQL/RLS design, threat analysis and implementation plan for the
profile-claim onboarding workflow. No application code, SQL, migration, test or
Supabase change is produced by this slice. Implementation begins in Slice 3
(admin prepare + invitations) and Slice 4 (authentication return + atomic claim)
after separate authorization. The owner decisions in §22.1 are **approved**
(2026-07-27); §22.2 lists implementation details to confirm during build.

Related sources of truth: `docs/ROADMAP.md` §SP-039, `docs/BACKLOG.md` §SP-039,
`docs/USER_MODEL.md`, `docs/RLS.md`, `docs/DATABASE.md`, `docs/WORKFLOWS.md`
(W-08 relocated to SP-041; claim onboarding is part of W-07 onboarding).
Production Supabase project: `bctphcpbspdsrwjydqpl`.

Reused conventions (do not reinvent):

* SECURITY DEFINER RPCs with `set search_path = ''`, fully-qualified refs,
  self-authorization from `auth.uid()`, `revoke all … from public, anon` +
  `grant execute … to authenticated` (SP-037B `submit_facility_with_master_event`,
  SP-038 `link_import_to_submission`).
* Atomic conditional `UPDATE` where every authorization fact is a predicate of
  the statement (no read-then-update); concurrent callers serialize on the row
  lock and re-evaluate; `unique_violation` caught → clean no-op (SP-038).
* Append-only audit/log table: SELECT + INSERT policies only, no UPDATE/DELETE;
  FK `on delete set null` so the trail survives; partial indexes (SP-038
  `import_log`).
* Rate limiting = rolling-window `count(*)` over a log table with a
  `(actor, created_at)` index (SP-038 import rate limit) + advisory-lock count
  cap trigger for hard per-user caps (SP-036 `guard_sauna_submission_cap`).
* Workflow tables carry a `status` + `initiated_by`, and a BEFORE-UPDATE guard
  trigger enforces legal transitions — the DB is the boundary, not the server
  action (SP-035 `master_affiliations` / `guard_affiliation_transition`).
* Migrations: PRE-APPLY read-only probes that assert the exact expected live
  state and **fail loud on drift**; POST-APPLY verification in rolled-back
  transactions; companion rollback file; `notify pgrst, 'reload schema'`.

---

## 1. Current-state findings (read-only inspection)

**`public.sauna_masters` (production).** Columns include `id`, `user_id`
(nullable), `level`, `status` (`pending`/`approved`/`rejected`), `home_sauna_id`
(frozen legacy), `rating`, `review_count`, and the SP-039 Slice 1 additions
`slug`, `city`, `specialties`, `languages`, `experience_since_year`,
`social_links`, `website`, `cover_image_url`, `is_founding_partner`. Indexes:
`sauna_masters_pkey`, `sauna_masters_user_id_unique` (partial unique on
`user_id WHERE user_id is not null` — **one account ↔ at most one profile**),
`sauna_masters_slug_unique` (partial unique on `lower(slug)`).

**RLS on `sauna_masters` (live, reconciled by the SP-039 D2 fix).**

* `masters_select` (SELECT): `status = 'approved' OR user_id = auth.uid() OR
  public.is_platform_moderator()`.
* `masters_insert_self` (INSERT): moderator, or `user_id = auth.uid() AND
  status = 'pending'`.
* `masters_update_own` (UPDATE): `user_id = auth.uid()` (column-agnostic).
* `masters_update_moderation` (UPDATE): moderator.
* `masters_delete` (DELETE): moderator only (live policy, not versioned — see
  §20 drift note).
* Trigger `sauna_masters_guard` (BEFORE UPDATE) →
  `guard_master_privileged_columns()`: non-moderators may **not** change
  `level`, `status`, `user_id`, `home_sauna_id`, `is_founding_partner`,
  `rating`, `review_count`.
* Trigger `sauna_masters_insert_guard` (BEFORE INSERT) → forces `level='guest'`
  for non-moderator inserts.

**Authorization helpers (SECURITY DEFINER, `stable`, pinned search_path):**
`is_platform_moderator()` (`role in ('moderator','admin')`),
`is_master_owner(uuid)` (`user_id = auth.uid()` on that row),
`is_sauna_staff(uuid)`.

**Storage.** `master-avatars` INSERT policy `master_avatars_insert_own`: the
first path segment must equal `m.id::text` for a `sauna_masters` row linked to
the caller (any status) **or** moderator; references are qualified
(`storage.objects.*`), untrusted segment is compared as text (never cast to
`uuid`), fails closed. Layouts: `<master_id>/<file>` and
`<master_id>/covers/<file>`. Public read; no UPDATE/DELETE policies.

**Master Studio access gate.** `app/(main)/studio/*` calls
`loadMasterStudioScope(supabase, user.id)`; if no profile →
`StudioAccessNotice kind="none"`; if `status !== 'approved'` →
`kind="pending"|"rejected"`. **A pending master currently has no editor** — this
is the Slice 1 deferral that Slice 5 resolves (§11). Pending owners already have
own-row SELECT and Storage upload capability (SP-039 D2 fix); only the editor UI
is withheld.

**Supabase Auth flow.**

* `register/page.tsx`: `supabase.auth.signUp({ email, password, options: {
  emailRedirectTo: `${location.origin}/auth/callback` } })`. Email confirmation
  is required. **No `next`/return context is threaded.**
* `login/page.tsx`: `signInWithPassword`, then hardcoded `router.push('/')`.
  **No `next` support.**
* `auth/callback/route.ts`: `exchangeCodeForSession(code)` then
  `redirect(`${origin}${next}`)` where `next = searchParams.get('next') ?? '/'`.
  **`next` is not validated against an allow-list** — an open-redirect surface
  that must be closed before the claim flow reuses it (§6, §15).
* No OAuth provider is currently wired (email/password only).

**RPC / atomic patterns available to reuse:**
`submit_facility_with_master_event` (multi-insert, one transaction, self-auth,
DEFINER, granted to authenticated only) and `link_import_to_submission` (atomic
conditional UPDATE, idempotent no-op, `unique_violation` swallowed).

**Audit / rate-limit substrate:** `public.import_log` — append-only
(SELECT+INSERT policies only), `on delete set null` FKs, partial unique index,
rolling-hour rate-limit index `(requested_by, created_at)`. **No generic audit
table and no generic rate-limit service exist** — the claim workflow introduces
its own claim-scoped audit table following this exact posture.

**Conclusion:** reuse `sauna_masters` as the single profile identity through the
whole lifecycle; add explicit provenance/claim dimensions rather than a separate
staging table; drive the lifecycle from a dedicated invitation table + claim
audit table + a small set of DEFINER RPCs; extend (not replace) the existing
guard trigger with a narrow NULL→self claim carve-out.

---

## 2. Proposed data model

Reuse `public.sauna_masters` as the durable profile identity from preparation
through publication (slug, images in `<master_id>/…`, `master_affiliations`,
events all already key on `sauna_masters.id`). A separate staging table was
rejected: it would force a promote/copy step and re-point every foreign key at
claim time. Instead add **explicit, independent dimensions** so the six states
are never collapsed:

### 2.1 Additive columns on `sauna_masters` (all nullable / defaulted, no backfill)

| Column | Type | Meaning |
|---|---|---|
| `origin` | `text` NOT NULL DEFAULT `'self_registered'`, CHECK in (`self_registered`,`admin_prepared`) | **Prepared** dimension — provenance, permanent. Existing rows default to `self_registered`. |
| `claimed_at` | `timestamptz` NULL | **Claimed** dimension — set atomically by the claim RPC; NULL = unclaimed. |
| `identity_verified_at` | `timestamptz` NULL | **Identity-verified** dimension — moderator-set; not part of the MVP claim, modelled now so it is never conflated with approval. |
| `qualifications_verified_at` | `timestamptz` NULL | **Qualifications-verified** dimension — moderator-set; pairs with `level` (which already implies certification, USER_MODEL §2.4). |

Unchanged, reused dimensions:

* **Founding Partner** → existing `is_founding_partner` (moderator-only via
  guard; the claim never grants it).
* **Approved / published** → existing moderation `status`
  (`pending`/`approved`/`rejected`). `status` **stays moderation-only** and is
  not overloaded with claim or preparation meaning.

The six independent states therefore map to six distinct, non-collapsed signals:
`origin` · `claimed_at` · `identity_verified_at` · (`level` +
`qualifications_verified_at`) · `is_founding_partner` · `status`.

### 2.2 Row shapes

| Life stage | `origin` | `user_id` | `claimed_at` | `status` | Public? |
|---|---|---|---|---|---|
| Admin-prepared, unclaimed | `admin_prepared` | NULL | NULL | `pending` | No (only moderator) |
| Claimed, editing | `admin_prepared` | set | set | `pending` | No (owner + moderator) |
| Approved / published | `admin_prepared` | set | set | `approved` | Yes |
| Legacy self-registration | `self_registered` | set | NULL | any | per `status` |

`masters_insert_self` already permits moderator inserts, so admin-prepared rows
are created through the moderator arm with `user_id = NULL`,
`origin='admin_prepared'`, `status='pending'`. Such a row is **invisible to the
public and to arbitrary authenticated users** under the existing `masters_select`
(no `approved`, no `user_id` match) — it is reachable only by moderators and,
pre-auth, by the token-scoped preview RPC (§7).

### 2.3 New table `public.master_claim_invitations`

```
id             uuid  pk default gen_random_uuid()
master_id      uuid  not null references sauna_masters(id) on delete cascade
token_hash     bytea not null                         -- SHA-256(token), UNIQUE (no pepper — MVP, §4)
token_prefix   text  not null                         -- first 8 chars of token, NON-secret, for support/diagnostics
status         text  not null default 'created'
               check (status in ('created','ready','sent','opened','claimed','expired','revoked'))
expires_at     timestamptz not null                   -- authoritative expiry
delivery_channel text check (delivery_channel in ('email','messenger','whatsapp','sms','other'))
admin_note     text
created_by     uuid references auth.users(id) on delete set null
created_at     timestamptz not null default now()
ready_at       timestamptz
sent_at        timestamptz
opened_at      timestamptz
last_opened_at timestamptz
open_count     integer not null default 0
claimed_at     timestamptz
claimed_by     uuid references auth.users(id) on delete set null
revoked_at     timestamptz
revoked_by     uuid references auth.users(id) on delete set null
```

Indexes / constraints:

* `create unique index master_claim_invitations_token_hash_uidx on (token_hash);`
* `create unique index master_claim_invitations_active_uidx on (master_id)
   where status in ('created','ready','sent','opened');` — **at most one active
   invitation per master** (§3). The predicate lists **explicit lifecycle
   statuses only**; it must **never** reference `now()`, `expires_at`, or any
   volatile expression (a partial index predicate must be immutable, and a
   time-based predicate would silently and non-deterministically change which
   rows are "active").
* `create index master_claim_invitations_master_idx on (master_id);`
* CHECK `claimed_by is not null = (status = 'claimed')` (no ambiguous half-claim).
* CHECK `revoked_by is not null = (status = 'revoked')`.

**Expiration contract (authoritative — approved 2026-07-27).**

* `expires_at` is **always authoritative for claim validity**. `get_claim_preview`
  and `claim_master_profile` **check `expires_at` directly** (`now() < expires_at`)
  on every call.
* An invitation is **never** accepted merely because its stored `status` still
  looks active — a row with `status='sent'` but `now() >= expires_at` is treated
  as expired and rejected.
* `status='expired'` is a **materialized lifecycle label**, set only by a
  controlled cleanup job or the invitation-management/generation RPC (for admin
  clarity and to free the active slot). It is a convenience projection, never the
  correctness boundary.
* The active-status partial unique index (above) therefore operates purely on the
  explicit status set `{created, ready, sent, opened}` and is unaffected by the
  passage of time; materialization moves a row out of that set by writing
  `status='expired'`, not by any time predicate.

See §3 for the exact active status set, legal transitions, and the
lock-then-materialize generation sequence that keeps "at most one active" true
under concurrency.

### 2.4 New table `public.master_claim_events` (audit, append-only)

```
id            uuid pk default gen_random_uuid()
invitation_id uuid references master_claim_invitations(id) on delete set null
master_id     uuid references sauna_masters(id) on delete set null
event_type    text not null check (event_type in (
                 'invitation_created','invitation_ready','invitation_sent',
                 'invitation_opened','auth_started','claim_attempted',
                 'claim_succeeded','claim_rejected','invitation_expired',
                 'invitation_revoked','invitation_regenerated',
                 'moderator_recovery','ownership_detached',
                 'duplicate_conflict_opened','duplicate_conflict_resolved',
                 'profile_submitted','profile_approved'))
actor_user_id uuid references auth.users(id) on delete set null
ip            inet
user_agent    text                                    -- truncated, best-effort
reason        text                                    -- rejection cause / moderator note
metadata      jsonb                                   -- token_prefix at most; NEVER the raw token
created_at    timestamptz not null default now()
```

Indexes: `(master_id, created_at)`, `(invitation_id, created_at)`,
`(event_type, created_at)`, `(actor_user_id, created_at)` (audit queries + the
rate-limit windows in §14). Append-only posture: INSERT via DEFINER RPCs only;
moderator SELECT; no UPDATE/DELETE.

---

## 3. Invitation cardinality & state machine

**Active status set (authoritative):** `{created, ready, sent, opened}`.
**Terminal statuses:** `{claimed, expired, revoked}`. The single-active partial
unique index (§2.3) is defined over exactly the active set.

**Legal transitions** (all other transitions are illegal and rejected by the
management RPCs / a guard):

```
created  → ready | sent | opened | claimed | expired | revoked
ready    → sent  | opened | claimed | expired | revoked
sent     → opened | claimed | expired | revoked
opened   → claimed | expired | revoked
claimed  → (terminal — no outbound transition)
expired  → (terminal)
revoked  → (terminal)
```

`sent`/`opened` may be reached without stepping through every intermediate label
(e.g. a link opened before it was marked `sent`); the ordering above is a partial
order, not a mandatory staircase. `claimed` is reachable only through
`claim_master_profile` (§7); `expired` only through materialization (§2.3);
`revoked` only through the admin revoke/regenerate RPC.

Cardinality rules:

* One prepared profile may have **many invitation rows over time** but **at most
  one active** (partial unique index in §2.3).
* Regeneration = **revoke or expire the current active row** (keep it) **+ insert
  a new row** with a fresh token. Tokens are **never rotated in place** — each
  token keeps its own immutable lifecycle for audit.
* Revoked / expired / claimed rows **remain in history** (never deleted; only
  `token_hash` may be nulled after they can no longer be used, §16).
* A claimed profile normally receives **no** further invitation. A new
  invitation for an already-claimed profile is possible **only** after an
  explicit moderator detach (§9), which frees the active-invitation slot.

**Lock-then-materialize generation sequence (concurrency-safe).** Before
creating a replacement invitation the admin generation RPC must, in one
transaction:

1. `SELECT … FROM master_claim_invitations WHERE master_id = :m AND status IN
   ('created','ready','sent','opened') FOR UPDATE` — lock any active row(s) for
   this master.
2. For each locked row where `now() >= expires_at`, **materialize** it:
   `status='expired'` (+ `invitation_expired` audit event). This frees the active
   slot for a genuinely expired-but-still-labelled row.
3. If an active, **not-yet-expired** row still remains, either reject
   ("an active invitation already exists — revoke it first") or, when the caller
   asked to regenerate, set it `status='revoked'` (+ audit).
4. `INSERT` the new invitation.

Concurrent generation attempts serialize on the `FOR UPDATE` locks from step 1;
the `master_claim_invitations_active_uidx` partial unique index is the final
backstop, so **at most one active invitation per master** holds even if two
admins race. Manual recovery: a moderator can revoke + regenerate at any time
from the admin panel; the old link dies immediately, a new link is issued.

---

## 4. Token design

* **Generation:** `crypto.randomBytes(32)` (Node, in the server action) → 256
  bits of CSPRNG entropy. Never `Math.random`.
* **Encoding:** base64url, no padding (~43 chars). URL-safe.
* **URL shape (recommended):** token in the **path** — `/claim/<token>`. On the
  first server hit the token is immediately exchanged for an HTTP-only cookie and
  the browser is 302-redirected to a **token-less** URL (`/claim`), so the raw
  token does not linger in the address bar, browser history, or subsequent
  `Referer` headers (§6). `Referrer-Policy: no-referrer` is set on `/claim/*`,
  and no third-party/analytics scripts run on that route.
* **Hashing at rest (approved):** `token_hash = sha256(token)` — plain SHA-256,
  **no pepper for the MVP**. For a 256-bit CSPRNG token, plain SHA-256 is
  sufficient: the input is not a guessable/low-entropy secret, so neither slow
  hashing (bcrypt/argon2) nor a keyed HMAC pepper adds meaningful defense — a
  leaked hash is not brute-forceable regardless. A pepper is deliberately **not**
  introduced unless a concrete repository constraint later justifies it (avoids a
  new secret to manage/rotate). The hash is computed in the Next.js server layer
  (or a DEFINER helper) before the DB lookup.
* **The database never stores the raw token.** Only `token_hash` and
  `token_prefix` (first 8 chars, non-secret, for support lookups).
* **Comparison:** the claim/preview RPCs look the invitation up **by
  `token_hash`** (indexed equality) — there is no raw-secret string compare, so
  there is no token-timing side channel to exploit.
* **One-time use:** claim flips `status → 'claimed'` atomically; any later claim
  with the same token sees `claimed` and returns the already-claimed conflict
  (idempotent for the same `claimed_by`, §7/§8).
* **Expiry / revocation / replay:** enforced in the claim RPC against
  `expires_at`, `status='revoked'`, and `status='claimed'` (§7).
* **Logging rules:** raw tokens are **never** logged, stored in analytics, put in
  query strings, or emitted in error messages. Diagnostics use `token_prefix` +
  `invitation_id` only. Monitoring redaction treats `/claim/<token>` as a secret
  path segment.

Trade-off — path vs query: both can leak via logs/history, but query strings are
disproportionately captured by analytics and `Referer`. Path + immediate
cookie-exchange + `no-referrer` + token-less redirect is the smallest exposure.
(Alternative in §22: opaque id + secret fragment `#`, which never reaches the
server or logs but complicates server-side validation.)

---

## 5. Public claim preview boundary

Before authentication a token holder may see only a **whitelisted** subset:
`name`, `avatar_url`, `cover_image_url`, `city`, a **truncated** bio,
`specialties`, `languages`, and the flag "prepared by SaunaPlanet".
Never exposed: `user_id`/auth UUID, moderation notes, `admin_note`, contact data,
internal audit, certificate files, rating/`review_count` internals, or
pending/rejected affiliations. **Approved-affiliation names may be shown**
(approved decision §22.1.5) — only names of `approved` affiliations, which are
already public.

Mechanism: a **SECURITY DEFINER RPC** `get_claim_preview(p_token text)` that
hashes the token, resolves the invitation, validates it is not expired / revoked
/ claimed, and returns only the whitelisted JSON. `EXECUTE` is granted to `anon`
and `authenticated` (preview is pre-auth). Because the function returns a fixed
projection for a valid token, **possession of a token never grants table
access** — direct client SELECT on `sauna_masters` still returns 0 rows for an
unclaimed prepared profile (fail-closed under `masters_select`). Invalid/expired
tokens return a **uniform** "invitation not available" (enumeration-resistant,
§14/§15). The RPC records the open (`opened_at`, `last_opened_at`, `open_count`,
`status → opened`) and is rate-limited.

---

## 6. Authentication & return flow

Goal: the claim context survives sign-in, registration, email confirmation,
callback, refresh, and second-device open — without exposing the token to
JS-readable storage.

**Claim cookie contract (MVP, approved).** The `sp_claim` cookie carries the
**raw token** and MUST be:

* `HttpOnly` — never readable by JavaScript;
* `Secure` — HTTPS only;
* `SameSite=Lax` — survives the top-level return navigation from an email/OAuth
  link, but is not sent on cross-site subrequests;
* `Path=/claim` — sent only to claim routes, never to the rest of the app;
* **lifetime ≤ the invitation's remaining validity** (`Max-Age = min(session
  cap, expires_at − now())`) — the cookie can never outlive the token;
* **cleared after a successful claim**;
* **cleared after any terminal handling** — revoked, expired, malformed, or
  otherwise rejected invitation;
* **never** copied to `localStorage`, `sessionStorage`, a client-readable
  (non-HttpOnly) cookie, analytics, query strings, or logs.

**Token-leakage prevention on the token-bearing request.** The initial
`GET /claim/<token>` response sets `Referrer-Policy: no-referrer`, and the
`/claim/*` routes load **no third-party analytics, no remote images, and no other
cross-origin resources** — nothing that could receive the token through a
`Referer` header — *before* the token-less redirect. Immediately after the cookie
is safely set the server **302-redirects to the canonical token-less route
`/claim`**, so the raw token leaves the address bar and browser history at once.

Flow:

1. `GET /claim/<token>` (server) → `get_claim_preview` validates and returns the
   preview → set `sp_claim` per the contract above → **302 → `/claim`**
   (token-less). No client-side script ever sees the token.
2. `/claim` renders the preview and, if unauthenticated, links to
   `/auth/login?next=/claim` and `/auth/register?next=/claim`.
3. **Login** and **register** are extended to read `next` and thread it:
   `signInWithPassword` → `router.push(next)`; `signUp` →
   `emailRedirectTo = ${origin}/auth/callback?next=/claim`.
4. `auth/callback` is hardened to **validate `next` against an allow-list**
   (relative path matching `^/claim(?:/|$)` or another explicitly listed internal
   path) before redirecting — closing the current open-redirect surface. Absolute
   URLs and protocol-relative `//host` are rejected → fall back to `/`.
5. Back on `/claim` (now authenticated), the server reads `sp_claim`, re-runs the
   preview for context, and shows the explicit **"This is my profile"** button,
   whose submission goes to the server (§7), which reads the token from the
   cookie and invokes the claim RPC. The token is never in client code.

**Email-confirmation return.** Registration requires email confirmation. Because
`Path=/claim` and `SameSite=Lax`, the `sp_claim` cookie persists in the browser
while the user leaves to their inbox and is present again when the confirmation
link lands on `/auth/callback?next=/claim` (validated in step 4) and forwards to
`/claim`. The claim then proceeds using the cookie — the token never travels
through the email link itself. If the cookie has expired by the time the user
confirms (slow inbox), `/claim` shows "re-open your invitation link"; re-opening
`/claim/<token>` re-establishes the cookie.

**Second device.** Opening the confirmation or claim on a different device/browser
has no `sp_claim` cookie there; the user re-opens the original `/claim/<token>`
link on that device, which re-establishes the cookie. The token is bound to
possession-of-link, not to a single device.

**Wrong account already signed in** → `/claim` detects the session, shows "signed
in as X — claim as this account or switch"; the claim RPC enforces the
one-profile-per-account rule regardless. The **raw token is never written to
`localStorage`/`sessionStorage`.**

Alternative (recommended for post-MVP, §22): replace the token-bearing cookie
with a **server-side `pending_claim` row** keyed by a random opaque id in the
cookie, enabling in-flight session revocation and cross-device continuity.

---

## 7. Atomic claim RPC contract

`public.claim_master_profile(p_token text) returns jsonb` — SECURITY DEFINER,
`set search_path = ''`, `revoke … from public, anon`, `grant execute … to
authenticated`.

Preconditions revalidated **server-side, inside one transaction**:

1. `auth.uid()` is not null (else raise "login required").
2. Resolve invitation `by token_hash` **`FOR UPDATE`** (row lock).
3. Invitation exists; `status <> 'revoked'`; `now() < expires_at` (else expired);
   if `status = 'claimed'` → return **idempotent success** when
   `claimed_by = auth.uid()`, else conflict `already_claimed`.
4. Lock the `sauna_masters` row `FOR UPDATE`; require `user_id IS NULL` and
   `origin = 'admin_prepared'`.
5. Caller not already linked to another profile — enforced by
   `sauna_masters_user_id_unique`; the UPDATE that sets `user_id` raises
   `unique_violation` if the account already owns a profile → caught → conflict
   `account_already_master`.

Atomic effects (all-or-nothing):

* `UPDATE sauna_masters SET user_id = auth.uid(), claimed_at = now()
   WHERE id = :master_id AND user_id IS NULL` — the `user_id IS NULL` predicate
   makes concurrent claims race-safe: exactly one updates 1 row; the loser sees
   0 rows → conflict `claim_lost`.
* `UPDATE master_claim_invitations SET status='claimed', claimed_at=now(),
   claimed_by=auth.uid() WHERE id=:invitation_id AND status <> 'claimed'`.
* `INSERT` a `claim_succeeded` (or `claim_rejected`) audit event.
* Return `jsonb_build_object('master_id', …, 'slug', …, 'status', 'claimed')`
  for the redirect to `/studio`.

**Guard-trigger interaction (critical).** `guard_master_privileged_columns`
currently raises for any non-moderator `user_id` change, which would block the
claim. The guard must be **extended with a narrow carve-out**: allow the
transition when `old.user_id IS NULL AND new.user_id = auth.uid() AND
old.origin = 'admin_prepared'` (first-time claim of an unclaimed prepared
profile). All other `user_id` changes stay moderator-only; re-assigning an
already-owned profile stays blocked. This is the single most security-sensitive
change in the slice and is called out for explicit review.

Concurrency: `FOR UPDATE` on both rows serializes competing claims; the
conditional `WHERE user_id IS NULL` + the unique index are the two independent
backstops. Idempotency: a client retry after a lost response re-enters, sees
`claimed_by = auth.uid()`, and returns success without side effects.

### 7.1 Server-to-RPC invocation model (mandatory)

The browser **must not** call `claim_master_profile(p_token)` directly through
the Supabase browser client — doing so would require the raw token in client-side
code. The claim is submitted through the Next.js server layer:

1. The browser submits the **"This is my profile"** confirmation to a **Next.js
   Server Action** (or Route Handler) — it carries **no token**, only the intent.
2. The server reads the raw token **from the HttpOnly `sp_claim` cookie**.
3. The server invokes `claim_master_profile` via the **server** Supabase client
   (the caller's session provides `auth.uid()`; the token is passed as the RPC
   argument).
4. The **RPC performs the complete authorization and atomicity checks** (§7) —
   it remains the database authorization boundary.
5. On **terminal** completion (success, or a terminal rejection: claimed by
   another, expired, revoked, malformed) the server **clears the `sp_claim`
   cookie** and maps the result to a safe user-facing outcome / redirect.

The Next.js server layer is responsible for: keeping the **raw token out of all
client-side code**; safe user-facing result mapping (generic messages, no token,
no internal detail); supplying **rate-limit context** (IP/account, §14); the
**cookie lifecycle** (set on preview, clear on terminal, §6); and **redirect
behavior** (to `/studio` on success; to a safe error screen otherwise). The RPC
never trusts client-supplied identity — `auth.uid()` and the token-hash lookup
are the only authority.

**Raw tokens are prohibited in:** client logs, analytics, query caches (React
Query / SWR / Next data cache), browser storage (`localStorage`/`sessionStorage`/
client-readable cookies), audit metadata (`master_claim_events.metadata` stores
at most `token_prefix`), and error reports. Only the HttpOnly cookie and the
server-side call path ever hold the raw token.

---

## 8. Conflict cases

| Case | User-facing | Admin/system behavior |
|---|---|---|
| Token already claimed (same user) | "Already claimed — go to Studio" | Idempotent success; no new audit noise |
| Token already claimed (other user) | Generic "invitation not available" | `claim_rejected` audit; alert if repeated |
| Token expired | "This link has expired — contact us" | Moderator regenerates |
| Token revoked | Generic "invitation not available" | Expected after revoke |
| Token malformed / unknown | Generic "invitation not available" | Rate-limited; enumeration alert |
| Profile already claimed | "This profile is already taken" | Manual review if unexpected |
| Account already owns another master profile | "Your account already has a master profile" + link | `account_already_master`; moderator may detach/merge-review |
| Wrong account signed in | "Signed in as X — switch account to claim" | No mutation |
| Invitation forwarded to another person | Whoever authenticates + confirms claims it | Mitigated by short expiry, single active token, revoke; audit shows `claimed_by` |
| Two users open same invitation | First successful claim wins | Row lock + `user_id IS NULL`; loser gets `claim_lost` |
| Two concurrent claim attempts | One succeeds, one `claim_lost` | Serialized by `FOR UPDATE` |
| Claim succeeds, client loses response | Retry returns success | Idempotent |
| Invited master already self-registered a separate profile | Conflict; **no auto-merge** | `duplicate_conflict_opened`; moderator reviews & resolves (§9) |
| Moderator must reverse an incorrect claim | — | `moderator_detach_master_claim` (§9) |

Duplicate profiles are **never auto-merged**; they open a moderator review task.

---

## 9. Reversal & recovery restrictions

Core rules (approved):

* A **consumed invitation is never reusable** — once `status='claimed'` it stays
  terminal; any re-claim requires a **newly generated** invitation.
* Reversal is **moderator-only** and runs through a dedicated privileged RPC
  `moderator_detach_master_claim(p_master_id uuid, p_reason text)` (SECURITY
  DEFINER, moderator-checked) with a **mandatory non-empty `reason`**. It never
  happens through ad-hoc row edits.
* Every reversal writes an **append-only `ownership_detached` audit event**
  (actor, reason, timestamp).
* Detach is **not** allowed to reset privileged/derived state: `level`,
  `status`, `is_founding_partner`, `identity_verified_at`,
  `qualifications_verified_at`, `rating`, `review_count`, and moderation history
  are **not** automatically changed by detachment — only `user_id`/`claimed_at`
  are cleared (a return to unclaimed), and only when simple detach is permitted.

**Simple detach vs manual conflict case.** Simple detach (clear
`user_id`/`claimed_at`, re-invite) is permitted **only before meaningful
owner-created activity exists**. Blocking activity — any of:

* owner-created **events** (as organizer) or event participations;
* **material affiliation changes** the owner made (new/accepted/ended
  `master_affiliations`);
* **owner-uploaded content** (avatar/cover or other Storage objects under
  `<master_id>/…` written after claim);
* **certificate submissions** by the owner;
* any other **durable public activity** attributable to the owner —

**blocks simple detach**. When blocking activity exists, the system **opens a
manual conflict/recovery case** (`duplicate_conflict_opened`) for a moderator to
resolve by hand rather than auto-detaching. **Profile duplicates are never
automatically merged.**

**Storage & account preconditions.** Before any detach the moderator reviews
**Storage ownership/cleanup implications** — owner-uploaded objects live under
`<master_id>/…` and are re-associated with whoever next claims that
`master_id`; they must be reviewed (and removed via the **supported Storage API**,
never SQL) if they belong to the wrong person. **Account-takeover cases require
account-security recovery first** — a compromised account must be secured (via
Supabase auth recovery) **before** any profile reassignment; profile detach is
not a substitute for account recovery.

Explicit recovery behavior:

| Scenario | Behavior |
|---|---|
| Wrong-account claim caught **immediately** (no edits/activity) | Simple moderator detach + `ownership_detached` audit; generate a **new** invitation for the correct person. |
| Wrong-account claim **after profile edits** (no public activity) | Simple detach still permitted; moderator reviews owner-uploaded Storage objects first; new invitation issued. Privileged/verification fields untouched. |
| Wrong-account claim **after public activity** (events/affiliations/published) | **No auto-detach** — open a manual conflict case; moderator resolves ownership of the durable activity by hand before any reassignment. |
| **Duplicate self-registered profile** (invitee already has their own) | Never auto-merged; `duplicate_conflict_opened`; moderator decides which profile survives and links the account manually. |
| **Compromised account** | Account-security recovery first (secure the account); only then, if needed, detach/reassign the profile. |

Reversal after public activity is high-risk, always audited, and always a manual
moderator decision — never automatic.

---

## 10. RLS & authorization matrix

`sauna_masters` — **no new SELECT arm is added for unclaimed profiles**;
`masters_select` stays exactly `approved OR user_id = auth.uid() OR moderator`.
Unclaimed prepared rows remain moderator-only at the table level; the token
holder sees them only through `get_claim_preview` (DEFINER projection).

| Actor | sauna_masters | master_claim_invitations | master_claim_events |
|---|---|---|---|
| Anonymous token holder | none direct; preview via RPC | none direct; preview via RPC | none |
| Authenticated token holder (pre-claim) | none direct (not owner) | none direct | none |
| Profile owner (after claim) | own row R/W (guard-limited) | none direct | none |
| Pending master editing | own row R/W (guard-limited, §11) | none | none |
| Approved master | own row R/W (guard-limited) | none | none |
| Administration / moderator | all rows R/W | via DEFINER admin RPCs (+ optional moderator SELECT) | moderator SELECT |
| Public | approved rows only | none | none |

`master_claim_invitations`: **not client-selectable or client-writable at all.**
All creation, readiness, send/open/revoke/regenerate and claim happen through
SECURITY DEFINER RPCs. A single narrow **moderator SELECT** policy (or a DEFINER
`admin_list_claim_invitations()` returning non-secret columns — never
`token_hash`) backs the admin panel. This keeps token metadata off the public
API surface entirely.

Storage: unchanged. `master_avatars_insert_own` already lets a linked owner (any
status) upload to `<master_id>/…`; **admin-prepared images** are uploaded by the
moderator arm before claim; after claim the new owner uploads under the same
`master_id`.

`masters_select` is **not** broadened to expose unclaimed profiles — this is an
explicit non-goal repeated from the Slice 1 D2 lesson.

---

## 11. Pending-master Studio access model

Resolves the deferred `StudioAccessNotice` behavior (implemented in Slice 5;
designed here). A **claimed pending** master (`user_id` set, `status='pending'`)
gets a **pending onboarding editor**, distinct from operating publicly:

| Capability | Pending claimed | Approved |
|---|---|---|
| Edit profile text fields (bio, city, slug, specialties, languages, socials, website, year) | ✅ | ✅ |
| Upload avatar / cover | ✅ (already RLS/Storage-authorized) | ✅ |
| See completeness checklist + "submit for review" | ✅ | ✅ |
| Public profile visible | ❌ (stays private until approved) | ✅ |
| Set `level` / `status` / `is_founding_partner` | ❌ (guard, moderator-only) | ❌ |
| Create events | ❌ (bundled RPC requires approved) | ✅ |
| Submit affiliation proposals | Decision (§22) — recommend **defer to approved** | ✅ |
| Today Queue | Completeness + "submit for review" prompt | Full |
| Banner | "Profile in review / complete your data" | Status label |

The right to **edit one's prepared profile** is explicitly **not** the same as
**approval to operate publicly** as a verified master — the two are gated
separately (`status` remains the public/operational gate).

---

## 12. Publication & moderation model (MVP recommendation)

**Recommended MVP:** *claim does not change public visibility.* An admin-prepared
profile is `pending` (private) throughout preparation and claim; after the owner
edits and presses "submit for review", a moderator approves → `status='approved'`
→ public via the existing `masters_select` approved arm. Claiming itself never
flips visibility.

Rationale: reuses the existing approved-gate infrastructure with zero new
public-visibility surface; guarantees a human reviews owner-edited data before it
goes public; only 10 pilot masters, so the extra moderation round-trip is cheap.

Alternatives evaluated and rejected for MVP: auto-approve on claim (publishes
admin-entered data before the owner truly reviews it, and grants public presence
before a human check); "visible but unverified" badge (adds a new visibility
state and public surface for little pilot benefit). Profiles that were *already
public before claim* do not arise for admin-prepared rows (they are born
`pending`); a pre-existing approved self-registration is the duplicate-conflict
path (§8/§9), not a claim target.

---

## 13. Audit model

Use the dedicated append-only `master_claim_events` table (§2.4), **not**
`import_log` (different domain). It captures every lifecycle event listed in the
`event_type` CHECK: invitation created/ready/sent/opened, auth started, claim
attempted/succeeded/rejected, expired, revoked, regenerated, moderator recovery,
ownership detached, duplicate conflict opened/resolved, profile submitted/
approved. Posture mirrors `import_log`: INSERT via DEFINER RPCs, moderator
SELECT, no UPDATE/DELETE, FKs `on delete set null` so the trail survives profile
or user deletion. **Raw tokens and excessive PII are never written** — at most
`token_prefix` in `metadata`, a truncated `user_agent`, and `ip`.

---

## 14. Rate-limiting & abuse protection

Reuse the SP-038 rolling-window pattern over `master_claim_events` (indexed
`(event_type, created_at)`, `(actor_user_id, created_at)`; `ip inet` for IP
windows) — no new infrastructure:

| Surface | Limit (initial, tunable) | Key |
|---|---|---|
| Preview / invalid-token attempts | e.g. 10 / 5 min | IP |
| Claim attempts | e.g. 5 / 15 min | IP **and** account |
| Invitation generation / regeneration | e.g. 30 / hour | admin account (advisory-lock cap trigger) |
| Moderator recovery | logged; alert on spikes | moderator account |

Enumeration resistance: **uniform** "invitation not available" for
unknown/expired/revoked/malformed tokens; avoid response-shape and timing
differences (hash lookup is constant-shape). Brute force is infeasible (256-bit
token) but rate limits + alerts on repeated invalid attempts are still applied.
DoS against a valid invitation is bounded (revoke + regenerate restores service).
Thresholds are configurable and surface to monitoring — aligned with SP-040
free-tier guardrails.

---

## 15. Threat model

| # | Attack | Impact | Prevention | Detection | Recovery | Residual |
|---|---|---|---|---|---|---|
| 1 | Stolen invitation link | Wrong person claims | Short expiry; single active token; revoke; explicit "This is my profile" | `claim_succeeded` actor vs intended; opens from unexpected geo | Detach + re-invite | Low |
| 2 | Forwarded invitation | Same as stolen | Same as #1; per-master single token | Audit trail | Detach + re-invite | Low |
| 3 | Brute-forced token | Account/profile takeover | 256-bit token; hashed at rest; rate limit; uniform errors | Invalid-attempt spike alert | Revoke affected | Negligible |
| 4 | Token leaked in logs | Replay | Never log raw token; token-less redirect; prefix-only diagnostics | Log audit | Rotate (revoke+regen) | Low |
| 5 | Token in Referer | Leak to third parties | Path + `no-referrer` + immediate cookie exchange; no 3rd-party scripts on `/claim` | — | Rotate | Low |
| 6 | Token to analytics | Leak | No analytics on `/claim`; token not in query | — | Rotate | Low |
| 7 | Replay after claim | Double claim | `status='claimed'` one-time; idempotent same-user only | Repeat-claim audit | — | Negligible |
| 8 | Concurrent claim race | Two owners | `FOR UPDATE` + `user_id IS NULL` + unique index | `claim_lost` events | — | Negligible |
| 9 | Wrong-account claim | Profile on wrong account | One-profile-per-account; explicit confirm; "switch account" UX | Owner report; audit | Detach + re-invite | Low |
| 10 | Account takeover | Full control | Auth is the user's own; admin never sets passwords; claim needs live session + token | Auth logs | Supabase auth recovery | Low |
| 11 | Moderator abuse | Malicious detach/prepare | Moderator-only RPCs, every action audited; least privilege | `master_claim_events` review | Reverse via audit | Medium (trusted role) |
| 12 | Direct DB/API bypass | Skip checks | Invitations non-selectable/non-writable by clients; all logic in DEFINER RPCs; guard trigger | PostgREST logs | Patch policy | Low |
| 13 | Mass invitation generation | Spam / cost | Per-admin cap (advisory lock); single active per master | Generation-rate alert | Revoke batch | Low |
| 14 | Duplicate-profile takeover | Claim someone else's identity | Admin prepares from vetted data; moderator resolves duplicates; no auto-merge | Duplicate-conflict audit | Moderator review | Medium (process) |
| 15 | Open redirect on auth return | Phishing | `next` allow-list (`^/claim`); reject absolute/`//` | Callback logs | Fix validation | Low |
| 16 | CSRF / cross-origin claim | Forced claim | Claim is a POST server action with framework CSRF + `SameSite` cookie; needs live session | — | — | Low |
| 17 | XSS exposing token/cookie | Token theft | Cookie HTTP-only; token never in DOM/JS storage; CSP; escaped rendering | CSP reports | Rotate | Low |
| 18 | Image-upload abuse pre-approval | Storage abuse / bad content | Upload scoped to own `<master_id>`; profile private until approved; moderation before public | Storage audit | Remove via supported API | Low |
| 19 | Unauthorized qualification/Founding-Partner change | Fake credentials | Guard trigger (moderator-only) on `level`/`status`/`is_founding_partner` | Guard rejects; audit | — | Negligible |

---

## 16. Data retention

| Data | Retention | Notes |
|---|---|---|
| Claimed invitations | Kept indefinitely (pilot) | `token_hash` may be nulled post-claim (replay already blocked) |
| Expired invitations | 90 days, then `token_hash` nulled; row skeleton kept | Preserve lifecycle for investigation |
| Revoked invitations | 90 days, then `token_hash` nulled; row kept | Same |
| Open/preview events | 90 days | Abuse investigation |
| Invalid-attempt logs | 90 days | Enumeration/brute-force review |
| Claim audit (`master_claim_events`) | 12 months | Security trail; PII minimized |
| Token hashes | Only while the token can still be used | Never a raw secret; nulled once useless |
| Delivery metadata | With the invitation row | Non-secret |

No raw secret is ever retained (none is stored). Retention is enforced by a
scheduled cleanup that nulls `token_hash` and prunes old events — never by hard
row deletion of audit history.

---

## 17. Admin pilot workflow (first 10 profiles)

A `/admin/masters` prepare/claim panel (server-rendered, moderator-gated,
mobile-friendly) supporting: create/prepare a profile (all pilot fields); mark
ready; generate an invitation (**raw token shown exactly once** for copy — never
stored, never re-displayed); copy invitation link; record intended delivery
channel; mark sent; view `opened`/`claimed`/`expired`/`revoked` state; revoke;
regenerate; inspect claim history (from `master_claim_events`); detect conflicts
(duplicate profile / account-already-master); manually recover (detach); see
profile completeness; see publication status. **No automatic email delivery in
MVP** — the admin copies a prepared message and sends it via
email/Messenger/WhatsApp manually.

---

## 18. Test matrix

* **Unit (Vitest):** token generation (length/entropy/base64url), SHA-256
  hashing determinism, `next` allow-list validator (relative-only, reject `//` and
  absolute), preview field whitelist, expiry derivation.
* **SQL contract:** columns/constraints/indexes present; `origin` CHECK; active-
  invitation partial unique; token-hash unique; audit append-only (no
  UPDATE/DELETE policy); guard body contains the NULL→self carve-out and nothing
  wider.
* **RLS:** unclaimed prepared row invisible to anon and to a non-owner
  authenticated user; owner sees own row; `master_claim_invitations` not
  client-selectable; moderator SELECT works.
* **RPC:** preview returns only whitelisted fields; claim happy path;
  expired/revoked/claimed/malformed → correct conflicts; idempotent retry;
  concurrency (two sessions, one wins); account-already-master; profile-already-
  claimed; moderator detach + re-invite.
* **Token security:** replay after claim blocked; raw token never in logs;
  no-referrer header present.
* **Auth return:** login `next`, register `emailRedirectTo` with `next`, email-
  confirmation return, callback allow-list, wrong-account, second-device/no-
  cookie.
* **Studio:** pending claimed editor accessible; publication blocked until
  approved; avatar/cover upload after claim.
* **Rate limiting:** preview/claim/generation windows enforced; uniform errors.
* **Cleanup:** retention nulls `token_hash`; audit preserved.
* **Mobile browser flow:** full claim on a phone (bottom-sheet friendly).

Separation: unit vs SQL-contract vs integration (RLS/RPC) vs Preview E2E vs
Production smoke.

---

## 19. Migration & deployment sequencing

Additive, DB-before-code, each with drift-guarded PRE-APPLY probes and rolled-
back POST-APPLY verification, and a companion functional rollback:

1. **M1 — `sauna_masters` columns:** add `origin`, `claimed_at`,
   `identity_verified_at`, `qualifications_verified_at` (all additive; existing
   rows default `origin='self_registered'`).
2. **M2 — tables:** `master_claim_invitations`, `master_claim_events` with
   indexes, constraints, RLS enabled, moderator/DEFINER-only policies.
3. **M3 — guard trigger:** replace `guard_master_privileged_columns` to add the
   **NULL→self admin-prepared claim carve-out** (PRE-APPLY asserts the exact
   current 7-column SP-039 body and fails loud on drift).
4. **M4 — RPCs:** `get_claim_preview`, `claim_master_profile`, admin
   generate/revoke/regenerate, `moderator_detach_master_claim`; `revoke … from
   public, anon` + `grant execute … to authenticated`/moderator as appropriate.
5. **M5 — `auth/callback` `next` allow-list + login/register `next` threading**
   (code; safe to deploy after M1–M4 exist).

Deployment order: M1→M4 applied and verified in Supabase **before** the app code
(Slice 3/4/5) that depends on the columns/RPCs is deployed. Preview environment
first, then production, per the SP-036+ checkpoint discipline.

---

## 20. Rollback constraints & real-world lessons applied

* **Data-loss awareness:** dropping the new columns/tables is destructive; the
  rollback file separates a functional revert (restore prior guard body verbatim,
  drop RPCs/policies) from a commented DATA-LOSS section (drop columns/tables).
* **Fail loud on policy/guard drift:** PRE-APPLY probes inspect **live policy and
  function definitions** (`pg_policies.qual`, `pg_proc.prosrc`), not just names —
  exactly as the SP-039 D2 drift was caught.
* **Qualify Storage policy column refs** and **never cast untrusted path
  segments to `uuid`** (unchanged from Slice 1; no Storage policy change is
  needed here).
* **Never delete Storage metadata directly through SQL** — image cleanup uses
  the supported Storage API.
* **No app deploy before required columns/RPCs exist** (M-sequence above).
* **`masters_delete`** is a live, unversioned policy (moderator-only) — the
  migration set should **version it explicitly** (re-declare deterministically)
  while touching `sauna_masters`, to stop relying on an undocumented live
  definition (carried into §22 as an operational decision).

---

## 21. Slice 3 implementation scope (next, after approval)

Admin-prepared profiles + invitations only (no claim yet):

* Moderator create/edit of all pilot fields on `admin_prepared` rows; mark ready.
* `master_claim_invitations` table + admin RPCs: generate (token hash persisted,
  raw token returned once), expiry, revoke, regenerate; `sent`/`opened` tracking
  scaffolding; single-active-per-master enforcement.
* Pilot-candidate admin view + copyable invitation message (manual send).
* Audit events for the invitation lifecycle.

Slice 4 then adds preview + authentication return + the atomic claim RPC; Slice 5
the pending onboarding editor; Slice 6 the E2E/production readiness.

---

## 22. Decisions

### 22.1 Approved owner decisions (2026-07-27)

The following are **approved** and binding for Slice 3+ implementation; they are
no longer open recommendations.

1. **Unclaimed prepared profiles are not public** — moderator-only at the table
   level; pre-auth exposure only through the token-scoped `get_claim_preview`
   projection (§5, §10).
2. **Only one active invitation per master** — enforced by the partial unique
   index over the active status set `{created, ready, sent, opened}` (§2.3, §3).
3. **Default invitation validity is 14 days** (`expires_at = created_at +
   interval '14 days'`; §2.3, §16).
4. **Opening an invitation is recorded as an informational lifecycle event** —
   `opened`/`open_count`/`opened_at` + an `invitation_opened` audit event; nothing
   is gated on it (§5, §13).
5. **The limited claim preview may show names of approved affiliations** (approved
   affiliation names are already public); nothing else beyond the §5 whitelist.
6. **The initial raw token is transported in the URL path** — `/claim/<token>`
   with immediate cookie exchange, `no-referrer`, and a token-less redirect (§4,
   §6).
7. **Claim context uses a secure HttpOnly cookie for the MVP** (`Path=/claim`,
   `Secure`, `SameSite=Lax`, lifetime ≤ remaining validity; §6). Server-side
   `pending_claim` state is deferred to post-MVP.
8. **A claimed pending master may immediately edit permitted profile fields**
   (text fields + avatar/cover); privileged columns stay guard-locked (§11).
9. **Moderator approval is required before the profile becomes public** — claim
   never publishes; `status` stays `pending` until a moderator approves (§12).
10. **Claim reversal is moderator-only** and subject to the §9 recovery
    restrictions (mandatory reason, audit, no reuse of consumed invitations, no
    auto-merge, activity-gated simple detach).
11. **Expired and revoked invitation records are retained for 90 days**, after
    which `token_hash` is nulled while the audit skeleton remains (§16).
12. **Manual delivery-channel metadata is stored** (`delivery_channel` +
    `sent_at`; §2.3, §17).
13. **Automatic email delivery remains outside the MVP** — copyable message,
    manual send (§17).
14. **The live `masters_delete` policy must be explicitly inspected and
    versioned** in a future reviewed migration (stop relying on the undocumented
    live definition; §20).

### 22.2 Genuinely unresolved implementation details (settle during Slice 3/4)

These do not change the approved architecture; they are implementation choices to
confirm against the live schema and code at build time:

* **Exact `Max-Age` session cap** for `sp_claim` when the remaining validity is
  long (e.g. cap at 60 min of inactivity vs the full remaining validity) — a UX
  vs re-open trade-off; default: `min(60 min, expires_at − now())`.
* **Preview `open_count` write throttling** — whether repeated opens within a
  short window coalesce into one audit event to avoid noise (rate-limit windows
  in §14 apply regardless).
* **Whether pending claimed masters may submit affiliation proposals** before
  approval (§11 recommends deferring to approved) — product confirmation.
* **Bio truncation length** for the preview projection (§5).
* **`token_hash` column type** (`bytea` vs `text` hex) and where SHA-256 is
  computed (Node vs a DEFINER helper) — to match repository crypto conventions.
* **Cleanup cadence** for the retention/materialization job (§16) and whether it
  is a scheduled RPC vs an admin-triggered maintenance action.
* **Final admin-panel route placement** under `/admin` (§17) — naming/layout only.

---

*End of SP-039 Slice 2 architecture & security review. Owner decisions in §22.1
are approved; §22.2 lists implementation details to confirm during build.
Awaiting authorization before Slice 3 implementation.*
