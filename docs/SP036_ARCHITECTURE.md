# SP-036 — Master-Contributed Facilities & Events: Architecture Proposal

Status: **PROPOSED — awaiting review. No code has been written.**
Date: 2026-07-18. Branch: `feature/sp-036-master-facilities`.

Binding inputs: the SP-036 sprint brief (Paweł, 2026-07-18), Decision 015
(master publication paths), Decision 016 (affiliations), W-09 in
`docs/WORKFLOWS.md`, `docs/IMPORTS.md` (import safety rules),
`docs/USER_MODEL.md` §4 (capability matrix — amended by this sprint).

---

## 1. Product Analysis

### 1.1 What the sprint changes

Today the platform assumes facility events are created by facility staff
(`sauna_managers`, SP-034). Verified sauna masters — the community's most
active contributors — cannot add facilities through a moderated path and
cannot publish events at all. SP-036 turns verified masters into **trusted
catalogue contributors** without touching the ownership model:

* masters submit facilities → **admin moderation** → public catalogue grows;
* **any** verified master (not only the submitter) publishes events at
  approved facilities that have **no approved manager**;
* once a facility gains an approved manager, **future** master events require
  manager approval; already-published events stay published;
* submitting a facility grants **nothing** beyond an audit trail.

### 1.2 Fit with the existing product model

* **W-09 already specifies this flow** (including the "manager arrives later"
  rule). This sprint moves W-09 from Future to Implemented (partial — the
  "request changes" alternative flow and admin review gate stay future).
* **USER_MODEL §4.1 must be amended**: the capability matrix currently gives
  masters ⬜ for "Create/edit events". New row semantics: master may
  create events Ⓢ (at approved unmanaged facilities → published immediately
  as master events; at managed facilities → pending manager approval), and
  edit/delete Ⓢ own organized events. Recorded as **Decision 017**.
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

---

## 2. Proposed Architecture (overview)

```
                     ┌────────────────────────────────────────────┐
                     │ Master Studio: "Dodaj obiekt" / "Organizuj" │
                     └────────────┬───────────────────────────────┘
             paste URL (optional) │
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
        saunas INSERT status='pending', created_by=auth.uid()
        (+ optional imported preview photo, source='imported')
                                  ▼
        Admin panel → Sauny (pending filter) → approve ('active') / reject
                                  ▼
        Any verified master → create event at the facility
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
  (new value `'master_submission'` / `'url_import'`), `source_url`, `phone`,
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
    references public.sauna_masters(id) on delete set null;
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
  add column if not exists source_url text;
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

Runs as `stable` invoker-rights over active + pending saunas (the caller is
authenticated; pending visibility for dedup purposes is acceptable — names
of pending submissions warn against double submission). UI **warns, never
blocks**; the admin remains the final authority. Event duplicate detection
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
| INSERT | `is_admin()` **or** (`is_verified_master(auth.uid())` and `status = 'pending'` and `created_by = auth.uid()`) |
| UPDATE | `is_admin()` (unchanged; creator-edit-while-pending is an open question, §6 Q2) |
| DELETE | `is_admin()` (unchanged) |

Consequences reviewed: map RPC unaffected (filters active); `/sauny`,
sauna detail page and favorites join only ever surface active saunas or the
caller's own pending row; the admin tab reads via `is_admin()` arm.
`'inactive'` saunas become invisible to the public — this is the *intended*
meaning of inactive and will be verified against live data before rollout.

### 4.2 `sauna_events` — additive master policies + transition guard

Additive policies (existing `events_*` and SP-034 `events_*_staff` stay):

* **INSERT (master)** — WITH CHECK:
  `is_verified_master_owner(organizer_master_id)`
  `and created_by = auth.uid()`
  `and exists (select 1 from saunas s where s.id = sauna_id and s.status = 'active')`
  `and ((not is_sauna_managed(sauna_id) and status = 'active') or (is_sauna_managed(sauna_id) and status = 'pending'))`
  — the **status routing rule lives in the database**, not only in the
  action: a master cannot self-publish at a managed facility.
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
policies). Replacement set: SELECT public; INSERT
`is_admin() or is_sauna_staff(sauna_id) or (auth.uid() is not null and source = 'user')`
for active saunas, plus creator/master inserts for their own pending
submission's preview; imported photos (`source='imported'`) are inserted
exclusively by the server action. DELETE `is_admin() or is_sauna_staff(sauna_id)`.
Exact final wording after live verification (§7 step 0).

### 4.4 Security posture summary

* Nothing is weakened; two MVP-era permissive surfaces (saunas INSERT,
  sauna_photos INSERT — plus the anon `sauna-images` storage INSERT policy)
  are **closed** and replaced with deterministic rules.
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

### 5.1 Facility contribution (W-09 prerequisite)

```
Verified master → "Dodaj obiekt" (Studio or map)
   → optional: paste URL → extractFacilityDraft → prefilled form
   → find_similar_saunas → duplicate warning (non-blocking)
   → INSERT saunas: status='pending', created_by, source, source_url
     (+ optional preview photo, source='imported')
   → Admin panel "Sauny" (pending) → approve → status='active'
                                   → reject  → status='rejected'
   → pending/rejected visible only to submitter (own submissions view) + moderation
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
3. **Events at non-active facilities are impossible** — INSERT requires the
   facility to be `active`, so a rejected/pending facility can never have
   events (no orphan states).
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
    staff of that sauna, and verified masters; "➕ Dodaj obiekt" (map) for
    verified masters routes to the pending flow; plain users keep the
    `/submit` moderated path (map free-insert hole closed, §4.1).

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
`import_log`, helpers, dedup RPC, `pg_trgm`, policies, trigger.

**Step 2 — verification probes after apply** (anon sees no pending saunas;
master insert routes statuses correctly; staff approval transition works;
non-staff cannot approve).

**Rollback**: policies and trigger are revertible by re-running the SP-034/
SP-035 policy sets; new columns/tables are additive and can stay inert.
No data backfill, no destructive change anywhere.

---

## 8. Open Questions (need Paweł's answer before implementation)

1. **`pg_trgm` extension** — approve enabling it for name-similarity dedup?
   (Standard Supabase extension; fallback is a weaker ILIKE heuristic.)
2. **Creator edit-while-pending** — may the submitting master edit their own
   facility while it awaits moderation? (Recommended: yes, via a
   creator-update policy guarded by a status-immutability trigger; small
   extra scope.)
3. **Map form for regular users** — confirm closing the live free-insert
   hole by routing non-master users to the `/submit` moderated flow
   (recommended; strictly speaking a behavior change for regular users).
4. **Imported images stance** — accept copying one og:image preview per
   import (provenance recorded, removable on request), or skip image import
   entirely in this sprint?

---

## 9. Repository Impact & Implementation Plan

### 9.1 New code

| Area | Files (planned) |
|---|---|
| Import engine | `lib/import/extract.ts` (OG/JSON-LD parser, SSRF guard), `lib/import/sources.ts` (per-source heuristics) |
| Facility actions | `app/(main)/studio/facilityActions.ts` — `extractFacilityDraft`, `submitFacility` (insert + preview image + log) |
| Studio UI | "Dodaj obiekt" page + form (URL paste → prefill → dedup warnings), "Moje zgłoszenia" list; "Organizuj" event form (facility picker limited to active saunas) |
| Event flow | master branch in `createEvent` (status routing returned as `{error}` values, per the fd67891 pattern), organizer badge component, duplicate-warning list in event forms |
| Owner queue | "Propozycje" section in `/workspace/events` (approve/reject via staff-scoped actions) |
| SQL | `supabase/2026-07-XX_sp036_master_facilities.sql` + step-0 probe script |

### 9.2 Modified code

`AddSaunaForm` (pending status, created_by, dedup warning, routing by
role), `SaunaMap` (button gating only — protected area, minimal diff),
`AddEventModal` (organizer path + duplicates), `app/events/actions.ts`
(`createEvent` routing, `registerForEvent` guard, update/delete master
arms), admin Sauny tab (pending filter — reuses existing moderation UI),
`/events` + event page + popup (organizer badge).

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
