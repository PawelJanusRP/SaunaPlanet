# SP-039 Slice 4 — Public Master Claim (Architecture Decision Record)

Status: Slice 4A accepted design (database foundation committed; **not applied**
until the M7 PRE-APPLY package is authorized). Slices 4B (public UI + auth
return), 4C+ (onboarding) implement against this contract.

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
