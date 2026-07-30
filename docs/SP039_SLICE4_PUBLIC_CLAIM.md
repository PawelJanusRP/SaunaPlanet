# SP-039 Slice 4 — Public Master Claim (Architecture Decision Record)

Status: Slice 4A accepted design. **M7 applied to Production and verified on
2026-07-30** through the established PRE/POST cutover protocol: catalog V1–V4
(functions hardened + exact grants, seven-type event vocabulary, guard claim
arm) and a 23-assertion self-rolling-back behavioral suite (inspection states,
anon denial, atomic claim, winner idempotency, loser outcome, expiry
materialization, one-master-per-user, no partial state) — all GREEN, zero
persistent fixtures. Slices 4B (public UI + auth return), 4C+ (onboarding)
implement against this contract.

Related: `docs/SP039_SLICE3_ADMIN_INVITATIONS.md` (admin side, M0–M6),
`supabase/2026-07-30_sp039_m7_public_claim.sql` (+ rollback).

---

## 1. Objective and flow

An administrator prepares a saunamaster profile and generates a secure
invitation link (Slice 3, live). The saunamaster opens
`/claim/master/[token]`, sees a minimal landing page, authenticates, and the
profile is **atomically** assigned to their account; the invitation becomes
permanently consumed; the user gains Master Studio access (initially in the
`pending` state — see §6).

Two separate trust boundaries, one RPC each (M7):

| Boundary | Function | Grants | Mode |
|---|---|---|---|
| A — inspection | `public_inspect_master_claim_invitation(p_token)` | `anon`, `authenticated` | STABLE, read-only |
| B — atomic claim | `public_claim_master_profile(p_token)` | `authenticated` only | VOLATILE, mutating |

Both are `SECURITY DEFINER`, `search_path=''`, fully qualified, return the
established `{ok, code, data}` jsonb, and never leak a raw PostgreSQL error.
The mutating claim is **never** granted to `anon`.

## 2. Public state machine (Boundary A)

States the unauthenticated landing page may learn:

```
claimable ──(claim by user U)──► already_claimed        (terminal)
claimable ──(admin revoke)─────► revoked                (terminal)
claimable ──(time passes)──────► expired                (terminal)
anything unverifiable ─────────► invalid_or_unknown     (generic)
```

* `claimable` — active (`ready|sent|opened`), unexpired invitation on a fully
  eligible master. The ONLY state with a payload.
* `invalid_or_unknown` — malformed token, unknown token, master row missing,
  or master ineligible for non-ownership reasons. Deliberately ONE generic
  response: holders of no valid token learn nothing (anti-enumeration); the
  rare admin-side-drift case reads as "link nieaktualny — skontaktuj się z
  administracją", which is the correct user action anyway.
* `expired` / `revoked` — distinguishable ON PURPOSE: both are shown only to
  someone who possesses the actual 43-char token (2^256 space — unguessable),
  and the distinction drives correct UX ("poproś o nowy link").
* `already_claimed` — claimed invitation OR owned master (merged: ownership
  details are never differentiated publicly).

Inspection is **pure read**: it never materializes expiry (computed against
`expires_at` on the fly) and writes no events (no unauthenticated write path,
no scan-noise in the audit). The claim RPC is the materializer.

`opened` status tracking (open_count/opened_at columns exist since M2) is an
**explicitly deferred decision** — recording opens requires an unauthenticated
write path that must be abuse-weighed; the vocabulary keeps `opened` and the
admin UI already renders it. Deferred to Slice 4B review.

## 3. Claimable payload (public data contract)

Allow-listed, nothing else (`data` of the `claimable` response):

```json
{
  "state": "claimable",
  "master_name": "…",         // required for the landing page
  "city": "… | null",
  "avatar_url": "… | null",   // public storage URL (already public)
  "bio": "… | null",          // admin-prepared content intended for the invitee
  "expires_at": "timestamptz",// display only
  "auth_required": true
}
```

Never present, in any state: invitation UUID, master UUID, token material of
any kind (`token_prefix` included), actor ids, admin notes, delivery metadata,
audit history, or any other profile field. The app-side sanitizer
(`lib/claim/publicClaim.ts`) re-enforces the allow-list structurally.

## 4. Authenticated claim result contract (Boundary B)

Success codes (`ok: true`): `claimed`, `already_claimed_by_you` (winner
idempotency) — both carry `data.master_id` (+`master_name` on first claim).
Failure codes (`ok: false`, no data): `not_authenticated`, `invalid_token`
(malformed+unknown merged), `expired`, `revoked`, `already_claimed`,
`master_not_eligible`, `user_already_master`. App wrapper adds
`unexpected_error` for transport failures.

## 5. Atomicity, locking, concurrency

Claim sequence (single transaction):

1. `auth.uid()` — the ONLY source of claimant identity.
2. Token shape check → hash (`extensions.digest(p_token,'sha256')`) → lookup.
3. `pg_advisory_xact_lock(hashtextextended(master_id::text, 0))` — **the same
   key and order as every M4 admin RPC**, so claim serializes against claim,
   revoke, and regenerate for the same master (deadlock-free).
4. Re-read invitation `FOR UPDATE`; terminal outcomes / lazy expiry
   materialization (same model as M4; writes the `invitation_expired` event).
5. Master row `FOR UPDATE`; full eligibility re-check; one-master-per-user
   pre-check.
6. Subtransaction: invitation → `claimed` (`claimed_at`, `claimed_by`),
   **then** `sauna_masters.user_id := auth.uid()`. On `unique_violation`
   (same-account parallel claim of a different master) BOTH updates roll back
   and the stable `user_already_master` returns — **no partial state exists on
   any path**.
7. One `invitation_claimed` audit event (metadata: `token_prefix` only).

Concurrency guarantees: two users, same token → the advisory lock serializes;
exactly one winner; the loser re-reads `claimed` and gets `already_claimed`.
Winner repeats → `already_claimed_by_you` (no second event, no writes). The
one-active-per-master partial unique index means no other active invitation
can exist for the claimed master; terminal siblings are unaffected.

Token material on claim: `token_hash` is RETAINED (same as revoke) — the
claimed status makes it inert (all paths reject terminal rows before any hash
comparison is useful), and the 90-day retention job clears terminal-row hashes
uniformly. A claimed invitation is permanently consumed: no path re-activates
a terminal row.

## 6. Eligibility and ownership rules (derived, authoritative in DB)

| Rule | Value | Source |
|---|---|---|
| Claimable origin | `origin = 'admin_prepared'` only | M4 parity, M7 RPC |
| Master status | `pending` required | M4 parity, M7 RPC |
| Ownership | `user_id IS NULL` required | M4 parity, M7 RPC |
| Profile completeness | DB requires non-blank `name` only (invitation generation already enforced name+city+bio at the UI level) | M4 parity |
| Masters per user | at most ONE (`sauna_masters_user_id_unique`); any existing row (self-registered or other) blocks claim → `user_already_master` | SP-035 index |
| Claim changes status? | **No** — stays `pending`; moderation approves separately | M7 RPC (only `user_id` written) |
| Claim changes origin? | **No** — `admin_prepared` is immutable provenance | M1 guard |
| Immediate entitlement | Studio access in the `pending` experience (`StudioAccessNotice kind="pending"`); full Studio after moderation approval | `lib/workspace/masterServer.ts`, `app/(main)/studio/page.tsx` |

Guard interplay (the one schema-behavior change): `user_id` remains a
privileged column. M7 carves ONE data-derived transition out of the M1 guard:
non-moderator `user_id` change is allowed only when `old.user_id IS NULL`,
`new.user_id = auth.uid()`, `old.origin = 'admin_prepared'`, **and** a
`claimed` invitation for this master naming `auth.uid()` exists (written
moments earlier in the same transaction by the claim RPC — the only writer of
that state; the invitation table has no client DML). Defense in depth: direct
client UPDATEs cannot even reach the guard (`masters_update_own` USING
`user_id = auth.uid()` never matches an unclaimed row).

**Flagged product decisions (NOT resolved silently):**
1. `opened` tracking (§2) — deferred to 4B.
2. A user with an existing self-registered profile cannot claim a prepared one
   (`user_already_master`); resolution (merge/delete) is an admin runbook
   topic, out of RPC scope.
3. `sauna_masters.claimed_at` column — NOT added; claim time is authoritative
   on the invitation + event. Revisit if reporting needs it.
4. Post-claim auto-approve for pilot participants — NOT implemented (claim
   keeps `pending`); the pilot onboarding slice may propose it explicitly.
5. IP/user-agent capture on end-user events (M3 reserved the idea) — NOT
   implemented: PostgREST does not expose the client IP to the RPC, and adding
   it via server-passed parameters is a privacy decision to make consciously.

## 7. Audit model

| Moment | Event | Actor | Metadata |
|---|---|---|---|
| Public inspection | **none** (read-only; no scan noise) | — | — |
| Successful claim | `invitation_claimed` (new type, M7) | claimant | `{token_prefix}` |
| Winner repeat | none (idempotent read) | — | — |
| Expired-at-claim | `invitation_expired` | claimant | reason `materialized on claim attempt` |
| Other failures (invalid/revoked/claimed/ineligible/concurrent loser) | **none** — consistent with the M4 rejections-write-nothing model | — | — |

The claim event supports later investigation (which invitation, which master,
which account, when, which token prefix) **without** the raw token. M6
compatibility: `claimed_by` is `ON DELETE SET NULL` and the M6 constraint pins
the terminal state to `claimed_at` — deleting a claimant's account later
anonymizes the actor and keeps the history (verified behaviorally in M6).

## 8. Token-in-path risk assessment (for the 4B route)

The route contract is `/claim/master/[token]` (path segment). Facts, not
claims:

* **Vercel access/runtime logs DO record request paths** (observed directly in
  this project's runtime logs during 3B4). The tokenized path will appear
  there. Mitigations: token lifetime ≤ 60 days (default 14); permanently inert
  after claim/revoke/expiry; log access restricted to the project owner. This
  residual is ACCEPTED for the pilot and documented — do not claim otherwise.
* **Browser history** retains the URL. Same mitigation (token becomes inert);
  additionally the page must never render the token back into links.
* **Referrer leakage**: the 4B page MUST ship `Referrer-Policy: no-referrer`
  (page metadata/headers) so any outbound navigation strips the URL.
* **Analytics**: the repo currently loads no analytics; the claim route must
  keep it that way (contract-test in 4B).
* **New server-side redirects must never place the token in a query string**;
  the path segment stays the only carrier (see §9).
* Middleware: none exists in the repo today; 4B needs no middleware change for
  the claim route itself (auth checks are per-route).
* Storage: the raw token must never enter browser storage of any kind, cookies
  included (the 3B3 one-time-secret rules apply verbatim).

## 9. Auth-return design for Slice 4B (decided; NOT implemented in 4A)

Evaluated:

1. **Return to the same tokenized path via a login `next` param** — rejected:
   the token-bearing path inside a query string violates the no-token-in-query
   rule and rides through history/logs of the auth pages.
2. **Server-side claim context keyed by an opaque nonce** — rejected: to
   return the user to the tokenized route the raw token would have to be
   stored server-side (prohibited) — a hash cannot reconstruct the path.
3. **Encrypted/signed short-lived state (cookie or param)** — rejected: still
   token material in a cookie/param, plus new crypto surface.
4. **Inline authentication ON the claim landing page** — **CHOSEN**: the 4B
   page renders sign-in (and registration) inline at `/claim/master/[token]`.
   The token never leaves its path segment; there is no redirect, hence no
   return-path transport problem and no open-redirect surface. After
   authentication the same page re-renders (`claimable` + authenticated →
   "Przejmij profil" button → Boundary B).

   Trade-offs accepted: (a) auth UI is embedded/reused rather than the
   dedicated login page; (b) e-mail-confirmation signups leave the page — the
   confirmation callback lands on the default site URL, and the user re-opens
   the invitation link from their inbox (the invitation stays active until
   claimed; the 4B copy must explain this). Supabase `emailRedirectTo` MUST
   NOT point at the tokenized URL (it would push the token through Supabase's
   mail infrastructure).

Existing `app/(main)/auth/callback/route.ts` accepts an unvalidated `?next=`
path. It prefixes the deployment origin (no cross-origin redirect), but 4B
must still allow-list `next` values (path-only, known prefixes, never a
token-bearing path) as hygiene. Recorded as a 4B task, not changed in 4A.

## 10. Domain cutover dependencies (future; NOT part of Slice 4)

Target canonical origin: `https://sauna-planet.pl`. Nothing in M7 or the app
hardcodes any host (origin lives exclusively in `CLAIM_PUBLIC_ORIGIN` and
Vercel/Supabase configuration). The cutover checklist, in order:

1. Vercel: add `sauna-planet.pl` (+ decide `www` → apex 308 policy) to the
   production project; DNS per Vercel instructions.
2. Canonical redirect: `sauna-planet.vercel.app` → `sauna-planet.pl`
   permanent redirect AFTER auth flows are verified on the new origin.
3. `CLAIM_PUBLIC_ORIGIN=https://sauna-planet.pl` (Production scope) — newly
   generated claim links switch origin; previously generated links on the old
   origin keep working until the redirect policy decides otherwise (note:
   a redirect PRESERVES the path — token exposure is unchanged — but
   mixed-origin claim flows must be avoided: generate pilot links AFTER the
   cutover, or accept the vercel.app origin for the first wave).
4. Supabase Auth: Site URL → `https://sauna-planet.pl`; Additional Redirect
   URLs → exact-match list (production callback, Preview callback policy —
   Preview keeps its own alias entries; wildcards avoided).
5. Re-verify the claim landing + inline auth end-to-end on the new origin
   before sending any real invitation.

## 11. Slice 4A deliverables

* `supabase/2026-07-30_sp039_m7_public_claim.sql` — forward (drift-guarded,
  fail-loud, transactional; two RPCs + event vocabulary + guard carve-out).
* `supabase/2026-07-30_sp039_m7_public_claim_rollback.sql` — guarded rollback;
  honest: IMPOSSIBLE after any real claim, and rollback never un-claims
  ownership.
* `lib/claim/publicClaim.ts` — pure public contract (states, codes, PL
  messages, allow-list sanitizers, shape gate).
* `app/claim/actions.ts` — the only app gateway to the M7 RPCs (fail-closed
  wrappers; no route/page yet).
* Tests: `claimPublicSql.test.ts` (migration contract),
  `publicClaim.test.ts` (pure model),
  `publicClaimActionContract.test.ts` (static + behavioral wrapper contract).

Out of scope here (4B+): the `/claim/master/[token]` page, inline auth UI,
callback allow-listing, `Referrer-Policy`, opened-tracking decision, domain
cutover, real invitations.

---

## 12. MANDATORY pilot scope: public profile card and publication lifecycle

Owner decision (2026-07-30): the pilot is complete only when a claimed
saunamaster can **complete, preview, explicitly publish, and later edit** a
public profile card. This section records the current-state inspection and the
accepted publication architecture. Implementation: Slice 4C (+ migration M8).

### 12.1 Current state (inspected, not assumed)

| Question | Finding |
|---|---|
| Public list route | `/masters` (`app/masters/page.tsx`) — non-admin query filters `.eq('status','approved')`; RLS enforces the same |
| Individual route | `/masters/[idOrSlug]` — dual lookup: case-insensitive slug or UUID; slug preferred (unique partial index on `lower(slug)`) |
| Public visibility predicate | `masters_select` RLS: `status='approved' OR user_id=auth.uid() OR is_platform_moderator()` (SP-035d) |
| Statuses | `pending / approved / rejected` (`sauna_masters_status_check`); ONLY `approved` is public |
| Visibility coupled to status? | YES — fully. There is NO owner-controlled publication state today |
| `pending` behavior | visible to self + moderation only; Studio shows `StudioAccessNotice kind="pending"` and HIDES the editor (deferred Slice-2 decision) |
| Separate publication field required? | YES — see §12.2 (claim must not auto-publish; owner-explicit publish must be separable from moderation) |
| Completeness evaluator | `lib/master/completeness.ts` (8 weighted items) — REUSED for the "recommended fields" meter |
| Studio editing | `/studio/profile` full form via `updateOwnMasterProfile` (server action, RLS `masters_update_own`, privileged-column guard) — **approved owners only today** |
| Owner preview of unpublished profile | Already works structurally: the owner arm of `masters_select` renders the REAL `/masters/[idOrSlug]` page for a non-public profile — this IS the preview |
| Related data on the card | approved affiliations (with primary highlight), next upcoming event, approved credentials, level badge, founding-partner badge, rating (hidden when `review_count=0`), specialties/languages chips, social/website (hide-empty) |

### 12.2 Publication model (accepted design)

Two orthogonal axes — moderation (`status`, moderator-managed, guard-protected)
and publication (`published_at timestamptz`, NEW in M8, owner-controlled):

| Conceptual state | Representation | Publicly visible? |
|---|---|---|
| prepared & unclaimed | `origin='admin_prepared'`, `user_id NULL`, `pending`, `published_at NULL` | no |
| claimed draft | `user_id` set, `published_at NULL` | no (owner+moderation only) |
| published | `status='approved'` AND `published_at NOT NULL` | **yes** |
| submitted for publication (pilot) | `pending` + `published_at NOT NULL` | no — awaiting moderation; surfaced in the admin pilot list |
| suspended | moderator flips `status` off `approved` (publication flag untouched) | no |

M8 changes (versioned forward+rollback, PRE/POST protocol):
1. `published_at timestamptz` column (nullable, additive).
2. `masters_select` public arm becomes `status='approved' AND published_at IS
   NOT NULL` (owner/moderator arms unchanged). **Backfill**: every existing
   `approved` row gets `published_at = now()` (grandfathering — the current
   public directory must not blink).
3. DB checks (fail-closed):
   `published_at IS NULL OR origin <> 'admin_prepared' OR user_id IS NOT NULL`
   (an unclaimed admin-prepared profile can NEVER be published), and
   `published_at IS NULL OR (name, city, bio all non-blank)` (a published
   profile cannot be emptied below the minimum — the offending edit fails and
   forces explicit unpublish first).
4. `published_at` is NOT added to the privileged-column guard (owner-managed on
   the own row via RLS); publish/unpublish ships as a dedicated server action
   with server-side ownership re-read.

Rules (explicit answers to the required questions):
* **Minimum required for publication:** `name`, `city`, `bio` (the invitation
  readiness trio — same vocabulary the moderator already prepared against).
* **Soft recommendations:** avatar, cover, specialties, languages, social
  links, website, experience year — surfaced via the completeness meter, never
  blocking.
* **Who publishes:** the claimed owner (explicit action); moderators may also
  publish/unpublish (support cases).
* **Who unpublishes:** the owner (their card) and moderation (suspension via
  `status`, which hides the card regardless of the publication flag).
* **Moderator approval for the pilot: REQUIRED.** Claimed profiles are
  `pending`; the owner's "Opublikuj" sets `published_at`, and the card goes
  live when moderation approves (`status='approved'`). Prepared content is
  admin-authored, but post-claim edits are not — one approval gate before
  first exposure is the CLAUDE.md-consistent choice. After approval,
  subsequent owner edits of non-privileged fields are immediately public
  (accepted for the pilot; field-level moderation is out of scope and flagged).
* **Published-then-incomplete:** impossible below the DB minimum (check #3);
  above it, it is the owner's card.
* **Owner-account deletion:** OPEN — see the M8-blocking finding in §12.4.
* **Moderator suspension:** `status` flip; re-approval restores the card
  (publication flag persists).

### 12.3 Pilot card field matrix

| Field | Class |
|---|---|
| name, city, bio | **required for publication**, owner-editable |
| avatar, cover, specialties, languages, social links, website, experience year | recommended, owner-editable |
| affiliations (approved), upcoming events, credentials (approved), rating/review count | derived from other tables |
| level, status, is_founding_partner, origin, user_id, rating fields | moderator-managed (privileged guard) |
| publication state (`published_at`) | owner-managed (+ moderation override) |
| last-updated | derived; display decision for 4C |

Never on the public card (structurally separate tables with no public grants,
verified in M2/M3): admin notes, invitation state, actor ids, delivery
metadata, claim audit. Pre-existing `SELECT *` UUID-exposure backlog items
(KNOWN_ISSUES) remain tracked separately; 4C must not widen them.

### 12.4 NEW M6-class finding (M8 blocker, catalog probe required)

The repository SQL does **not** record how `sauna_masters.user_id` was added,
so its FK delete action is unknown. Every possibility conflicts with a live
guard when the OWNER's auth account is deleted: `ON DELETE SET NULL` fires the
M1/M7 UPDATE guard (deletion context has `auth.uid() NULL` → the claim
carve-out does not apply → raise → account undeletable — the M6 defect pattern
on a second table); `ON DELETE CASCADE` fires the M5 delete guard (raise) and
would violate history preservation anyway; `RESTRICT`/no-FK block or orphan
the link. M8 must probe `pg_constraint` for the live definition and design the
account-deletion path (expected direction: SET NULL plus a guard carve-out for
the FK-update context, mirroring the M6/M7 techniques). Until then: do NOT
delete any account that owns a master profile.

### 12.4a M8 resolution (Slice 4C1 — APPLIED AND VERIFIED 2026-07-30)

Catalog probe confirmed `sauna_masters_user_id_fkey → auth.users(id) ON
DELETE SET NULL` (nullable, 1:1 partial unique). M8
(`supabase/2026-07-30_sp039_m8_owner_deletion_compat.sql`) resolves the
finding: a second data-derived guard carve-out for exactly the FK-driven
shape (`old.user_id NOT NULL → NULL` with no authenticated principal —
unreachable for clients through RLS), plus a dedicated
`BEFORE UPDATE OF user_id` trigger that, in the SAME transaction, withdraws
publication (`approved → pending`) and appends one `owner_account_deleted`
event. Documented post-deletion state: master remains, `user_id NULL`,
`pending` (pilot list buckets it as attention), claimed invitation stays
terminal (nothing re-claimable without a NEW moderator invitation), history
intact + explicit event; "previously claimed, owner deleted" is
distinguishable (`user_id IS NULL` + claimed invitation + event). The
carve-out was narrowed on owner review with the whole-row invariant
`(to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id')` — only the PURE
FK shape passes; a trusted-context UPDATE touching any other column keeps
raising.

Applied to Production 2026-07-30 through the established PRE/POST protocol:
PRE-APPLY P1–P7 GREEN; POST-APPLY catalog GREEN (both guard arms + row
invariant, eight-type vocabulary, BEFORE UPDATE OF user_id trigger pair in
deterministic order, function ACL postgres-only); behavioral suite 16/16 via
a self-rolling-back fixture (real auth-account deletion of an approved owned
master SUCCEEDED; master retained with ownership anonymized and publication
withdrawn to `pending`; exactly one identifier-free owner_account_deleted
event; claimed invitation terminal with the M6-anonymized actor; mixed-field
and self/stranger detach attempts blocked; M5 intact; zero persistent
fixtures). **The operational no-owner-account-deletion restriction is
LIFTED** — deleting an auth account that owns a master profile is safe.

### 12.6 Publication lifecycle — refined for Slice 4C2 (owner brief 2026-07-30)

Explicit `publication_status` (M9, additive column with CHECK) instead of a
bare timestamp — the moderation loop needs submitted/changes-requested states
that a single timestamp cannot express unambiguously:

```
draft ──submit──► submitted ──approve──► published
  ▲                  │  ▲                  │
  │        changes_requested │            unpublish / material edit
  └──────(owner edits)───────┘◄────────────┘
suspended: moderator-only, from any state; owner-deleted: M8/M9 withdrawal
```

* States: `draft | submitted | changes_requested | published | suspended`.
  "Unpublished" is `draft` reached from `published` (the transition is the
  audited fact). Owner-deleted = `user_id IS NULL` (+ M9 extends the M8
  trigger to force `publication_status` out of `published`).
* Companions (M9): `published_at`, `publication_reviewed_at`,
  `publication_reviewed_by uuid ON DELETE SET NULL`,
  `publication_review_note text ≤2000` (moderator feedback, never public);
  append-only `master_publication_events` table (M3 pattern; types:
  profile_submitted, publication_approved, changes_requested,
  profile_unpublished, profile_suspended, owner_publication_withdrawn —
  meaningful transitions only, no per-keystroke noise; actors SET NULL).
* Hard publication requirements (brief-mandated): name, city, bio, avatar,
  ≥1 specialization, owner present (`user_id NOT NULL`), not suspended.
  Soft: social links, facilities, events, credentials, level, website
  (completeness meter reuses `lib/master/completeness.ts`).
* Public predicate (M9 replaces the §12.2 draft):
  `status='approved' AND publication_status='published' AND user_id IS NOT
  NULL` (+ owner/moderator arms). ⚠️ DECISION FLAGGED, not silent: the
  owner-present requirement HIDES the ~6 legacy approved unclaimed masters
  from the current public directory. Options at M9 PRE-APPLY: (a) strict
  (brief-literal; directory shrinks to owned profiles), (b) grandfather
  legacy `self_registered` unclaimed rows. Owner decides at M9.
* Editing after publication (conservative pilot rule, brief-preferred): ANY
  owner edit of public profile fields on a `published` profile moves it to
  `submitted` and clears `published_at` (hidden until re-approved). No
  versioned-draft model in the pilot.
* Authorization: owner — edit own draft, submit, unpublish own, preview own;
  moderator — approve/reject(changes_requested)/unpublish/suspend + preview
  any; owner can NEVER self-approve (transition RPCs are moderator-gated
  internally, M4 pattern). All transitions via SECURITY DEFINER RPCs with
  events in the same transaction; stable codes; idempotent where reasonable
  (re-submit of submitted → no-op code).
* Preview: reuse `/masters/[idOrSlug]` (the RLS owner/moderator arms already
  render non-public profiles) + a visible "PODGLĄD — profil niepubliczny"
  banner when the viewer is owner/moderator and the profile is not published.
  No duplicate card implementation.

### 12.5 Delivery sequence (revised) and pilot-readiness gate

* **4A** — claim architecture + atomic RPC foundation (M7) — DONE (applied+verified).
* **4B** — public claim page + inline auth return, `Referrer-Policy`,
  callback `next` allow-list, opened-tracking decision.
* **4C** — Master Studio editing for CLAIMED `pending` owners (lifting the
  Slice-2 deferral), preview affordance, publication lifecycle (M8:
  `published_at`, predicate, checks, backfill, account-deletion fix).
* **4D** — `sauna-planet.pl` domain + Supabase Auth cutover (§10).
* **4E** — full pilot E2E:
  `prepare → invite → authenticate → claim → edit → preview → publish → verify public page`.

**Pilot-readiness gate — no real invitation is sent until ALL verified:**
claim link works on the canonical domain; ownership assignment atomic; the
user reaches Master Studio; profile fields owner-editable; an unpublished
profile stays private (anon + stranger probes); publication is an explicit
owner action behind the moderation gate; the public page renders correctly;
the profile appears in `/masters`; unauthorized edit AND publish attempts
fail; the flow works on mobile; no raw token or private claim metadata leaks
anywhere in the flow.
