# SP-039 Slice 3A — Admin-Prepared Profiles & Claim Invitations: Implementation Design

Status: **DESIGN / SQL-REVIEW — NOT IMPLEMENTED**. Implementation-ready design
for the **administration side only** of the pilot preparation process. No
application code, SQL, migration, test, dependency, or Supabase change is
produced here. Companion to the approved architecture
`docs/SP039_CLAIM_ARCHITECTURE.md` (Slice 2); this document refines its approved
decisions into a build-ready plan and defers everything end-user / claim-side to
Slice 4+.

Scope guard: Slice 3 implements admin prepare + invitation **generation /
mark-sent / revoke / regenerate / audit / pilot list**. It does **not** implement
`claim_master_profile`, claim preview, auth-return, the HttpOnly cookie, the
pending-master editor, publication changes, email/SMS/WhatsApp, moderator detach,
or recurring sessions. The schema and audit model remain forward-compatible with
Slice 4/5.

Binding inputs: the 18 approved decisions in the task brief and §22.1 of
`docs/SP039_CLAIM_ARCHITECTURE.md`.

---

## 1. Current-state findings (read-only inspection)

**Admin surface.** `app/(main)/admin/page.tsx` (582 lines) is a single
server-rendered page with a `?tab=` query param, a `tabs` array carrying live
count badges, a shared `statusLabel` badge map (`pending`/`active`/`approved`/
`rejected`/`inactive` → Polish label + Tailwind classes), and a **`masters`
moderation tab** already present. `app/(main)/admin/actions.ts` holds
`'use server'` actions gated by `assertAdmin()` (`getCurrentUserRole()` ∈
{`admin`,`moderator`}), most using the RLS client for writes and
`supabase.rpc('admin_update_user_role', …)` for the one privileged operation —
the established pattern: **moderator-gated server action → DEFINER RPC for
privileged/atomic work**, Polish error strings, `revalidatePath('/admin')`.

**Master model.** `sauna_masters`: `id`, `user_id` (nullable, partial-unique
`sauna_masters_user_id_unique`), `level`, `status`
(`pending`/`approved`/`rejected`), `home_sauna_id` (frozen legacy), `rating`,
`review_count`, and the Slice-1 additions (`slug` partial-unique on
`lower(slug)`, `city`, `specialties`, `languages`, `experience_since_year`,
`social_links`, `website`, `cover_image_url`, `is_founding_partner`).

**RLS/guards (live).** `masters_select` = `approved OR user_id = auth.uid() OR
is_platform_moderator()`; `masters_insert_self` (moderator, or self+pending);
`masters_update_own`; `masters_update_moderation`; trigger
`guard_master_privileged_columns` (BEFORE UPDATE) protecting `level`, `status`,
`user_id`, `home_sauna_id`, `is_founding_partner`, `rating`, `review_count`;
trigger `guard_master_insert_level` (BEFORE INSERT) forcing `level='guest'` for
non-moderators. Helpers: `is_platform_moderator()` (role ∈ moderator/admin),
`is_master_owner(uuid)`, `is_admin()` (role = admin).

**`masters_delete` (unversioned live policy).** Not present in the versioned
migrations; the historical aggregate `supabase/all_scripts_history.sql`
(lines 1477–1482) shows `create policy "masters_delete" on public.sauna_masters
for delete using (public.is_admin())` — **admin-only** (not moderator). `is_admin()`
in that file is `role = 'admin'`, SECURITY DEFINER, `stable`, **without a pinned
`search_path`** (later helpers pin it). This is the exact drift to version (§13).

**RPC conventions (reusable).** SP-037B `submit_facility_with_master_event` and
SP-038 `link_import_to_submission`: SECURITY DEFINER, `set search_path = ''`,
fully-qualified refs, self-authorization + explicit privilege check, `revoke …
from public, anon` + `grant execute … to authenticated`, atomic
one-transaction bodies, `unique_violation` caught → clean no-op, structured
return (`jsonb`/`boolean`). Advisory-lock + count-cap concurrency in SP-036
`guard_sauna_submission_cap`.

**Audit / rate-limit substrate.** `import_log`: append-only (SELECT+INSERT
policies only, no UPDATE/DELETE), FK `on delete set null`, partial unique index,
rolling-window rate-limit index `(requested_by, created_at)`. The claim work adds
its own `master_claim_events` following this posture.

**Crypto availability.** `gen_random_uuid()` is in use; `pgcrypto` is referenced
by several migrations. `pgcrypto` provides `gen_random_bytes()` and `digest()` —
availability must be re-confirmed in the production preflight (§Preflight).

**Conclusion.** Reuse `sauna_masters` (add only `origin` now); add
`master_claim_invitations` + `master_claim_events`; do all invitation logic in
moderator-gated DEFINER RPCs; read the admin lists via a DEFINER projection that
never exposes `token_hash`; version `masters_delete` first to clear drift before
adding claim-table delete dependencies.

---

## 2. Final Slice 3 data model — `sauna_masters` additive change

**Only `origin` is added in Slice 3.** The other approved dimensions are added by
the slice that first writes them (YAGNI + migration-aligns-with-behavior):
`claimed_at` → Slice 4 (written by the claim RPC); `identity_verified_at`,
`qualifications_verified_at` → whenever the verification UI lands. None has a
Slice-3 writer, and all are additive-nullable later, so deferring costs nothing.

| Field | SQL type | Null | Default | Allowed | Owner / who updates | Populated | Public |
|---|---|---|---|---|---|---|---|
| `origin` | `text` | NOT NULL | `'self_registered'` | `self_registered`, `admin_prepared` (CHECK) | Moderator only (guard-protected, §12) | At insert (moderator sets `admin_prepared` when preparing) | Yes (non-secret; visible on the row like other columns) |

`origin` is the **prepared** dimension made explicit and permanent. It gates
invitation eligibility (§7) and keeps admin-prepared rows distinguishable from
self-registered `pending` rows without overloading `status` (which stays
moderation-only, approved decision 15).

Deferred (documented, **not** added now): `claimed_at timestamptz null`
(Slice 4), `identity_verified_at timestamptz null`, `qualifications_verified_at
timestamptz null`.

---

## 3. `master_claim_invitations` — proposed table

```
id                   uuid  primary key default gen_random_uuid()
master_id            uuid  not null references public.sauna_masters(id) on delete cascade
token_hash           bytea                              -- SHA-256(token) raw 32 bytes; UNIQUE; nullable ONLY after retention cleanup (§16 arch)
token_prefix         text  not null                     -- first 8 chars of base64url token; NON-secret, diagnostics
status               text  not null default 'ready'
                     check (status in ('created','ready','sent','opened','claimed','expired','revoked'))
expires_at           timestamptz not null               -- authoritative validity (default created_at + 14 days)
delivery_channel     text  check (delivery_channel in ('email','messenger','whatsapp','sms','other'))
delivery_target_hint text                               -- REDACTED hint only (e.g. 'j***@gmail.com'); never a full address/number
admin_note           text
created_by           uuid  references auth.users(id) on delete set null
created_at           timestamptz not null default now()
ready_at             timestamptz
sent_at              timestamptz
opened_at            timestamptz                        -- Slice 4
last_opened_at       timestamptz                        -- Slice 4
open_count           integer not null default 0         -- Slice 4
claimed_at           timestamptz                        -- Slice 4
claimed_by           uuid  references auth.users(id) on delete set null   -- Slice 4
revoked_at           timestamptz
revoked_by           uuid  references auth.users(id) on delete set null
```

Keys / constraints:

* `master_id` FK **`on delete cascade`** — an invitation is meaningless without
  its profile (delete is gated separately, §14).
* `create unique index master_claim_invitations_token_hash_uidx on (token_hash)
   where token_hash is not null;` — partial so retention-nulled rows don't
   collide.
* `create unique index master_claim_invitations_active_uidx on (master_id)
   where status in ('created','ready','sent','opened');` — **one active per
   master**; predicate is **explicit statuses only**, never `now()`/`expires_at`.
* `create index master_claim_invitations_master_idx on (master_id, created_at desc);`
* CHECK `token_hash is not null or status in ('claimed','expired','revoked')` —
  the hash may be nulled only after a terminal state (retention).
* CHECK `(status = 'claimed') = (claimed_by is not null)` — no half-claim
  (reserved for Slice 4; created rows are never `claimed`).
* CHECK `(status = 'revoked') = (revoked_by is not null)`.
* CHECK `sent_at is null or status in ('sent','opened','claimed','expired','revoked')`
  — a send timestamp implies the row progressed past generation.

**`created_by`/`claimed_by`/`revoked_by` reference `auth.users(id)`** (the
repository identity abstraction used by `master_affiliations`, `import_log`,
etc.), `on delete set null` so the audit skeleton survives account deletion.

**Delivery metadata is minimized:** store `delivery_channel` (enum) + an optional
**redacted** `delivery_target_hint`; **never** a full email, phone, or social
handle (approved: manual delivery, decision 12; privacy).

---

## 4. `master_claim_events` — audit table (Slice 3 vocabulary)

```
id            uuid primary key default gen_random_uuid()
invitation_id uuid references public.master_claim_invitations(id) on delete set null
master_id     uuid references public.sauna_masters(id) on delete set null
event_type    text not null check (event_type in (
                 'profile_prepared','invitation_created','invitation_sent',
                 'invitation_revoked','invitation_regenerated','invitation_expired'
                 -- reserved (NOT emitted in Slice 3): 'invitation_ready',
                 -- 'invitation_opened','auth_started','claim_attempted',
                 -- 'claim_succeeded','claim_rejected','moderator_recovery',
                 -- 'ownership_detached','duplicate_conflict_opened',
                 -- 'duplicate_conflict_resolved','profile_submitted','profile_approved'
              ))
actor_user_id uuid references auth.users(id) on delete set null
reason        text                       -- required for revoke; free-form moderator note
delivery_channel text                    -- copied on 'invitation_sent'
metadata      jsonb                       -- token_prefix at most; NEVER the raw token
created_at    timestamptz not null default now()
```

* **No `ip`/`user_agent` for admin actions in Slice 3** — the actor is an
  authenticated, trusted moderator (`actor_user_id` is sufficient); IP/UA are
  reserved for the *end-user* claim/preview events in Slice 4, where they matter
  for abuse. This keeps admin audit PII-minimal.
* Indexes: `(master_id, created_at desc)`, `(invitation_id, created_at desc)`,
  `(actor_user_id, event_type, created_at)` (the last also serves the §15
  rate-limit windows).
* **Immutability:** INSERT only via DEFINER RPCs; moderator SELECT; **no UPDATE,
  no DELETE** policies. Retention per §16.
* **Authoritative operational state = the invitation row** (`status` +
  timestamps). `master_claim_events` is the append-only *history*; if the two
  ever diverge, the invitation row governs live behavior and the event stream is
  the forensic record. `invitation_created`/`_sent`/`_revoked` events are written
  in the same transaction as the corresponding row change, so divergence is only
  possible via out-of-band surgery (itself audited).

`event_type` is emitted in Slice 3 for exactly: `profile_prepared` (optional, on
first admin_prepared insert), `invitation_created`, `invitation_sent`,
`invitation_revoked`, `invitation_regenerated`, `invitation_expired`
(materialization). Everything else is reserved and unimplemented.

---

## 5. Final invitation state transitions

Approved vocabulary retained in the CHECK for forward-compatibility, but Slice 3
**emits the minimal set**:

* **Creation starts at `ready`** (approved decision 2 recommendation): a generated
  invitation carries a live token and is immediately usable — there is no
  meaningful pre-ready invitation state. `created` stays a legal-but-**unused**
  value (kept only so the active-index predicate and Slice-2 vocabulary are
  stable); no code emits it and no `admin_mark_master_claim_ready` RPC exists.
* **Active statuses:** `{created, ready, sent, opened}` (index predicate
  unchanged). In Slice 3 the reachable active set is `{ready, sent}`.

| Transition | When | Slice |
|---|---|---|
| (insert) → `ready` | `admin_create` / `admin_regenerate` | **3** |
| `ready` → `sent` | `admin_mark_sent` | **3** |
| `ready`/`sent` → `revoked` | `admin_revoke` / regenerate of a live row | **3** |
| `ready`/`sent` → `expired` | cleanup / pre-generation materialization | **3 (cleanup)** |
| `sent` → `opened` | end-user opens link | **4** |
| `opened` → `claimed` | atomic claim | **4** |
| `ready`/`sent`/`opened` → `expired` | cleanup | 3+ |

`expires_at` is authoritative everywhere; **an active-looking status is never
sufficient** — reads/claims check `now() < expires_at`. Expired active rows are
**materialized to `expired` before any replacement generation** (§6).

---

## 6. Active-invitation locking & concurrency

The hard case: two `admin_create` calls for a master with **no existing
invitation row** — there is no row to `FOR UPDATE`, so row locks alone cannot
serialize them. Recommended combination:

1. **Advisory transaction lock keyed by `master_id`** at the top of
   create/regenerate: `perform pg_advisory_xact_lock(hashtextextended(
   p_master_id::text, 0))`. Serializes all generation for one master, even with
   zero existing rows. (Same strategy as `guard_sauna_submission_cap`.)
2. `SELECT … WHERE master_id = :m AND status IN ('created','ready','sent','opened')
   FOR UPDATE` — lock existing active rows.
3. **Materialize** any locked row with `now() >= expires_at` → `status='expired'`
   (+ `invitation_expired` audit).
4. Decide per RPC (§7): `admin_create` → if a **live** active row remains, return
   `active_invitation_exists`; `admin_regenerate` → revoke it (+ audit) then
   insert.
5. `INSERT` the new `ready` row.
6. **`master_claim_invitations_active_uidx` is the final backstop** — even if the
   advisory lock were bypassed, the partial unique index rejects a second active
   row (`unique_violation` → mapped to `generation_conflict`).

This is race-safe with zero prior rows (advisory lock) and race-safe against
index-level double-insert (partial unique). Both layers are independent.

---

## 7. Admin invitation RPCs (contracts)

All: `security definer`, `set search_path = ''`, fully-qualified refs, first
statement `if not public.is_platform_moderator() then raise …`, `revoke all …
from public, anon`, `grant execute … to authenticated`. All return a **structured
`jsonb`** `{ ok, code, data }` for clean server-action mapping (expected
conflicts are codes, not raw RAISE). Token generation is **in PostgreSQL** (see
decision 5): the RPC is the single trust boundary for entropy + hashing + auth +
atomicity, so the browser/server can never inject a chosen hash.

### `admin_create_master_claim_invitation(p_master_id uuid, p_valid_days int default 14, p_admin_note text default null)`
* Auth: moderator. Lock: advisory (§6). Validate: master exists;
  `user_id IS NULL`; `origin = 'admin_prepared'`; not claimed; eligible (§7 rules).
* Materialize expired active rows; if a **live** active row remains → return
  `{ok:false, code:'active_invitation_exists'}` (does **not** auto-revoke —
  approved decision 3).
* Generate: `v_token := translate(encode(gen_random_bytes(32),'base64'),'+/','-_')`
  with `=` trimmed (base64url, 256-bit); `v_hash := digest(v_token,'sha256')`;
  `v_prefix := left(v_token, 8)`.
* Insert `ready` row (`expires_at = now() + make_interval(days => p_valid_days)`);
  write `invitation_created` audit (metadata `{token_prefix}`, **no raw token**).
* Return `{ok:true, code:'created', data:{ invitation_id, token_prefix,
  expires_at, raw_token }}` — **`raw_token` returned exactly once**, never stored,
  never in audit/logs.

### `admin_mark_master_claim_ready` — **not implemented** (created starts `ready`, §5).

### `admin_mark_master_claim_sent(p_invitation_id uuid, p_delivery_channel text, p_delivery_target_hint text default null)`
* Auth: moderator. Legal transition only: `ready → sent` (idempotent: already
  `sent` → `{ok:true, code:'already_sent'}`; terminal/other → `invalid_transition`).
* Set `status='sent'`, `sent_at=now()`, `delivery_channel`, redacted
  `delivery_target_hint` (server pre-redacts; RPC stores as-given). Audit
  `invitation_sent` (+ channel). Return `{ok:true, code:'sent'}`.

### `admin_revoke_master_claim_invitation(p_invitation_id uuid, p_reason text)`
* Auth: moderator. **`p_reason` required** (non-empty else `reason_required`).
  Legal: active (`ready`/`sent`/`opened`) → `revoked` (terminal). Idempotent:
  already `revoked` → `{ok:true, code:'already_revoked'}`; other terminal →
  `invitation_already_terminal`.
* Set `status='revoked'`, `revoked_at=now()`, `revoked_by=auth.uid()`. **Token
  hash retained** (nulled later by the 90-day retention job, approved decision
  11 — not at revoke time). Audit `invitation_revoked` (+ reason).

### `admin_regenerate_master_claim_invitation(p_master_id uuid, p_reason text, p_valid_days int default 14)` — **separate RPC** (decision 4)
* Auth: moderator. Advisory lock; materialize expired; **revoke** any live active
  row (reason; audit `invitation_regenerated`, **never rotate the row in place**);
  then run the same generate+insert as create. Returns the new `raw_token` once.
* History preserved: the old row stays `revoked`; the new row is a fresh id/token.

### `admin_list_claim_invitations()` / `admin_get_claim_invitation(p_id uuid)` — read projection (decision 9)
* Auth: moderator. **DEFINER projection that never selects `token_hash`** —
  returns `id, master_id, master_name, status, token_prefix, expires_at,
  delivery_channel, delivery_target_hint, timestamps, open_count`. Backs the
  admin list/detail so the browser never receives the hash.

Per-RPC summary — every one defines: params (above); auth = moderator; locks
(advisory for generate, none for sent/revoke beyond the row); validations
(above); one transaction; `jsonb {ok,code,data}` result; stable codes (§16);
audit event; idempotency (above); denied cases (`not_authorized`,
`master_not_found`, `master_already_claimed`, `master_not_eligible`,
`active_invitation_exists`, `invitation_not_found`, `invalid_transition`,
`invitation_already_terminal`, `generation_conflict`, `reason_required`,
`rate_limited`).

---

## 8. Prepared-profile eligibility (MVP rule set)

A profile is eligible for a claim invitation **iff all**:

* `user_id IS NULL` (never invite a profile already linked to an account —
  approved: an invitation must not assign ownership to an owned profile);
* `origin = 'admin_prepared'`;
* `status = 'pending'` (not `approved`, not `rejected`);
* no **live** (non-expired) active invitation already exists (else
  `active_invitation_exists`; regenerate is the explicit path);
* minimum data present: **`name` non-empty** (the only hard requirement; richer
  completeness is surfaced as a soft admin warning, not a block).

Consequently **ineligible:** rejected profiles; approved unclaimed profiles
(approving an unclaimed prepared profile is out of the pilot flow — a claim must
precede public approval, decision 16); self-registered profiles (`origin =
self_registered`); already-claimed profiles. Rationale for the 10-person pilot:
keep the gate tight and unambiguous; every invited profile is a clean,
moderator-prepared, unclaimed, non-public row.

---

## 9. Admin UI & pilot workflow

**Route: extend the existing admin panel with a new tab** `/admin?tab=pilot`
("Pilot saunamistrzów") rather than a separate `/admin/masters/*` tree — reuses
the established tabbed shell, `assertAdmin`, `statusLabel`, count-badge, and
`revalidatePath('/admin')` conventions; lowest surface, no new layout. A
per-profile detail can be a sub-view (`/admin?tab=pilot&master=<id>`).

The list is **explicitly limited to the pilot cohort** = `origin =
'admin_prepared'` masters (not all masters — the generic `masters` moderation tab
stays as-is).

* **Columns:** name · moderation status badge · origin · ownership
  (unclaimed / claimed) · completeness % · active-invitation status
  (none / ready / sent / expired) · last event.
* **Filters:** by invitation status; by "needs action" (ready-not-sent).
* **Badges:** reuse `statusLabel`; add invitation-status badges
  (ready = blue, sent = indigo, revoked/expired = gray, claimed = green).
* **Primary actions:** Create prepared profile · Edit pilot fields · Generate
  invitation · Copy link (once) · Mark sent (channel picker) · Revoke ·
  Regenerate · View history.
* **Empty state:** "No prepared profiles yet — prepare the first pilot master."
* **Warning states:** ready-not-sent nudge; "profile incomplete" soft warning;
  "expired invitation — regenerate"; **one-time-token warning** (§21).
* **Destructive confirmations:** Revoke (reason required) and Regenerate
  ("this invalidates the current link") use a confirm dialog.

Not a generic CRM — only the pilot preparation actions above.

**Human workflow (first 10):** 1) select candidate → 2) Create prepared profile
(`origin=admin_prepared`, `status=pending`) → 3) fill pilot fields → 4) review
completeness → 5) (profile-)ready → 6) Generate invitation → 7) **copy link once**
→ 8) send manually (email/Messenger/WhatsApp) → 9) Mark sent + record channel →
10) observe lifecycle → 11) Revoke/Regenerate as needed.

---

## 10. Pilot cohort tracking — decision

**No table, no permanent boolean.** The cohort is exactly `origin =
'admin_prepared'`; the pilot tab lists those rows joined to their latest
invitation. A temporary 10-person campaign must not add a permanent
`is_pilot_candidate` column or a cohort table to a long-term domain entity
(approved-style guidance). If a future named campaign needs grouping, use a
generic tag/`admin_note` — **out of scope now**. Pilot tracking therefore stays
**operational** (a filtered admin view), needs no Slice-3 schema beyond `origin`.

---

## 11. RLS & privilege matrix

| Object | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `master_claim_invitations` | **none for clients** (RLS on, no policy); reads via DEFINER `admin_list/get` projection (no `token_hash`) | none (DEFINER RPC only) | none (DEFINER RPC only) | none (moderator RPC/guard only, §14) |
| `master_claim_events` | moderator (`is_platform_moderator()`) | none (DEFINER RPC only) | **none** | **none** |
| `sauna_masters.origin` | covered by existing `masters_select` (non-secret) | moderator arm of `masters_insert_self` | guard-protected (§12) | existing `masters_delete` |

* Invitations: `alter table … enable row level security` with **no grants** to
  `anon`/`authenticated` for direct DML and **no policies** → default-deny; all
  access is through the DEFINER RPCs. `token_hash` never leaves the DB.
* **Why a DEFINER read projection, not a moderator SELECT policy:** RLS is
  row-level and cannot hide a *column*; a `select *` under a moderator SELECT
  policy would leak `token_hash`. A DEFINER projection is the least-error-prone
  guarantee that the hash is never selectable (decision 9).
* Events: a moderator SELECT policy is safe (no secret column) and simplest for
  the history view; INSERT only via DEFINER RPCs; no UPDATE/DELETE → append-only.

---

## 12. Guard-trigger implications

Slice 3 **does** need a guard change — additive, never weakening the existing
seven-field protection:

* **UPDATE guard (`guard_master_privileged_columns`):** add **`origin`** as an
  8th protected column (non-moderators may not change provenance). Existing seven
  fields unchanged.
* **INSERT guard (`guard_master_insert_level`):** additionally force
  `new.origin := 'self_registered'` for non-moderators (mirrors the existing
  `level := 'guest'` clamp) so a self-registering user cannot mint an
  `admin_prepared` row.
* **Slice 4 carve-out is NOT added now:** the `user_id: NULL → auth.uid()` claim
  carve-out is deferred to Slice 4's guard replacement (documented in
  `SP039_CLAIM_ARCHITECTURE.md` §7). Slice 3 needs no `user_id` transition.

The guard replacement migration must PRE-APPLY assert the exact current
seven-field body and fail loud on drift before adding `origin`.

---

## 13. `masters_delete` drift & versioning plan

Live definition (from `all_scripts_history.sql`, to be re-confirmed read-only in
production): `create policy "masters_delete" on public.sauna_masters for delete
using (public.is_admin())` — DELETE, role **admin** only.

Plan: a **separate security-housekeeping migration sequenced FIRST** (before the
claim-table migrations) that (a) PRE-APPLY reads the live `pg_policies` `qual`
for `masters_delete` and asserts it is exactly `is_admin()`, **failing loud on
drift**; (b) `drop policy` + recreate it **identically** (`using
(public.is_admin())`) under version control; (c) changes **no behavior**. Doing
this first removes the drift before the invitation FK / delete-guard (§14) reason
about delete semantics against a versioned policy. **Not applied in 3A.**

---

## 14. Delete behavior (MVP)

FKs: invitation `master_id → ON DELETE CASCADE`; audit `master_id → ON DELETE SET
NULL` (+ `invitation_id → ON DELETE SET NULL`) so security history survives.

MVP rule — a moderator-facing delete guard (BEFORE DELETE trigger
`guard_master_delete` or a delete RPC) that:

| Target | Behavior |
|---|---|
| Prepared master, **no** invitation | Allowed (admin) |
| Prepared master, **active** invitation | **Blocked** — revoke first (`active_invitation_exists`) |
| Prepared master, only **terminal** invitations | Allowed; invitation rows cascade, but `master_claim_events` audit survives (SET NULL) |
| **Claimed** master | **Blocked** in MVP — detach first (Slice 4); a claimed profile is owned |
| Pilot candidate with audit history | Allowed only under the rows above; audit is preserved regardless |

Storage: deleting a master row does **not** touch Storage; owner/admin images
under `<master_id>/…` are cleaned via the **supported Storage API, never SQL**
(flagged for the deletion procedure). This guard can land with the claim-table
migration or the later delete RPC; **design only in 3A**.

---

## 15. Rate limiting & abuse protection

Reuse the rolling-window pattern over `master_claim_events`
(`(actor_user_id, event_type, created_at)` index) + the per-master advisory lock:

| Operation | Limit (initial, tunable) | Key |
|---|---|---|
| Invitation create + regenerate | 30 / hour | moderator (`actor_user_id`) |
| Per-master generation | bounded by single-active + advisory lock | `master_id` |
| Mark-sent | 60 / hour | moderator |
| Revoke | 60 / hour | moderator |
| Copy-link | **no server call** — copies the one-time result client-side | — |

**"Copy again" cannot reveal the token** — the raw token is never stored, so any
later copy uses only the value still on the one-time result screen; a refresh
loses it (regenerate required). Platform-wide anomaly thresholds (e.g. > N
generations across all masters in an hour) surface to **SP-040** alerts. For a
10-person pilot these are guardrails against accidental/abusive mass generation,
not tight quotas.

---

## 16. Error model

RPCs return `jsonb {ok, code, data}`; expected conflicts are **codes**, not raw
RAISE. Stable code set: `not_authorized`, `master_not_found`,
`master_already_claimed`, `master_not_eligible`, `active_invitation_exists`,
`invitation_not_found`, `invalid_transition`, `invitation_already_terminal`,
`generation_conflict`, `reason_required`, `rate_limited`, `unexpected_error`.

Layering:

* **DB level:** the RPC returns a `code` for expected outcomes; RAISE only for
  authorization (`not_authorized`) and truly exceptional states. `unique_violation`
  from the active index → mapped to `generation_conflict`.
* **Server action:** maps `code` → a Polish UI message; **catches any raw
  exception** and returns `unexpected_error` (raw SQL text and any token value
  never reach the client).
* **Polish UI messages:** e.g. `active_invitation_exists` → "Ten profil ma już
  aktywne zaproszenie — najpierw je unieważnij lub wygeneruj ponownie.";
  `master_not_eligible` → "Profil nie kwalifikuje się do zaproszenia."
* **Internal logs:** structured, `token_prefix` only, never the raw token.

---

## 17. Migration breakdown (design only — no files created)

Recommended sequence, each **additive**, DB-before-code, with drift-guarded
PRE-APPLY, rolled-back POST-APPLY verification, and a companion functional
rollback:

* **M0 — `masters_delete` versioning** (§13). **First**, removes drift.
* **M1 — claim foundation schema:** `sauna_masters.origin` (+ CHECK); guard
  changes (§12: UPDATE guard +`origin`, INSERT guard clamp); `master_claim_invitations`
  with indexes/constraints; RLS enabled; grants revoked.
* **M2 — audit model:** `master_claim_events` (Slice-3 vocabulary), append-only
  policies, indexes.
* **M3 — admin RPCs:** `admin_create` / `admin_mark_sent` / `admin_revoke` /
  `admin_regenerate` / `admin_list` / `admin_get` (+ optional delete guard §14);
  `revoke … from public, anon` + `grant execute … to authenticated`.

For each: PRE-APPLY probes assert exact live state (columns absent, indexes
absent, guard body = current 7-field, `masters_delete = is_admin()`); POST-APPLY
verification in rolled-back transactions; DB-before-code (M0–M3 applied +
verified in Preview then Production **before** the Slice-3B UI deploys); current
production code is unaffected (all additive; no existing policy/behavior changes
except the deterministic re-declaration of `masters_delete` to its identical
definition).

---

## 18. Rollback strategy

* **Before any real invitation exists:** dropping the new (empty) tables + reverting
  the guard body verbatim + dropping the RPCs is clean and non-destructive.
* **After invitations have been sent:** prefer a **feature-disable** strategy
  (hide the pilot tab / stop the RPCs via revoked EXECUTE) over destructive schema
  rollback — dropping `master_claim_invitations`/`_events` would **destroy audit
  and security evidence**. Raw tokens cannot be restored (only hashes were
  stored), so a rollback never needs to "recover" them; instead **revoke active
  invitations first** so no live link survives a disable.
* **Rollback after schema-only deploy (no UI, no data):** safe full revert.
* **Code rollback with schema retained:** fully supported — the schema is additive
  and inert without the UI/RPC callers; leaving it in place is the default.
* The companion rollback file separates a **functional revert** (restore guard
  body, drop RPCs/policies, restore `masters_delete` to its identical prior
  definition) from a commented **DATA-LOSS** section (drop tables/column).

---

## 19. Implementation sub-slices

* **3B1 — Schema, RLS, audit & RPC foundations:** M0–M3 above + SQL contract &
  RLS/RPC behavioral tests. DB only, no UI. Testable via SQL + rolled-back
  impersonation.
* **3B2 — Admin prepared-profile editor + pilot list:** `/admin?tab=pilot`,
  create/edit prepared profile, completeness, status/origin/ownership badges.
  Read + prepare/edit; no invitation generation yet.
* **3B3 — Invitation generation / copy-once / mark-sent / revoke / regenerate UI
  + audit-history view:** wires the M3 RPCs to the tab; one-time token result
  screen; confirm dialogs.
* **3B4 — Preview E2E + production deployment:** full admin flow on Preview,
  authorization negatives, then M0–M3 production migration + verification.

Each is a testable vertical increment; no single oversized prompt.

---

## 20. Test matrix

* **Unit (Vitest):** token base64url encoding/length, SHA-256 determinism,
  redacted `token_prefix`, delivery-hint redaction, eligibility predicate,
  status-transition legality, result-code → Polish mapping.
* **SQL contract:** table/columns/constraints; partial unique **active** index
  present and **free of volatile expressions**; token-hash partial unique;
  grants (no client DML); RLS default-deny on invitations; `token_hash` absent
  from every projection/RPC result; audit append-only (no UPDATE/DELETE policy);
  guard body = seven fields **+ `origin`**; `masters_delete` versioned to exact
  `is_admin()`.
* **Behavioral SQL/RLS (rolled-back impersonation):** moderator create; normal
  user denied; anon denied; one-active-invitation enforced; concurrent generation
  (advisory lock + index → exactly one); expired materialization before
  regenerate; revoke; regenerate preserves history; mark-sent transition;
  claimed/`user_id`-linked profile denied; ineligible origin/status denied.
* **Integration:** server action generates token once; refresh does not reveal
  it; copy-link works from the one-time result; the link carries the raw token
  but the DB stored only the hash; raw token absent from logs **and** audit;
  safe admin result mapping (codes → Polish, no raw SQL).
* **Preview E2E:** prepare → generate → copy → mark sent → revoke → regenerate →
  inspect history → candidate table; authorization negatives (user/anon);
  cleanup that never deletes Storage metadata via SQL.

Separation: unit · SQL-contract · behavioral SQL/RLS · integration · Preview E2E
· production smoke.

---

## 21. Operational workflow & unrecoverable states (admin warnings)

Workflow: select → create prepared profile → fill data → review completeness →
(profile) ready → generate → copy link → send manually → record channel + mark
sent → observe lifecycle → revoke/regenerate as needed.

**Cannot be recovered (must be surfaced in the UI):**

* The **raw token after leaving the generation-result screen** — it is never
  stored; the DB holds only the SHA-256 hash. UI warning at generation:
  *"Skopiuj link teraz — nie pokażemy go ponownie. Po zamknięciu tego okna
  wygeneruj nowy."*
* An **accidentally closed one-time result** → the only remedy is **Regenerate**
  (which revokes the old link and issues a new token). UI: Regenerate confirm
  warns *"To unieważni poprzedni link."*
* A **sent token that leaked** → Revoke (reason) then Regenerate.

---

## Production read-only preflight checklist (prepared, NOT executed in 3A)

Run these read-only before M0–M3 in Preview/Production; **do not apply anything**:

1. Proposed tables absent: `to_regclass('public.master_claim_invitations')` and
   `…events` → NULL.
2. Proposed indexes/policy names absent (`pg_indexes`, `pg_policies`).
3. `sauna_masters` columns — confirm `origin` absent; confirm Slice-1 columns
   present (`information_schema.columns`).
4. Exact guard body: `pg_proc.prosrc` for `guard_master_privileged_columns`
   (expect the seven-field SP-039 body) and `guard_master_insert_level`.
5. Exact `masters_delete`: `pg_policies` `qual` (expect `is_admin()`); confirm
   role/cmd (DELETE).
6. Policy inventory on `sauna_masters` (`pg_policies`).
7. Function/RPC namespace — no `admin_create_master_claim_invitation` etc.
   (`pg_proc` join `pg_namespace`).
8. Extension availability: `pgcrypto` (`select * from pg_extension where
   extname='pgcrypto'`) — required for `gen_random_bytes`/`digest`; if absent,
   fall back to Node-side generation (decision 5 alternative).
9. Object-name collisions for every proposed table/index/function/policy.
10. Current audit/log table pattern (`import_log`) still append-only.

---

## Slice 3A decisions (explicit recommendations)

For each: **recommendation** · alternatives · security · product · operations.

1. **Additive `sauna_masters` fields now:** **only `origin`.** Alt: add all four.
   Sec: fewer writable columns now. Prod: preparation needs only provenance. Ops:
   `claimed_at`/verification land with their writers (Slice 4+), additive later.
2. **Create as `created` or `ready`:** **`ready`** (drop `created` from emitted
   flow; keep in CHECK for compat). Alt: keep `created`+ready RPC. Sec: neutral.
   Prod: a generated invite is immediately live. Ops: one fewer state/RPC.
3. **Generation on existing active invite:** **return `active_invitation_exists`**
   (no auto-revoke). Alt: auto-revoke. Sec: no accidental link invalidation on a
   double click. Prod: explicit. Ops: regenerate is the deliberate path.
4. **Regenerate separate from create:** **separate RPC.** Alt: `p_force` on create.
   Sec: no dangerous default. Prod: intent-revealing. Ops: shares internal helper.
5. **Token in Node vs PostgreSQL:** **PostgreSQL (`pgcrypto`)** inside the DEFINER
   RPC (entropy+hash+auth+atomicity one boundary; caller can't inject a hash).
   Alt: Node `crypto` → RPC receives hash only. Sec: DB-side removes chosen-hash
   trust. Prod: identical UX. Ops: needs `pgcrypto` (preflight #8; Node fallback).
6. **Hash SQL type/encoding:** **`bytea`** raw 32-byte SHA-256, UNIQUE; token
   URL-encoding **base64url**. Alt: hex/base64 `text`. Sec: exact binary compare
   in Slice 4. Prod: none. Ops: compact, unambiguous.
7. **Active-invitation locking:** **advisory `pg_advisory_xact_lock(master_id)` +
   `FOR UPDATE` on existing active rows + partial unique index backstop.** Alt:
   index-only. Sec/Ops: race-safe even with zero prior rows. Prod: none.
8. **Pilot cohort table:** **no** — cohort = `origin='admin_prepared'` view. Alt:
   `is_pilot_candidate`/table. Sec: none. Prod: no domain pollution for a
   temporary campaign. Ops: operational filter only.
9. **Direct moderator SELECT on invitations:** **no** — DEFINER projection
   excluding `token_hash`. Alt: moderator SELECT policy / view. Sec: RLS can't
   hide a column; projection guarantees the hash never ships. Ops: least-error.
10. **`masters_delete` versioning:** **separate housekeeping migration, sequenced
    first**, drift-guarded, identical `is_admin()` behavior. Alt: fold into M1.
    Sec: removes drift before claim deps. Prod: none. Ops: clean baseline.
11. **Delete with invitations/audit:** **block delete while active invitation or
    claimed**; else allow with audit preserved (invitation cascade, events SET
    NULL). Alt: hard cascade all. Sec: preserves security evidence. Prod: safe.
    Ops: guard/RPC.
12. **Implementation sub-slices:** **3B1 foundations → 3B2 editor/list → 3B3
    invitation UI → 3B4 E2E/deploy.** Alt: one prompt. Sec/Ops: testable
    increments. Prod: incremental delivery.
13. **Deferred to Slice 4:** `claim_master_profile` + guard `user_id` carve-out;
    `get_claim_preview`; `opened`/`claimed` transitions; HttpOnly cookie;
    login/register `next` + callback allow-list; email-confirmation return;
    `sauna_masters.claimed_at`; (Slice 5) pending editor; (later) moderator
    detach. Sec/Prod/Ops: keeps Slice 3 admin-only and end-user-claim-free.

### Remaining owner decisions (need a yes/no before 3B1)

* **A. `pgcrypto` DB-side generation vs Node-side** — recommend DB-side pending
  preflight #8 confirming the extension; approve the Node fallback as backup.
* **B. Delete-guard now vs with Slice 4** — recommend shipping the lightweight
  BEFORE-DELETE guard in M1/M3 (cheap, protects audit) vs deferring; needs a call.
* **C. `profile_prepared` audit event** — emit on first `admin_prepared` insert
  (nice provenance) vs omit for MVP; recommend emit.

---

*End of SP-039 Slice 3A design & SQL/security review. No SQL/code/migration
produced. Awaiting review + owner decisions A–C before Slice 3B1 implementation.*
