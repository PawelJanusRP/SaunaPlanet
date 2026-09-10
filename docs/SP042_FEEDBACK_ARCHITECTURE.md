# SP-042 — Feedback, Facility Corrections & Contact: Architecture

Status: **SP-042A — ARCHITECTURE CHECKPOINT, awaiting owner decisions**
(no implementation, no migrations, no production changes).
Date: 2026-09-10.
Branch: `feature/sp-042-feedback-architecture` (from `main` @ `da858a3`).

Binding inputs: `docs/BACKLOG.md` §SP-042 (original Facility Data Improvement
Proposals requirements + the 2026-09-09 unified feedback/contact expansion),
`docs/SP038_SMART_IMPORT_ARCHITECTURE.md` (§9 provenance, §12a rate limit,
§13 extension point), `docs/SP047_I18N_ARCHITECTURE.md`, `docs/USER_MODEL.md`
(§2.6 moderator, §3 ownership model, §4 permission matrix),
`docs/REPOSITORY_AUDIT.md`, `docs/CURRENT_STATE.md`.

---

## 1. Product goal

One shared SaunaPlanet feedback mechanism with three initial user intents:

1. **Facility correction** — "Zgłoś nieprawidłowość" / "Report incorrect
   information" / "Fehlerhafte Angaben melden", launched in the context of a
   specific facility.
2. **Product suggestion** — "Wyślij sugestię" / "Send a suggestion".
3. **Contact** — "Kontakt z nami" / "Contact us".

All three share one intake infrastructure, one security model, one lifecycle,
one moderation queue, one audit model and one anti-abuse layer. Facility
corrections additionally carry structured, field-level proposed changes that
support review, partial acceptance and a controlled server-side apply path —
the active `saunas` record is **never** mutated by an unreviewed submission.

Why now: the SP-039P controlled pilot is running; collecting structured
feedback during the pilot is more valuable than after it. SP-040 remains the
mandatory gate before broad pilot invitations (§25).

## 2. Scope / non-goals

In scope (SP-042 as a whole, delivered in slices — §25):

* common intake table + structured correction items + append-only audit;
* facility "report incorrect information" action (contextual, sauna page);
* global suggestion + contact intake at `/[locale]/feedback`;
* Help hub entry points;
* anonymous + authenticated submission;
* rate limiting, honeypot, validation, length limits;
* one admin moderation queue ("Zgłoszenia / Feedback") with per-field
  accept/reject and an atomic, allow-listed apply path;
* PL/EN/DE UI from day one.

Explicit non-goals (do NOT build in SP-042):

* two-way chat, threads, inbox, realtime messaging, e-mail ticketing,
  automatic replies (SP-046 boundary — §21);
* attachments / screenshots;
* CAPTCHA (no repository evidence of need; revisit only on observed abuse);
* notification infrastructure (§22 of the task brief; model stays
  emission-ready — §15);
* facility merge tooling for `duplicate` reports (moderator acts manually
  through existing admin tools);
* event / master-profile / photo-content abuse reports (future extensions of
  the same intake — vocabulary reserves them, nothing is built);
* owner/manager (facility staff) resolution of corrections — model supports
  it, MVP authorization is platform moderation only (owner decision D4);
* retention/deletion jobs (policy documented — §17; implementation later);
* a "my reports" view for submitters (privacy-first: no submitter read-back
  in MVP — §11);
* SP-040, SP-046 implementation; any change to SP-045 map controls/popup
  architecture; any change to SP-044 privacy invariants.

## 3. Current-system audit (what exists and is reused)

Verified against the repository (2026-09-10, `main` @ `da858a3`):

| Mechanism | Where | Reuse in SP-042 |
|---|---|---|
| Rolling-window rate limit (10/h/user) | `lib/import/actionCore.ts` (12–13), count on `import_log (requested_by, created_at)` index, fail-closed | Same pattern, new counters on `feedback_reports` (§16) |
| Per-field provenance (`ExtractedField`: value/origin/confidence/sourceHint; origins incl. reserved `user`) | `lib/import/types.ts` 28–43; persisted in `import_log.extracted` | Correction items store provenance in the SAME vocabulary (§6, §20) |
| Duplicate detection `find_similar_saunas` | `supabase/2026-07-18_sp036_dedup_name_tuning.sql` | Not called by SP-042 MVP; `duplicate` category stays free-text (§20) |
| Append-only audit tables (moderation-only RLS, actor FK `ON DELETE SET NULL`, timestamp-pinned consistency) | `master_moderation_notes`, `master_claim_invitations`/`master_claim_events` (M2/M3/M6) | `feedback_report_events` copies this posture (§15) |
| Atomic SECURITY DEFINER moderation RPCs (`set search_path = ''`, revoke-then-grant, typed result codes) | `approve/reject_facility_submission`, M7/M10 claim & publication RPCs | `submit_feedback_report`, `moderate_feedback_correction` follow the same contract (§12) |
| Admin moderation panel (tab-based, `assertAdmin()`, per-item context panels incl. `ImportProvenancePanel`) | `app/[locale]/(main)/admin/page.tsx`, `admin/actions.ts` 8–14 | New `feedback` tab reuses the tab + actions + provenance-panel patterns (§14) |
| Role helpers | `is_platform_moderator()` (SP-035d, live), `getCurrentUserRole()` (`lib/supabase/server.ts`) | RLS arms and server actions (§11–§12) |
| i18n | next-intl, `messages/{pl,en,de}/<ns>.json`, `LOCALES` registry, catalog parity test, `getTranslations` in actions | New `feedback` namespace (§18) |
| Help hub | `app/[locale]/(main)/help/page.tsx` (comment already reserves SP-042 links) | Two new cards (§19) |
| Sauna detail page actions | `app/[locale]/sauna/[id]/page.tsx` 172–207 (favorite / become-manager row) | Correction entry point joins this action area (§4) |
| `saunas` correctable columns | `name, description, address, city, website, phone, email, category, latitude, longitude, opening_hours (jsonb), social_links (jsonb)` (SP-036/038 migrations + history) | Apply allow-list (§9) |

Key negative findings:

* **No anonymous write path exists anywhere today** — every INSERT policy
  requires `auth.uid() IS NOT NULL`. SP-042 introduces the platform's first
  anonymous write; it is therefore RPC-only, never a direct table grant (§12).
* **No generic proposal/correction infrastructure exists.** `sauna_submissions`
  and pending `saunas` rows model *new* facilities; `import_log` is an
  append-only import audit, not a proposal store. Nothing models field-level
  diffs against an existing facility, so new tables are justified and do not
  duplicate an existing concept (§6 answers the task-brief §8 question).
* **No honeypot pattern exists** in the codebase; SP-042 introduces one (§16).

## 4. User journeys

**J1 — facility correction (contextual, mobile-first).** Visitor (anonymous or
logged in) on `/[locale]/sauna/[id]` taps "Zgłoś nieprawidłowość" in the
action area → bottom-sheet/modal form opens with the facility name displayed
(never typed): category select (§5 codes) → free-text message ("Wrong address
— it should be Poznańska 12") → optional "proposed value" input shown for
field-mapped categories → optional contact e-mail (anonymous only) → submit →
confirmation toast. `sauna_id`, route context and locale are carried
server-side; the user never supplies identifiers.

**J2 — suggestion / contact (global).** User opens Help (`/[locale]/help`) or
the drawer → "Wyślij sugestię" or "Kontakt z nami" → `/[locale]/feedback`
with the intent pre-selected (`?type=suggestion|contact`) → message (+
optional contact e-mail) → submit → confirmation.

**J3 — moderation.** Moderator/admin opens Admin → "Zgłoszenia" tab → filters
by type/status/facility/date → opens a facility-correction report → sees
facility link, submitter message, per-item *current public value vs proposed
value* with provenance and staleness marker → accepts/rejects items
individually → accepted items are applied atomically server-side → resolves
the report, optionally leaving an internal note. Suggestions/contact:
read → resolve/reject (+ note). Any reply happens outside the platform (§21).

## 5. Domain terminology

| Term | Meaning |
|---|---|
| **Feedback report** | One submission of any type; the authoritative record of what the submitter wrote. |
| **Report type** | `facility_correction` \| `suggestion` \| `contact` (stable codes; UI labels localized). |
| **Correction category** | Stable semantic code on facility-correction reports: `name`, `address`, `coordinates`, `website`, `social_link`, `contact_details`, `category`, `opening_info`, `photo`, `closed`, `duplicate`, `other`. Codes are presentation-independent (SP-047 §10); the DB never stores localized labels. |
| **Correction item** | One field-level proposed change (field code, current-value snapshot, proposed value, provenance, own resolution state). |
| **Field code** | Allow-listed correctable `saunas` aspect: `name`, `description`, `address`, `city`, `website`, `phone`, `email`, `category`, `coordinates`, `opening_hours`, `social_links`. `coordinates` is one logical field applied to `latitude`+`longitude` together. |
| **Apply** | The atomic, authorized server-side mutation of `saunas` from accepted items. |
| **Stale item** | An item whose current-value snapshot no longer matches the live facility value at apply time. |

Category → field-code mapping (server-side only): `name→name`,
`address→address`, `coordinates→coordinates`, `website→website`,
`social_link→social_links`, `contact_details→phone` or `email` (server picks
by input), `category→category`, `opening_info→opening_hours`. Categories
`photo`, `closed`, `duplicate`, `other` map to **no** field code —
message-only reports resolved by moderator action through existing admin
tools (photo moderation, status change, manual dedup).

## 6. Proposed data model

Three new tables. Names are proposals, not locked; semantics are binding.

### 6.1 `feedback_reports` — common intake

```sql
create table public.feedback_reports (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in
                   ('facility_correction','suggestion','contact')),
  sauna_id       uuid references public.saunas(id) on delete set null,
  sauna_name_snapshot text,           -- context survives facility deletion
  category       text check (category in
                   ('name','address','coordinates','website','social_link',
                    'contact_details','category','opening_info','photo',
                    'closed','duplicate','other')),
  message        text not null check (btrim(message) <> ''
                                      and char_length(message) <= 4000),
  created_by     uuid references auth.users(id) on delete set null,
  contact_email  text check (contact_email is null
                             or (char_length(contact_email) <= 254
                                 and position('@' in contact_email) > 1)),
  submitter_key_hash text,            -- HMAC of anon rate-limit key; §16/§17
  locale         text not null check (locale in ('pl','en','de')),
  source_path    text check (source_path is null
                             or char_length(source_path) <= 300),
  status         text not null default 'new' check (status in
                   ('new','in_review','resolved','rejected')),
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users(id) on delete set null,
  admin_note     text check (admin_note is null
                             or char_length(admin_note) <= 4000),
  created_at     timestamptz not null default now(),

  constraint fr_facility_context check
    (type <> 'facility_correction' or sauna_id is not null
     or sauna_name_snapshot is not null),        -- context present at insert;
                                                 -- snapshot survives deletion
  constraint fr_category_scope check
    (category is null or type = 'facility_correction'),
  constraint fr_resolution_consistency check
    ((status in ('resolved','rejected')) = (resolved_at is not null))
);
```

Notes:

* `created_by` is written **only** from `auth.uid()` inside the RPC — never a
  client parameter (task brief §18).
* `resolved_by` follows the M6 lesson: consistency CHECK pins the terminal
  state to the **timestamp**, so actor-account deletion (FK `SET NULL`) never
  violates the constraint.
* Deliberately NOT stored: raw IP, user agent, referrer chains, any browser
  fingerprint (task brief §9). `source_path` is the platform-internal route
  only (e.g. `/pl/sauna/<id>`), useful for moderation context.
* `locale` is stored because it is useful for moderation context and any
  future manual reply; UGC message text is never translated (§18).

Indexes: `(status, created_at desc)` (queue), `(sauna_id)` partial where not
null (facility filter), `(created_by, created_at)` and
`(submitter_key_hash, created_at)` (rate-limit rolling windows; mirrors the
SP-038 `import_log_requested_by_created_at_idx` design).

### 6.2 `feedback_correction_items` — field-level proposals

```sql
create table public.feedback_correction_items (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.feedback_reports(id)
                  on delete cascade,
  field_code    text not null check (field_code in
                  ('name','description','address','city','website','phone',
                   'email','category','coordinates','opening_hours',
                   'social_links')),
  current_value jsonb,                -- public value snapshot at submission
  proposed_value jsonb not null,      -- structured proposal
  provenance    jsonb,                -- ExtractedField-compatible: {origin,
                                      --  confidence, sourceHint, retrievedAt}
  status        text not null default 'pending' check (status in
                  ('pending','accepted','rejected')),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null,
  applied_at    timestamptz,          -- set only when the facility row changed
  created_at    timestamptz not null default now(),

  constraint fci_resolution_consistency check
    ((status <> 'pending') = (resolved_at is not null)),
  constraint fci_applied_only_accepted check
    (applied_at is null or status = 'accepted'),
  constraint fci_one_field_per_report unique (report_id, field_code)
);
create index on public.feedback_correction_items (report_id);
```

* Values are `jsonb` so one shape covers text fields, `{lat,lng}` pairs,
  `opening_hours` objects and `social_links` arrays.
* MVP provenance is `{origin: 'user'}` (manual input) — the same
  `FieldOrigin` union as SP-038, so a future import-driven proposal (PTS
  re-sync, duplicate-import "propose an update") fills richer provenance
  without any schema change (§20).
* MVP creates **0..1 items per report** (owner decision D3); the table shape
  already supports multi-field proposals for the future import path.

### 6.3 `feedback_report_events` — append-only audit

```sql
create table public.feedback_report_events (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.feedback_reports(id)
                on delete cascade,
  item_id     uuid references public.feedback_correction_items(id)
                on delete set null,
  event_type  text not null check (event_type in
                ('report_created','status_changed','item_accepted',
                 'item_rejected','correction_applied','stale_conflict',
                 'moderator_override','note_added')),
  actor_user_id uuid references auth.users(id) on delete set null,
  payload     jsonb,     -- minimal: {from,to} status, field_code,
                         -- {oldValue,newValue} ONLY for correction_applied
  created_at  timestamptz not null default now()
);
create index on public.feedback_report_events (report_id, created_at);
```

Message content is **never** copied into events (task brief §20) — the report
row is the authoritative submitted content. `correction_applied` records
old/new facility values because that is the facility-data audit history
(retained per §17). Rationale for keeping this table in the MVP: the apply
path and stale conflicts cannot be reconstructed from row state alone, and
USER_MODEL flags a moderation audit log as a known gap.

### 6.4 Why not reuse SP-038/SP-036 structures (task brief §8)

* `import_log` — append-only *operation* audit keyed to import attempts; it
  has no lifecycle, no per-field resolution, and its RLS/immutability
  contract (one row per import, own-row read) would have to be broken to
  host corrections. Reused as a provenance **vocabulary source**, not a
  store.
* `sauna_submissions` / pending `saunas` — model whole new facilities, not
  diffs against an active one; grafting field-diffs onto them would create
  exactly the "one giant JSON blob" anti-model the brief forbids.
* A single `feedback_reports.details jsonb` (option A in the brief) makes
  partial acceptance, per-item audit and stale detection ad-hoc JSON
  surgery. Two parallel proposal systems (option B) would appear only if we
  ALSO built a second import-proposal store later — prevented by making
  `feedback_correction_items` the one field-proposal table, provenance-
  compatible with SP-038.

This is the smallest model that satisfies every binding legacy requirement
(field-level diffs, provenance, partial acceptance, override, full audit,
never-touch-active-record).

## 7. Report lifecycle

```
new ──> in_review ──> resolved
  │         │
  └─────────┴───────> rejected
```

* `new` — as submitted. `in_review` — optional moderator claim of the report
  (single-moderator platform today; kept because it is cheap and matches the
  brief). `resolved` / `rejected` — terminal; `resolved_at`/`resolved_by`
  set; report rows stay immutable afterwards (guard trigger §11).
* Resolving a facility-correction report requires every item to be decided;
  **rejecting** a report auto-rejects its pending items in the same
  transaction (one honest atomic action, no orphaned pending items).
* No `spam` status in MVP — `rejected` + note covers it; adding a code later
  is an additive CHECK change.

## 8. Facility correction lifecycle

```
report(new) ── moderator opens ──> item decisions ── apply ──> report(resolved)

item: pending ──> accepted (applied_at set when facility mutated)
        └───────> rejected
```

1. Submission creates the report and (when a proposed value exists and the
   category maps to a field code) one item with a `current_value` snapshot
   taken server-side inside the RPC (same transaction — snapshot is
   consistent by construction).
2. Items are decided individually (partial acceptance §9).
3. Accepted items are applied by ONE atomic RPC (§12.2): authorization →
   facility row lock → per-item stale check (§10) → allow-listed column
   update → item resolution → audit events → report resolution — all or
   nothing per invocation.
4. `saunas` is mutated **only** inside that RPC. There is no client UPDATE
   path, no direct-UPDATE policy, and the RPC updates only allow-listed
   columns via explicit `case field_code` branches — arbitrary column
   mutation is structurally impossible (task brief §12/§18).

## 9. Partial acceptance model

* Report state and item state are deliberately separate automata (brief §10):
  a report about three things can end `resolved` with one item `accepted`
  and two `rejected`.
* The moderator submits decisions as two disjoint id sets
  (`accept: uuid[]`, `reject: uuid[]`); the RPC validates that every id
  belongs to the report and is `pending`. Undecided items may remain pending
  (moderator returns later); resolving the report is a separate explicit
  step gated on "no pending items".
* Apply allow-list (the ONLY writable columns, enforced inside the RPC):
  `name`, `description`, `address`, `city`, `website`, `phone`, `email`,
  `category` (validated against the existing category vocabulary),
  `latitude`+`longitude` (from `coordinates`, range-validated, `0,0`
  rejected — same rule as SP-038 §8), `opening_hours` (object-shape check,
  same CHECK as the SP-038 column), `social_links` (re-sanitized server-side
  with the existing `sanitizeSocialLinks` rules before apply).
  `status`, `source`, `source_url`, `created_by`, `pts_id` and every other
  column are not reachable through this path, ever.

## 10. Stale / conflict handling

Scenario (brief §12): report proposes address A→B; facility meanwhile changed
to C.

* Every item stores `current_value` (the public value at submission).
* Inside the apply RPC, after `select … for update` on the sauna row, each
  accepted item's `current_value` is compared with the live value
  (normalized comparison: trimmed text; numeric tolerance for coordinates;
  jsonb equality for structured fields).
* **On mismatch the item is NOT applied.** The RPC returns a per-item
  outcome (`applied` | `stale`), writes a `stale_conflict` audit event with
  the three values (proposed, snapshot, live), and leaves the item
  `pending`. The admin UI re-renders showing live-vs-proposed; the moderator
  re-decides with fresh context. A re-accept after review sends the item
  with a `confirmed_current` flag carrying the NEW live value observed by
  the moderator — the RPC re-checks against THAT value, so the moderator can
  never blindly overwrite state they have not seen. Recommended behaviour:
  fail-visible, human re-decision, no force-flag without a fresh snapshot.
* Concurrent applies are serialized by the row lock; concurrent item
  decisions are guarded by the `pending`-state precondition (second decision
  on the same item is a typed no-op result, mirroring the SP-037B stale-
  resolution pattern).

## 11. RLS / access matrix

RLS enabled on all three tables. `authenticated`/`anon` get **no direct
INSERT/UPDATE/DELETE anywhere**; intake is RPC-only.

| Table | anon | authenticated (non-staff) | moderator/admin (`is_platform_moderator()`) |
|---|---|---|---|
| `feedback_reports` | none | none (no own-row read in MVP — no enumeration surface, no "my reports" UI) | SELECT; UPDATE limited to workflow columns (`status`, `admin_note`, `resolved_*`) — submitted-content columns frozen by guard trigger |
| `feedback_correction_items` | none | none | SELECT only (decisions go through the RPC; no direct UPDATE policy) |
| `feedback_report_events` | none | none | SELECT only (append happens inside SECURITY DEFINER functions) |

* Guard trigger `feedback_report_guard` (pattern: `saunas_guard`,
  `sauna_events_guard`): `type`, `sauna_id`, `sauna_name_snapshot`,
  `category`, `message`, `created_by`, `contact_email`,
  `submitter_key_hash`, `locale`, `source_path`, `created_at` are immutable
  after insert; terminal rows (`resolved`/`rejected`) reject further
  workflow updates except `admin_note` additions.
* No DELETE policies at all (retention is a future controlled job — §17).
* Public users therefore cannot read, enumerate, count or infer the
  existence of any report (brief §6). PostgREST exposure: with no SELECT
  policy for `anon`/`authenticated`, `select=*` returns empty — verified
  pattern from `master_private_identity` (deny-all client posture).
* SP-044 untouched: nothing here reads or joins `master_private_identity`;
  no master-identity data enters feedback rows.

## 12. RPC / Server Action boundaries

### 12.1 `submit_feedback_report(...)` — SECURITY DEFINER, `set search_path = ''`

Grant: `anon, authenticated` (revoke from `public`, and from `service_role`
per the M7-established posture note in KNOWN_ISSUES). Signature (proposal):

```
submit_feedback_report(
  p_type text, p_sauna_id uuid, p_category text,
  p_message text, p_proposed_value jsonb,
  p_contact_email text, p_locale text, p_source_path text,
  p_submitter_key_hash text          -- computed by the server action, §16
) returns table (result text)        -- 'ok' | typed error code
```

Server-side validation inside the RPC (defense in depth — the server action
pre-validates the same rules for friendly errors):

* type/category/locale vocabulary checks; category only with
  `facility_correction`;
* `p_sauna_id` **required** for facility corrections and must reference an
  existing publicly visible (`status = 'active'`) sauna — arbitrary/unknown
  ids and pending/rejected rows are rejected (`invalid-facility`); the name
  snapshot is read inside the RPC, never client-supplied;
* `p_sauna_id` must be NULL for suggestion/contact;
* message trimmed, non-empty, ≤ 4000 chars; contact e-mail shape + length;
  proposed value size cap (≤ 2 KB jsonb) and per-field shape check;
* `created_by := auth.uid()` (NULL for anon) — never a parameter;
* rate-limit check (rolling windows, §16) with **fail-closed** counting
  (SP-038 semantics: count-query failure ⇒ treat as exhausted);
* on success: insert report (+ item when applicable, with the
  `current_value` snapshot selected in-transaction) + `report_created`
  event. Returns only a result code — no report id, nothing enumerable.

### 12.2 `moderate_feedback_correction(...)` — SECURITY DEFINER

Grant: `authenticated` only; first statement asserts
`is_platform_moderator()` else `not-authorized`. Signature (proposal):

```
moderate_feedback_correction(
  p_report_id uuid,
  p_accept jsonb,        -- [{item_id, confirmed_current jsonb|null}]
  p_reject uuid[],
  p_resolve boolean,     -- also resolve the report if nothing stays pending
  p_note text
) returns table (item_id uuid, outcome text)  -- applied|stale|rejected|...
```

Behaviour: assert role → validate ids belong to the report and are pending →
`select … for update` on the sauna row (skip lock for item-less reports) →
per accepted item: stale check (§10) → allow-listed apply (§9) → set item
status + `applied_at` → audit events (`item_accepted`/`item_rejected`/
`correction_applied`/`stale_conflict`) → optional report resolution (blocked
while any item is pending) → optional `note_added`. One transaction;
facility mutation and item resolution are atomic together (brief §12).

### 12.3 Server Actions (thin, session-authenticated)

* `submitFeedbackReport(formData)` — public action (`app/[locale]/feedback/`
  + reused by the sauna-page modal): honeypot check (silently returns "ok"
  when tripped, §16), field pre-validation with localized messages
  (`getTranslations('feedback')`), computes `submitter_key_hash` for
  anonymous callers from request headers + server secret (never sent to the
  client), calls RPC 12.1, maps typed codes → localized messages.
* Admin actions (in `admin/actions.ts`, behind the existing `assertAdmin()`):
  `setFeedbackStatus(id, status, note?)` (direct UPDATE under the moderation
  policy; status-change audit written by an AFTER UPDATE trigger so audit
  cannot be skipped by the action layer), `moderateFeedbackCorrection(...)`
  (calls RPC 12.2), each followed by `revalidatePath` on the admin route.
* No client-side Supabase writes anywhere in SP-042. No service-role client.

## 13. Anonymous / authenticated intake

* All three types work without an account (brief §5). Authenticated
  submissions bind `auth.uid()` internally; nothing about the submitter is
  ever exposed publicly (§11).
* Anonymous: `contact_email` optional for every type in MVP (owner decision
  D2). The form states plainly: "without an e-mail we cannot reply". No
  account-creation nudge blocking submission.
* Anonymous abuse controls: RPC-only boundary, honeypot, tighter anonymous
  rate limits, message caps (§16). No CAPTCHA (brief §5) — the design leaves
  room to add Vercel BotID/WAF later without schema changes.

## 14. Moderation model

One admin surface: new tab **"Zgłoszenia"** (`/[locale]/(main)/admin?tab=feedback`),
following the existing tab conventions:

* pending-count badge like `masters`/`certyfikaty` tabs;
* filters: type, status, facility (id/name), date range — all server-side
  query params, no new client state framework;
* list ordered `status='new'` first, then `created_at desc`;
* detail card for facility corrections: facility link + name snapshot,
  category label, submitter message, locale, source path, submission time,
  authenticated/anonymous marker (never the raw identity for non-admin
  staff; e-mail shown only inside the admin surface), and per item:
  *current public value* (live), *snapshot at submission*, *proposed value*,
  provenance (rendered with the `ImportProvenancePanel` display conventions),
  staleness badge, Accept / Reject controls;
* suggestion/contact card: message + resolve/reject + note;
* actions wired per §12.3. Moderators and admins have identical SP-042
  capability in MVP (matches USER_MODEL §2.6 "content-scoped moderation");
  facility staff get nothing in MVP (D4).

## 15. Audit model

Auditable events (brief §20) and their writers:

| Event | Writer |
|---|---|
| `report_created` | `submit_feedback_report` RPC |
| `status_changed` | AFTER UPDATE trigger on `feedback_reports` (action layer cannot bypass) |
| `item_accepted` / `item_rejected` | `moderate_feedback_correction` RPC |
| `correction_applied` (with old/new value payload) | same RPC, same transaction as the `saunas` update |
| `stale_conflict` | same RPC on snapshot mismatch |
| `moderator_override` | reserved code for the future facility-staff model (platform decision overriding staff) — vocabulary present, unused in MVP |
| `note_added` | RPC / admin action |

Events never duplicate message bodies. This table is also the natural future
emission point for `feedback_received` / `feedback_resolved` notifications
(brief §22): a future notification system can consume `report_created` and
`status_changed` rows or a trigger thereon — nothing in the model blocks it,
and nothing is built now.

## 16. Anti-abuse / rate limiting

Threats from brief §18 → mitigations:

| Threat | Mitigation |
|---|---|
| spam flood / repeated reports | rolling-window limits below; honeypot; message caps |
| anonymous abuse | separate tighter anonymous window keyed by hashed network key |
| user impersonation / user_id spoofing | `created_by := auth.uid()` only; no identity parameters |
| arbitrary `sauna_id` | server-side existence + `status='active'` validation in the RPC |
| arbitrary field/column mutation | allow-listed `case field_code` apply; no client UPDATE path |
| HTML/script content | messages stored as plain text, always rendered as text (React default escaping); no rich text, no rendering of user HTML anywhere |
| oversized messages | 4000-char CHECK + action-level pre-check; 2 KB proposed-value cap |
| report enumeration | no public read path; RPC returns no ids |
| unauthorized moderation | `is_platform_moderator()` in RLS + first-statement RPC assert + `assertAdmin()` |
| stale overwrite / races | §10 snapshot check + `for update` lock + pending-state preconditions |
| malicious e-mail/contact values | shape+length CHECK; e-mail used only for manual human contact, never in automated sends (none exist) |

Rate limits (recommendation; constants live in one module,
`lib/feedback/limits.ts`, mirroring `IMPORT_RATE_LIMIT`):

* **authenticated:** 10 reports / rolling hour / user (same number as the
  proven SP-038 import limit; counted on `(created_by, created_at)`);
* **anonymous:** 3 reports / rolling hour AND 10 / rolling 24 h per
  `submitter_key_hash`.

`submitter_key_hash` = HMAC-SHA-256(server secret env var, client network
address from the platform-provided header) computed in the server action.
Raw IP is never persisted, never sent to the database as plaintext, never
logged by SP-042 code; the hash is purpose-limited to windowed counting
(§17). If the header is absent the action falls back to a constant bucket —
degraded (shared) limiting rather than none, and fail-closed on count-query
errors, exactly like SP-038.

Honeypot: one visually hidden, autocomplete-off text input; non-empty value
⇒ the action returns success without calling the RPC (silent drop — bots get
no signal). Optional cheap addition in the same place: reject submissions
arriving < 2 s after form render (timestamp field), documented as tunable.

Tradeoffs (brief §19): counting rows in Postgres reuses an existing, tested,
zero-new-infrastructure pattern that fits Vercel serverless (no reliable
in-memory state) and the Supabase free tier (two cheap index scans per
submission). The known SP-038 check-then-insert race is accepted again — the
cap is anti-abuse, not billing. Vercel WAF/Upstash-based limiting would add
config or a paid dependency for no MVP gain; revisit only if DB-level
limiting shows real pressure (SP-040 dashboard will show it).

## 17. Privacy / retention considerations

* Personal data touched: optional `contact_email`, free-text `message`
  (may contain personal data), `created_by` linkage, `submitter_key_hash`.
* Reports are private end-to-end (§11); admin surface is the only reader.
* Retention recommendation (policy now, jobs later — brief §21):
  * **generic suggestions / contact:** delete or anonymize (null
    `contact_email`, `created_by`) N months after resolution — recommended
    N = 12;
  * **contact e-mail specifically:** null it earlier, ~6 months after
    resolution (it exists only to enable a reply);
  * **facility correction reports + `feedback_report_events`:** retain
    indefinitely — they are the provenance/audit history of public facility
    data (same class as `import_log`);
  * **`submitter_key_hash`:** needed only for the 24 h window; a future
    cleanup job may null it on rows older than 48 h.
* GDPR note (no legal policy invented): hashed network identifiers and
  e-mails are personal data → collection is purpose-limited and minimal;
  account deletion already nulls `created_by`/`resolved_by`/actor columns
  via `ON DELETE SET NULL` (anonymization-on-deletion, consistent with the
  M6 claim-audit behaviour). Add these tables to the existing
  account-deletion compatibility expectations; add retention jobs to the
  Security-and-operations backlog alongside the existing audit-retention
  item.

## 18. i18n design

* New namespace `messages/{pl,en,de}/feedback.json` (entry labels, form
  labels, category labels keyed by stable code, validation and result
  messages, admin-tab strings may live in `admin.json` where the panel
  already keeps its strings). Catalog parity test covers it automatically.
* Entry labels (reference copy): PL "Zgłoś nieprawidłowość" / "Wyślij
  sugestię" / "Kontakt z nami"; EN "Report incorrect information" / "Send a
  suggestion" / "Contact us"; DE "Fehlerhafte Angaben melden" / "Vorschlag
  senden" / "Kontakt aufnehmen" (final DE wording via
  `docs/SP047_TERMINOLOGY.md` during implementation).
* No hardcoded Polish in components/actions; server actions resolve messages
  via `getTranslations` from stable codes (SP-047E1 pattern). DB stores only
  canonical codes. Submitted text is UGC: stored verbatim, never
  auto-translated; `locale` recorded for context only.

## 19. Help integration

* `/[locale]/help` gains two cards (the file already reserves the spot):
  "Wyślij sugestię" → `/[locale]/feedback?type=suggestion`, "Kontakt z nami"
  → `/[locale]/feedback?type=contact`. Help stays a discovery hub — no
  support portal, no new subtree.
* Recommended target architecture (brief §4): **one route
  `/[locale]/feedback`** with intent selection, `?type=` preselection from
  entry points, backed by the single domain system. Two presentation routes
  would duplicate a near-identical form for no gain; one route keeps SEO,
  nav and catalogs simple. Facility correction is NOT part of `/feedback` in
  MVP — it stays contextual on the facility page (no facility picker to
  build, no re-discovery problem; brief §16).
* Navbar/drawer: no new top-level entry in MVP — Help already links the hub;
  the drawer stays uncrowded. (Adding one later is config, not architecture.)
* The temporary `lib/help/support.ts` contact-the-inviter notice is
  unchanged in SP-042A; once contact intake ships (SP-042C), pointing pilot
  support at `/feedback?type=contact` becomes a natural follow-up — flagged
  as an option at the D-slice release, not silently changed.

## 20. SP-038 integration

* **Provenance:** correction items carry `ExtractedField`-shaped provenance;
  MVP writes `origin:'user'` (the reserved origin from SP-038 §9). One
  vocabulary, no second provenance language (brief §13).
* **Duplicate-driven proposals:** SP-038 dedup stays warn-only and
  untouched. The future "this facility already exists → propose an update to
  X" UX becomes: build items from the import draft (rich provenance +
  `import_log` linkage) into a `feedback_reports` row — an additive later
  slice, enabled by this model, not built now. Same for PTS re-sync.
* **Moderation tooling:** the feedback tab joins the existing admin panel;
  provenance rendering reuses the `ImportProvenancePanel` conventions.
* **`duplicate` category:** message-only in MVP; `find_similar_saunas` is
  not called by SP-042 (the moderator has existing admin context for that).
* Nothing in SP-038 is redesigned; no `import_log` schema change.

## 21. SP-046 boundary

MVP is intake-only: submit → admin sees → admin resolves. No threads, no
inbox, no realtime, no attachments, no automated e-mail. If two-way
conversation becomes a requirement, it integrates with the future SP-046
communication infrastructure; `feedback_reports` would then reference a
conversation, not grow messaging columns. `contact_email` exists solely so a
human can reply manually from outside the platform.

## 22. Migration plan (later slices — nothing applied in SP-042A)

Two additive migrations, both with the established preflight → apply →
post-apply-verify protocol and rollback companions; **zero changes to
existing tables**:

* **M1 (SP-042B):** create `feedback_reports`,
  `feedback_correction_items`, `feedback_report_events` + indexes + RLS +
  guard/status-audit triggers + `submit_feedback_report` RPC + grants
  (revoke-then-grant posture incl. `service_role`).
* **M2 (SP-042D):** `moderate_feedback_correction` RPC (+ any helper), the
  only path that writes `saunas` from feedback.

If owner decisions change scope (e.g. D3 → message-only MVP), M1 shrinks;
the sequence holds.

## 23. Rollback plan

* Both migrations are additive; rollback scripts drop the RPCs/triggers/
  policies/tables in reverse dependency order. Data loss on rollback =
  collected feedback only — acceptable pre-launch, and the rollback refuses
  to run (M6 pattern) once any `correction_applied` event exists, because
  applied facility changes must not lose their audit trail.
* App-level rollback: entry points are additive UI; reverting the app commit
  removes them without touching any existing flow. No existing RLS policy is
  modified by SP-042, so rollback cannot regress unrelated security.

## 24. Test strategy

* **Unit (Vitest, existing suite):** validation core (`lib/feedback/`):
  vocabulary/length/e-mail/proposed-value shape checks; category→field-code
  mapping; honeypot decision; rate-limit window math (dependency-injected
  count like `actionCore`); stale-comparison normalization (text trim,
  coordinate tolerance, jsonb equality).
* **SQL behavioural (rolled-back synthetic transactions on the live DB — the
  accepted SP-044 pattern until a staging project exists):** RLS matrix
  (anon/user cannot SELECT/INSERT/UPDATE anything; moderator scope);
  submit RPC happy paths ×3 types, invalid sauna, pending sauna, vocabulary
  violations, both rate limits incl. fail-closed; guard-trigger immutability;
  moderate RPC: partial accept, auto-reject-on-report-reject, stale conflict
  (change the value mid-test), double-decision no-op, allow-list boundary
  (attempt to smuggle a non-listed field), atomicity (induced failure rolls
  back facility change AND item state), resolution blocked while pending.
* **Catalog parity** covers `feedback.json` automatically; add the new
  namespace to `NAMESPACES`.
* **E2E (Preview):** J1 anonymous + authenticated on mobile viewport, J2
  from Help, J3 full moderation pass incl. one stale scenario; lint + build
  gates per Definition of Done.

## 25. Delivery slices

Confirmed sequence (refined from the brief §23 — one adjustment, marked ★):

* **SP-042A (this document)** — architecture; stops at owner decisions.
* **SP-042B — Foundation + Facility Correction Submission**: migration M1;
  `lib/feedback/` core + tests; `submitFeedbackReport` action; sauna-page
  entry + mobile-first form; ★ a **minimal read-only admin list** (new tab,
  list + status change only, no apply) so collected reports are visible from
  day one instead of accumulating invisibly until D.
* **SP-042C — Suggestions & Contact**: `/[locale]/feedback` route with
  intent selection; Help hub cards; same intake path (no new tables).
* **SP-042D — Admin Moderation + Partial Apply + Production Release**:
  migration M2; full feedback tab (filters, item decisions, stale UX);
  E2E; production deployment; **public changelog entry in
  `lib/changelog.ts`** (mandatory release step).

Each slice is independently reviewable and shippable; B/C collect real
feedback during the pilot before D lands the apply machinery.

Sequencing vs SP-040 (brief §24, documented commitment): SP-042 is
intentionally implemented before SP-040 because feedback collection is
valuable during the running controlled pilot. **The SP-040 gate is
unchanged: SP-040 must be completed before broad invitations go to all 10
SP-039P participants.** SP-042 neither weakens nor substitutes that gate.

## 26. Unresolved decisions (owner)

See §27 checkpoint list (D1–D5). Build-time details explicitly NOT owner
decisions: exact table/column names, index composition, jsonb comparison
normalization, admin filter widget details, exact DE copy, constants file
layout.

## 27. Explicit implementation recommendation

Implementation can start safely after the owner approves D1–D5 below,
beginning with SP-042B. The design reuses proven infrastructure (SP-038 rate
limiting semantics, SP-036/039 audit and RPC postures, SP-047 i18n, existing
admin panel), adds only additive schema, introduces the platform's first
anonymous write behind an RPC-only boundary, and keeps every legacy SP-042
correction requirement (field-level diffs, provenance, partial acceptance,
override vocabulary, full audit, never-touch-active-record) satisfied.

**Owner decisions (recommended option first):**

* **D1 — Facility correction entry point (MVP).** Recommended: **facility
  detail page only**; the SP-045 compact popup stays untouched (it already
  has five actions and links to the detail page). Alternative: also add a
  popup pictogram — more reach, but crowds a protected surface; can be
  revisited at SP-042B with visual review. Consequence: one entry point to
  QA; map UX boundary preserved.
* **D2 — Anonymous contact e-mail policy.** Recommended: **optional for all
  three types**, with a visible "no e-mail = no reply" note. Alternative:
  require e-mail for `contact`. Consequence of the recommendation: lowest
  friction, occasional unanswerable contact messages.
* **D3 — Structured correction depth in MVP.** Recommended: **category +
  message + optional single proposed value → 0..1 correction items**
  (schema already supports multi-field for future import-driven proposals).
  Alternatives: message-only (no items — loses partial-accept value and
  defers the apply path), or a full multi-field diff editor (heavy mobile
  UX for little pilot gain). Consequence: simple form, real structured data,
  apply path exercised end-to-end.
* **D4 — Who moderates/applies corrections.** Recommended: **platform
  moderator + admin only in MVP** (`is_platform_moderator()`), with the
  model (per-item `resolved_by`, `moderator_override` event code) ready for
  a future facility-staff resolution arm for managed facilities.
  Alternative: include owner/manager resolution now — requires a
  staff-scoped RLS arm + workspace queue, disproportionate before real
  facility owners exist. Consequence: single queue, no consent-model risk.
* **D5 — Retention expectations.** Recommended: adopt §17 as the documented
  policy (suggestions/contact anonymized ~12 months after resolution;
  contact e-mail nulled ~6 months; correction/audit history retained;
  key-hash nulled after 48 h) with jobs implemented later from the
  operations backlog. Alternative: defer the policy entirely — leaves
  personal data with no stated bound. Consequence: GDPR posture documented
  now at zero implementation cost.

---

## 28. Delivery record

**Owner decisions D1–D5 APPROVED (2026-09-10)** with one change to D2:
contact e-mail is **required for anonymous `contact`** submissions (there is
no reply channel otherwise); optional for facility corrections and
suggestions; authenticated contact may use the account e-mail with the UI
making the used address explicit. Additional approved constraint: the
anonymous rate-limit key is HMAC-derived ONLY from trusted, server-observed
Vercel request information; raw IPs are never stored or trusted from client
input.

**SP-042B — Facility Correction Submission — implemented on
`feature/sp-042-facility-feedback` (2026-09-10; NOT merged, migration NOT
applied at the time of this record).** Delivered:

* **M1 migration** `supabase/2026-09-10_sp042b_feedback_foundation.sql`
  (+ guarded rollback): `feedback_reports`, `feedback_correction_items`,
  `feedback_report_events`, moderation-only RLS + client privilege revokes,
  content-immutability guard trigger, status-change audit trigger, and the
  `submit_feedback_report` SECURITY DEFINER RPC (SP-042B accepts
  `facility_correction` only; §12.1 contract otherwise as designed).
* **Intake**: `lib/feedback/intake.ts` (pure validation core),
  `app/feedback/actions.ts` (honeypot silent-drop, HMAC anonymous key from
  `x-real-ip`/`x-forwarded-for`, RPC-only boundary). Requires the
  server-only env var **`FEEDBACK_RATE_LIMIT_SECRET`** (≥16 chars) in every
  runtime that accepts anonymous submissions — without it anonymous intake
  fails closed with `unavailable`.
* **UX**: `components/feedback/FeedbackReportButton.tsx` on the sauna detail
  page (active facilities only; D1 — no map-popup entry), `feedback`
  message namespace in PL/EN/DE.
* **Admin**: read-only "Zgłoszenia użytkowników / User reports /
  Nutzermeldungen" tab in `/admin` (label deliberately NOT "Zgłoszenia" —
  the legacy `sauna_submissions` tab already uses that Polish word).
  Moderation workflow (item decisions, apply, resolution) remains SP-042D.
* **Tests**: `lib/feedback/__tests__/` — intake unit + localization
  coverage, M1 SQL contract, UI/action boundary contracts.

Deferred exactly as planned: suggestions/contact (SP-042C), moderation +
partial apply + production release + changelog entry (SP-042D).
