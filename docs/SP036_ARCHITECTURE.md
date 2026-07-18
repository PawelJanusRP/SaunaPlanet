# SP-036 — Master-Contributed Facilities & Events: Architecture Proposal

Status: **APPROVED for the audit & migration-design phase** (Paweł,
2026-07-18). Application implementation NOT started; migration prepared but
NOT executed.
Date: 2026-07-18 (rev. 3 — decisions resolved, migration drafted; rev. 2 —
facility submission opened to all authenticated users; see §1.4/§1.5).
Branch: `feature/sp-036-master-facilities`.
Companion files: `supabase/2026-07-18_sp036_step0_audit.sql` (read-only
production audit + rollback baseline), `supabase/2026-07-18_sp036_master_facilities.sql`
(prepared migration, pending audit reconciliation + approval).

Binding inputs: the SP-036 sprint brief (Paweł, 2026-07-18), Decision 015
(master publication paths), Decision 016 (affiliations), W-09 in
`docs/WORKFLOWS.md`, `docs/IMPORTS.md` (import safety rules),
`docs/USER_MODEL.md` §4 (capability matrix — amended by this sprint).

---

## 1. Product Analysis

### 1.1 What the sprint changes

Today the platform assumes facility events are created by facility staff
(`sauna_managers`, SP-034). The community's most active contributors cannot
add facilities through a moderated path (the map form performs an
unmoderated direct insert), and verified sauna masters cannot publish events
at all. SP-036 makes the community the engine of catalogue growth without
touching the ownership model:

* **every authenticated user** submits facilities → mandatory
  **admin/moderator moderation** (`pending` → `active`) → the map grows as
  fast as the community contributes, with quality control;
* the submitter may **edit their own pending submission** until it is
  resolved; after approval, authorship grants **no** editing or management
  rights and never creates a `sauna_managers` relationship — the standard
  "Become a manager" workflow remains the only path to management;
* **event rights are separate from submission rights**: a regular user who
  submits a facility gains no event capabilities;
* **any** verified master (not only the submitter) publishes events at
  approved facilities that have **no approved manager**; a verified master
  may also create an event **together with** their own facility submission
  (the event goes live only when the facility is approved);
* once a facility gains an approved manager, **future** master events require
  manager approval; already-published events stay published;
* submitting a facility grants **nothing** beyond an audit trail.

### 1.2 Fit with the existing product model

* **W-09 already specifies this flow** (including the "manager arrives later"
  rule). This sprint moves W-09 from Future to Implemented (partial — the
  "request changes" alternative flow and admin review gate stay future).
* **USER_MODEL §4.1 must be amended** for events only: the capability matrix
  currently gives masters ⬜ for "Create/edit events". New row semantics:
  master may create events Ⓢ (at approved unmanaged facilities → published
  immediately as master events; at managed facilities → pending manager
  approval), and edit/delete Ⓢ own organized events. Recorded as
  **Decision 017**. The "Submit sauna" row (✅ for every authenticated user)
  is **already correct** in the matrix — this sprint finally makes the
  implementation honor it through a moderated path instead of the current
  unmoderated direct insert.
* **Affiliations are NOT the permission gate here** — deliberate correction
  of the earlier session sketch. An `approved` affiliation semantically means
  *facility consent* (the transition trigger enforces that the facility side
  resolves master-initiated requests). Auto-creating approved affiliations on
  event publication would fabricate consent that nobody gave. Instead, the
  event itself records the master↔facility relationship via
  `organizer_master_id`; portfolio/satellite features can derive from events.
  Affiliations remain a deliberate two-sided handshake (W-16), unchanged.
* **Reservations stay manager-scoped** (out of scope here): events at
  unmanaged facilities are informational — registration is blocked at the
  action layer; the "Idę" interest toggle remains available.
* **IMPORTS.md principles apply** to the URL-assisted flow: validation →
  duplicate detection → insert → logging; additive, never destructive;
  quality over growth.

### 1.3 Honest constraints of source-assisted submission

Facebook and Instagram actively resist server-side scraping (login walls,
bot detection). What is realistically extractable **without a headless
browser or paid APIs**:

* generic websites: OpenGraph/meta/JSON-LD — usually good (name,
  description, image, sometimes address/phone);
* public Facebook pages: OG tags often present on the HTML shell —
  name/image frequently work, details rarely;
* Instagram: mostly blocked; expect name-from-URL heuristics at best;
* Facebook events: date/time extraction is unreliable.

The architecture therefore treats extraction as a **best-effort prefill with
graceful degradation to an empty manual form** — never a promise. All
extracted values are editable suggestions; nothing publishes automatically.
This matches the brief ("confidence should be treated as uncertain").

### 1.4 SP-036 permission matrix (authoritative for this sprint)

✅ allowed · Ⓢ within scope · ⬜ no. "Mod" = moderator/admin.

| Capability | Guest | User | Verified Master | Approved Manager | Mod |
|---|---|---|---|---|---|
| Submit facility (→ `pending`) | ⬜ | ✅ | ✅ | ✅ | ✅ (may set `active` directly) |
| Edit facility while own submission is `pending` | ⬜ | Ⓢ own | Ⓢ own | Ⓢ own | ✅ |
| See a `pending` facility | ⬜ | Ⓢ own | Ⓢ own | Ⓢ own | ✅ |
| Approve/reject facility (`pending`→`active`/`rejected`) | ⬜ | ⬜ | ⬜ | ⬜ | ✅ |
| Edit/manage an `active` facility | ⬜ | ⬜ | ⬜ | Ⓢ own sauna (existing scope) | ✅ |
| Create event at managed facility | ⬜ | ⬜ | Ⓢ → `pending` (path C) | Ⓢ own sauna → `active` (path A) | ✅ |
| Create event at approved unmanaged facility | ⬜ | ⬜ | ✅ → `active` (path B) | n/a | ✅ |
| Create event bundled with own facility submission | ⬜ | ⬜ | Ⓢ own submission → `pending` until facility approved | n/a | ✅ |
| Approve/reject master event proposal | ⬜ | ⬜ | ⬜ | Ⓢ own sauna | ✅ |
| Edit/delete own organized event | ⬜ | ⬜ | Ⓢ own | Ⓢ own sauna (existing) | ✅ |
| Upload facility photo (`source='user'`) | ⬜ | ✅ active saunas; Ⓢ own pending submission | same as User | same + own sauna | ✅ |
| Become manager (standard workflow) | ⬜ | ✅ | ✅ | n/a | approves |

Explicit non-grants (from the correction): facility submission never
creates a `sauna_managers` row, never grants editing rights after approval,
and never grants event rights to non-masters. The bundled-event path is
**master-only**: a regular user's submission carries no event, ever.

### 1.5 Resolved decisions (Paweł, 2026-07-18)

1. **`pg_trgm` approved** — duplicate *warnings* only; similarity must never
   auto-reject, auto-merge or modify a submission.
2. **`og:image` import approved** — exactly one externally sourced preview
   image; store source URL + platform; mark as imported; removable and
   replaceable; never permanently hotlinked (downloaded, size-capped
   ~5 MB, timeout-capped, SSRF-guarded, **decoded-and-validated** rather
   than trusting extension/headers, **re-encoded** to a controlled format
   — WebP/JPEG — before upload); graceful fallback to the manual form.
3. **`sauna_submissions` deprecated gradually** — census in the step-0
   audit; both forms rerouted to the `saunas.status='pending'` flow; legacy
   workflow frozen read-only; existing pending records completed-in-place
   vs migrated decided **from the audit output**; table/policies/actions/
   admin tab removed only in a later cleanup migration.
4. **Bundled events are deterministically marked** — new column
   `sauna_events.bundled_with_submission` (immutable via trigger). Facility
   approval activates *only* bundled pending events of that sauna, and at
   approval time re-verifies the organizer is still an approved master and
   the event has not expired (`approve_facility_submission()` RPC,
   moderation-only). Ordinary pending events are never touched.
5. **Anti-abuse cap** — max 5 open (pending) submissions per user; enforced
   in the server action (friendly error) *and* by a database trigger
   (boundary); moderation exempt.
6. **`find_similar_saunas` hardening** — SECURITY DEFINER with pinned
   `search_path=public`, execute granted to `authenticated` only, returns
   only name/city/status/distance/match-reasons (no submitter identity,
   contact data or address), 10-row cap, static SQL (no dynamic errors that
   could leak data).
7. **Community photo uploads stay** for active facilities, authenticated
   only: anon storage upload removed; `sauna_photos.created_by` added
   (default `auth.uid()`) for uploader auditability and future image
   moderation — **the pre-SP-036 schema could not identify uploaders**
   (live columns verified: `id, sauna_id, image_url, created_at` only), so
   historical rows stay unattributable (NULL). Non-moderators are pinned to
   `source='user'` and empty `source_url` by WITH CHECK; moderation/staff
   keep delete rights.

---

## 2. Proposed Architecture (overview)

```
   Entry points (any authenticated user):
   map form (kept, rewired) · /submit page · Master Studio "Dodaj obiekt"
                                  │
             paste URL (optional) │  (URL-assisted prefill available to all)
        ┌─────────────────────────▼────────────┐
        │ extractFacilityDraft(url)  [action]  │  fetch+parse OG/JSON-LD,
        │  → draft fields + confidence + log   │  SSRF-guarded, rate-limited
        └─────────────────────────┬────────────┘
                                  ▼
        ┌──────────────────────────────────────┐
        │ Prefilled facility form (editable)   │
        │ + find_similar_saunas() dedup warning │
        └─────────────────────────┬────────────┘
                submit            ▼
        submitFacility [server action — NO client-side insert]
        → saunas INSERT status='pending', created_by=auth.uid()
          (+ optional photo: user upload, or imported preview)
          (+ verified master only: optional bundled event, status='pending')
                                  ▼
        submitter may edit own pending submission until resolved
                                  ▼
        Admin panel → Sauny (pending queue) → approve ('active') / reject
          approve also activates the submitter-master's bundled events
          (facility unmanaged at approval ⇒ path B semantics)
                                  ▼
        Any verified master → create event at the approved facility
            ├─ unmanaged → sauna_events status='active',
            │              organizer_master_id = own master profile
            └─ managed   → status='pending' → Owner Workspace queue
                              → staff approves ('active') / rejects
```

Authorization is enforced in **both** layers, as today: server actions
re-verify the caller; RLS policies + a transition trigger are the database
boundary. No existing policy is weakened; the sprint actually **closes two
known MVP-era holes** (see §4.4).

---

## 3. Data Model Changes (all additive)

Live-schema note: the live Supabase project is the schema source of truth
and has drifted from `supabase/all_scripts_history.sql` (confirmed again in
this analysis — see §7 step 0). All DDL below is presented for review and
will be re-checked against the live schema before execution.

### 3.1 `saunas`

```sql
alter table public.saunas
  add column if not exists created_by uuid references auth.users(id) on delete set null;
```

* `created_by` — **audit only**, never an authorization source (brief:
  "the submitter is remembered only for audit purposes").
* Reuses existing columns from the PTS-import era: `source`
  (new values `'user_submission'` / `'url_import'`), `source_url`, `phone`,
  `address`, `website`, `city`, `cover_image_url`. **No new field columns
  needed.**
* `status` gains the value `'pending'` (and `'rejected'`) alongside
  `'active'`/`'inactive'`. The column is unconstrained text in the repo dump;
  the live CHECK (if any) will be verified first. `get_saunas_nearby()`
  already filters `status='active'`, so pending facilities are automatically
  invisible on the map with **zero map changes**.

### 3.2 `sauna_events`

```sql
alter table public.sauna_events
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists organizer_master_id uuid
    references public.sauna_masters(id) on delete set null,
  add column if not exists bundled_with_submission boolean not null default false;
```

* `organizer_master_id IS NULL` → facility event (today's model, unchanged;
  full backward compatibility for every existing row).
* `organizer_master_id` set → **master-published event**, rendered visibly
  distinct (Decision 015).
* Event status model: reuse the existing `'pending'` concept (the admin
  Eventy tab already moderates `pending → active/rejected`). Path C events
  are created as `'pending'`; the Owner Workspace queue shows pending events
  of the manager's facilities; the admin tab remains the platform-wide
  superset view (admin stays the final authority, per the brief).
  **No new status vocabulary** — `active`/`pending`/`rejected` cover paths
  A/B/C.

### 3.3 `sauna_photos`

```sql
alter table public.sauna_photos
  add column if not exists source text not null default 'user'
    check (source in ('user', 'imported')),
  add column if not exists source_url text,
  add column if not exists created_by uuid  -- uploader audit (§1.5.7)
    references auth.users(id) on delete set null;
```

Imported preview images (max one representative image per import, per the
brief) are permanently distinguishable from user uploads and can be listed,
audited or purged. Gallery import is explicitly out of scope.

### 3.4 `import_log` (new, mirrors `pts_import_log` precedent)

```sql
create table public.import_log (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  source_kind text not null check (source_kind in
    ('facebook_page','facebook_event','instagram','website','other')),
  url text not null,
  result text not null check (result in ('ok','partial','failed','blocked')),
  extracted jsonb,
  created_at timestamptz not null default now()
);
```

RLS: insert via server action only (definer function or service role);
select moderation-only. Satisfies IMPORTS.md "log all operations" and gives
the future import dashboard its data.

### 3.5 Helper functions (SECURITY DEFINER, mirroring existing style)

```sql
-- Does the facility have any approved manager?
create function public.is_sauna_managed(target_sauna_id uuid) returns boolean;
-- Is the caller a verified (approved) master, and does master_id belong to them?
create function public.is_verified_master_owner(target_master_id uuid) returns boolean;
```

`is_verified_master_owner` = `is_master_owner` **plus** `status='approved'`
on the master profile — verification state is checked at event-creation
time, not cached.

### 3.6 Duplicate detection RPC

```sql
create function public.find_similar_saunas(
  p_name text, p_lat double precision, p_lng double precision,
  p_website text default null, p_phone text default null,
  p_facebook_url text default null
) returns table (id uuid, name text, city text, address text,
                 distance_m double precision, match_reasons text[]);
```

Matching signals (any hit returns the row, with reasons):
* PostGIS `ST_DWithin` ≤ 500 m (extension already enabled);
* normalized website/facebook host+path match (`source_url`, `website`);
* normalized phone digits match;
* name similarity — **requires `pg_trgm`** (`similarity() > 0.35` on
  lowercased names). `pg_trgm` is a standard Supabase-available extension;
  enabling it is part of the migration and flagged for approval. Fallback
  if declined: `lower(name) ILIKE` containment only (weaker).

Callable by **every authenticated user** (it now guards the universal
submission flow, not a master-only flow). It must see active **and pending**
saunas to warn against double submission of something already in the
moderation queue — since the tightened `saunas` SELECT policy hides other
users' pending rows, the RPC runs as **SECURITY DEFINER** and returns only
a minimal disclosure set for pending matches (name, city, distance,
`status='pending'` marker — no address/contact details). UI **warns, never
blocks**; the admin remains the final authority and sees full duplicate
context in the moderation queue (nearby/similar existing facilities listed
next to each pending submission). Event duplicate detection
needs no RPC: a plain query for the facility's upcoming events (±1 day,
same organizer or similar title computed client-side) rendered as a warning
list inside the event form.

---

## 4. RLS Implications

### 4.1 `saunas` — replace drifted policies with a deterministic set

Analysis confirmed **live drift**: the repo dump says INSERT is
admin-only, yet the map form inserts `status='active'` rows as a regular
authenticated user today — an MVP-era permissive policy is still live. The
migration replaces all INSERT/UPDATE/SELECT policies (SP-035 DO-block
pattern: drop unknown, create deterministic):

| Command | Policy |
|---|---|
| SELECT | `status = 'active' or created_by = auth.uid() or is_platform_moderator()` |
| INSERT | `is_platform_moderator()` **or** (`auth.uid() is not null` and `status = 'pending'` and `created_by = auth.uid()`) |
| UPDATE | `is_platform_moderator()` **or** (`created_by = auth.uid()` and `status = 'pending'`, double-checked in WITH CHECK) |
| DELETE | `is_admin()` (unchanged) |

* **INSERT is open to every authenticated user** (per the correction) but
  *only* as `pending` and *only* as themselves — the current live hole
  (client-side insert of `active` facilities) is closed because no
  non-moderation path can produce an `active` row.
* **UPDATE allows submitter self-edits while pending.** A new trigger
  `saunas_guard` (BEFORE UPDATE, SP-035 guard pattern) makes `status`,
  `created_by` and `pts_*` columns immutable for non-moderation callers —
  the submitter can fix a typo but can never self-approve, reassign
  authorship or touch PTS certification data. Only
  `is_platform_moderator()` may set `status = 'active'` (admin **or
  moderator**, per the correction — note this widens facility status
  moderation from today's `is_admin()`-only policies to moderators, which
  matches the admin-panel reality and USER_MODEL §4.1 "moderation queues").
* SELECT keeps pending facilities invisible to the public and to other
  users; only the submitter and moderation see them (correction rule 3).

Consequences reviewed: map RPC unaffected (filters active); `/sauny`,
sauna detail page and favorites join only ever surface active saunas or the
caller's own pending row; the admin tab reads via the moderation arm.
`'inactive'` saunas become invisible to the public — this is the *intended*
meaning of inactive and will be verified against live data before rollout.

### 4.2 `sauna_events` — additive master policies + transition guard

Additive policies (existing `events_*` and SP-034 `events_*_staff` stay):

* **INSERT (master)** — WITH CHECK:
  `is_verified_master_owner(organizer_master_id)`
  `and created_by = auth.uid()`
  `and (`
  `  -- approved facility: normal A/B/C routing`
  `  (exists (select 1 from saunas s where s.id = sauna_id and s.status = 'active')`
  `   and ((not is_sauna_managed(sauna_id) and status = 'active')`
  `        or (is_sauna_managed(sauna_id) and status = 'pending')))`
  `  -- bundled with OWN pending facility submission: always pending`
  `  or (exists (select 1 from saunas s where s.id = sauna_id`
  `              and s.status = 'pending' and s.created_by = auth.uid())`
  `      and status = 'pending')`
  `)`
  — the **status routing rule lives in the database**, not only in the
  action: a master cannot self-publish at a managed facility, and an event
  bundled with a facility submission cannot go live before the facility
  does. Bundled events are activated by the facility-approval action
  (moderation context), inheriting path B semantics because the freshly
  approved facility is by definition unmanaged.
* **UPDATE/DELETE (master)** — USING and WITH CHECK
  `is_verified_master_owner(organizer_master_id)` — masters manage only
  their own organized events.
* **Trigger `sauna_events_guard`** (BEFORE UPDATE, same pattern as the
  SP-035 guards): for non-moderation callers `organizer_master_id`,
  `created_by` and `sauna_id` are immutable; a non-staff caller may never
  transition `pending → active` (approval belongs to facility staff or
  admin); staff transitions permitted per the existing `events_update_staff`
  policy.

`SELECT` on `sauna_events` is public-`true` today; public queries (RPCs,
/events) already filter `status='active'`, and the pending-proposal
titles are not sensitive — SELECT stays untouched to avoid breaking the
admin tab and workspace queries. (Noted as accepted openness, same as
today's `pending` admin-moderated events.)

### 4.3 `sauna_photos` — deterministic policies + import path

Live drift again (client-side inserts work despite admin-only repo
policies). Replacement set:

* SELECT — public (unchanged; photo visibility follows facility visibility
  in the UI, and a pending facility's page is reachable only by its
  submitter and moderation).
* INSERT — `is_platform_moderator() or is_sauna_staff(sauna_id)` **or**
  (`auth.uid() is not null and source = 'user' and` the target sauna is
  `active` **or** is the caller's **own pending submission**
  (`status='pending' and created_by = auth.uid()`)) — every authenticated
  user keeps today's ability to add photos to public saunas and can
  photograph their own submission before approval; `source` and
  `source_url` are pinned by WITH CHECK (`source='user'`, `source_url`
  null) for non-moderation callers.
* Imported photos (`source='imported'`, `source_url` set) are inserted
  exclusively by the `submitFacility` server action (SECURITY DEFINER
  helper or service context) — never from the client.
* DELETE — `is_platform_moderator() or is_sauna_staff(sauna_id)`.

Storage (`sauna-images` bucket): the anon INSERT policy is replaced with
authenticated-only INSERT; imported images are written server-side under an
`imported/{sauna_id}/` prefix so provenance is visible in the object path
as well as in `sauna_photos.source`. Exact final wording after live
verification (§7 step 0).

### 4.4 Security posture summary

* Nothing is weakened; two MVP-era permissive surfaces (saunas INSERT,
  sauna_photos INSERT — plus the anon `sauna-images` storage INSERT policy)
  are **closed** and replaced with deterministic rules. Facility INSERT
  stays open to every authenticated user — but pending-only, self-only,
  moderated: broader participation with a *stronger* security boundary
  than today.
* Every new capability is enforced in **both** server actions and RLS, with
  a trigger guarding transitions — the same defense-in-depth pattern as
  SP-034/SP-035.
* The URL fetcher is SSRF-guarded (https only, public-IP resolution check,
  redirect cap, response-size cap ~1 MB, timeout ~8 s), extracted content is
  treated as untrusted plain text (length-capped, never rendered as HTML),
  and the endpoint is rate-limited per user (simple per-user counter in
  `import_log`, e.g. 20/hour).

---

## 5. Workflow Diagrams

### 5.1 Facility contribution (every authenticated user)

```
Authenticated user (any role) → "Dodaj obiekt" (map form / /submit / Studio)
   → optional: paste URL → extractFacilityDraft → prefilled form
   → find_similar_saunas → duplicate warning (non-blocking)
   → submitFacility [server action]: saunas INSERT status='pending',
     created_by, source, source_url
     (+ optional photo: user upload source='user', or imported preview)
     (+ verified master only: optional bundled event, status='pending')
   → submitter edits own pending submission freely (status immutable to them)
   → Admin panel "Sauny" (pending queue) → approve → status='active'
        (+ activates the submitter-master's bundled pending events)
                                          → reject  → status='rejected'
   → pending/rejected visible only to submitter + moderation
   → after approval: NO editing rights, NO sauna_managers row, NO event
     rights for non-masters; "Become a manager" remains the standard path
```

### 5.2 Event publication — three paths

```
A  Facility staff (unchanged, SP-034)
   → createEvent → status='active' (organizer_master_id NULL)

B  Verified master + facility active + NOT managed
   → createEvent(organizer_master_id = own)
   → duplicate warning (facility's upcoming events)
   → status='active'  → badge "Event saunamistrza"

C  Verified master + facility active + managed
   → createEvent(organizer_master_id = own)
   → status='pending'
   → Owner Workspace /workspace/events "Propozycje" (facility context)
        → approve → status='active' (still labelled master-organized)
        → reject  → status='rejected' (visible to organizer in Studio)
   → Admin tab "Eventy" remains the superset pending view (final authority)

B' Bundled: verified master + OWN facility submission still pending
   → event created with the submission, status='pending'
   → invisible everywhere public (facility hidden, event not 'active')
   → facility approved → event auto-activates (path B: unmanaged facility)
   → facility rejected → event stays 'pending', orphaned-hidden; master may
     delete it (own-event rights)
```

### 5.3 Facility becomes managed later

```
Manager approved (existing flow) →
   events with status='active'   → REMAIN PUBLISHED (no retroactive review)
   new master events              → path C (pending manager approval)
   masters' pending events created before approval → now resolved by the manager
```

---

## 6. Edge Cases

1. **Manager approved while a master event is pending** → the new manager
   resolves it (queue simply gains an owner). No special handling.
2. **Master verification revoked** (status ≠ approved) → existing events
   remain (history is history); every new create/edit re-checks
   `is_verified_master_owner` → blocked. Their pending proposals can still
   be resolved by staff/admin.
3. **Events at non-active facilities** — impossible, with exactly one
   controlled exception: a verified master's bundled event on their **own**
   pending submission, which is forced to `pending` and can only be
   activated by the facility-approval action. A rejected facility therefore
   never has visible events; its bundled `pending` events are unreachable
   from any public query and deletable by their organizer.
4. **Rejected event** → final in this sprint; the master creates a new one
   ("request changes" loop is a W-09 future extension). Rejected proposals
   are visible in the master's Studio list with status.
5. **Reservations on master events at unmanaged facilities** →
   `registerForEvent` gains a guard: registration only when
   `is_sauna_managed(sauna_id)`. UI hides "Zapisz się", keeps "Idę".
   (Managed-facility events keep today's behavior even when
   master-organized — staff confirms, consistent with "manager moderates".)
6. **Duplicate facility approved anyway** → admin authority; dedup is a
   warning. Future merge tooling is out of scope (IMPORTS.md future).
7. **Same URL imported twice** → `find_similar_saunas` matches on
   `source_url`/website → warned; `import_log` records both attempts.
8. **Extraction failures** (blocked, timeout, non-HTML, huge response,
   private-IP URL, malformed OG data) → logged (`failed`/`blocked`), user
   lands on the empty manual form with a neutral message — never an error
   wall.
9. **Imported image issues** (dead link, wrong content-type, >5 MB) → skip
   image, proceed with the draft.
10. **Copyright/takedown on imported images** → `source='imported'` +
    `source_url` provenance makes takedown queries trivial; flagged as an
    open product question (§8 Q4).
11. **Concurrent duplicate events** (two masters, same night) → warning
    lists the other event including its organizer; publishing both remains
    allowed (real venues do host parallel happenings).
12. **Map button gating** — "🔥 Dodaj event" shows for admins, approved
    staff of that sauna, and verified masters. "➕ Dodaj obiekt" on the map
    stays available to **every authenticated user** (correction: the map
    form remains an entry point) but is rewired to the `submitFacility`
    server action — the client-side `active` insert is removed entirely.
13. **Moderation queue volume** — opening submission to all users raises
    queue volume; the pending queue gets a badge count in the admin tab and
    each entry shows its dedup context to make triage fast. If volume ever
    exceeds admin capacity, a per-user submission rate limit (e.g. 5
    pending at a time) is a one-line policy addition — noted, not
    implemented.

---

## 7. Migration Strategy

**Step 0 — live-schema verification (before any DDL).** A read-only SQL
probe for Paweł to run in the SQL Editor, returning: `pg_policies` for
`saunas`, `sauna_events`, `sauna_photos`, `sauna_managers`,
`storage.objects`; column lists + CHECK constraints for `saunas.status`,
`sauna_events.status`, `sauna_managers`, `event_registrations`; installed
extensions. The final migration script is adjusted to the findings (the
repo dump is known-stale; two tables aren't in it at all).

**Step 1 — one migration script** `supabase/2026-07-XX_sp036_master_facilities.sql`,
fully additive except the deterministic policy replacement (SP-035 DO-block
pattern), idempotent (`if not exists` / drop-then-create policies), applied
manually by Paweł per the established process. Includes: columns (§3.1–3.3),
`import_log`, helpers, dedup RPC, `pg_trgm`, policies, and both guard
triggers (`saunas_guard`, `sauna_events_guard`).

**Step 2 — verification probes after apply** (anon sees no pending saunas;
master insert routes statuses correctly; staff approval transition works;
non-staff cannot approve).

**Rollback**: policies and trigger are revertible by re-running the SP-034/
SP-035 policy sets; new columns/tables are additive and can stay inert.
No data backfill, no destructive change anywhere.

---

## 8. Open Questions (need Paweł's answer before implementation)

All previous open questions are **resolved** — see §1.5 (pg_trgm, og:image,
sauna_submissions transition) and rev 2 notes (submitter edit-while-pending,
map form retained for all users).

Remaining items that only the step-0 production audit can settle:

1. Whether `saunas.status` / `sauna_events.status` carry live CHECK
   constraints that must be extended before `'pending'`/`'rejected'` rows
   can exist (audit §3).
2. The exact live policy names on `storage.objects` and the drifted
   policies on `saunas`/`sauna_photos`/`sauna_events`/`pts_import_log`
   (audit §1 — also the rollback baseline).
3. The `sauna_submissions` census (audit §6) — decides completed-in-place
   vs migrated for existing pending records.
4. (Finding, decision deferred) anon can read `sauna_managers.user_id` of
   approved managers via PostgREST — likely intentional enough for
   "manager badge" features but worth an explicit decision outside SP-036
   scope.

---

## 9. Repository Impact & Implementation Plan

### 9.1 New code

| Area | Files (planned) |
|---|---|
| Import engine | `lib/import/extract.ts` (OG/JSON-LD parser, SSRF guard), `lib/import/sources.ts` (per-source heuristics) |
| Facility actions | `app/saunas/actions.ts` (shared, not Studio-scoped — the flow serves all users): `extractFacilityDraft`, `submitFacility` (insert + photo + optional bundled master event + log), `updateOwnPendingFacility` |
| Submission UI | one shared facility form component (URL paste → prefill → dedup warnings) used by the map form, `/submit` and Studio "Dodaj obiekt"; "Moje zgłoszenia" list (Personal Workspace section — all users, not Studio-only); master-only bundled-event step in the same form |
| Event flow | master branch in `createEvent` (status routing returned as `{error}` values, per the fd67891 pattern), organizer badge component, duplicate-warning list in event forms |
| Owner queue | "Propozycje" section in `/workspace/events` (approve/reject via staff-scoped actions) |
| Admin queue | pending filter + badge count + per-entry dedup context in the "Sauny" tab; `approveSauna` action (activates facility + bundled events); "Zgłoszenia" tab frozen read-only (legacy drain, §8 Q3) |
| SQL | `supabase/2026-07-XX_sp036_master_facilities.sql` + step-0 probe script |

### 9.2 Modified code

`AddSaunaForm` (rewired to `submitFacility` — client-side insert removed;
pending messaging; dedup warning; master bundled-event step),
`SubmitSaunaForm` / `/submit` (switched from `sauna_submissions` to the
same shared flow), `SaunaMap` (event-button gating only — protected area,
minimal diff; the facility button stays for all authenticated users),
`AddEventModal` (organizer path + duplicates), `app/events/actions.ts`
(`createEvent` routing, `registerForEvent` guard, update/delete master
arms), admin Sauny tab (pending queue — reuses existing moderation UI),
`/events` + event page + popup (organizer badge), `/profile` ("Moje
zgłoszenia" section).

### 9.3 Documentation updates (end of sprint)

`WORKFLOWS.md` (W-09 → Implemented-partial), `USER_MODEL.md` (§4.1 matrix +
Decision 017 reference), `DECISIONS.md` (Decision 017), `ROADMAP.md` +
`CURRENT_STATE.md` (SP-036 rescope; **Sauna Sessions → SP-037**),
`FEATURES.md`, `IMPORTS.md` (URL-assisted flow section), `SPRINT_HISTORY.md`.

### 9.4 Delivery order (each phase lint+build+commit, no merge/push)

1. Step-0 probe → **SQL review with Paweł → manual apply**
2. Facility contribution path (form + moderation + dedup) — no import yet
3. Master event paths A/B/C + labeling + registration guard + owner queue
4. URL-assisted prefill + image import + logging (riskiest, isolated last —
   the sprint delivers value even if this phase slips)
5. Docs + closure

Phases 2–3 are the sprint's core; phase 4 is deliberately detachable.

---

*Prepared by Claude (SP-036 kickoff analysis). Sources: repository state at
`fd67891` + live-drift findings; agent reports on code paths and SQL/RLS
archived in the session transcript.*
