# SP-037 rev B — Master Event Creation & Participation: Unified Architecture

Status: **APPROVED** (Paweł, 2026-07-19) with the authoritative
clarifications recorded in §11; Slice 1 database artifacts prepared
(`supabase/2026-07-19_sp037b_master_events.sql` + functional rollback),
NOT executed.
Date: 2026-07-19. Supersedes the paused SP-037B invitation-only sketch.
Inputs: Paweł's authoritative product rules A–D (2026-07-19), the deployed
SP-036 migration (event paths at the DB boundary), the deployed SP-037
migration + application layer (participation), W-09/W-10/W-11 in
docs/WORKFLOWS.md, Decision 015/016.

---

## 1. The four workflows against the current implementation

| Rule | Product requirement | Already deployed | Missing |
|---|---|---|---|
| **A** — master submits facility + bundled event + self | facility pending → platform approval activates eligible bundled content atomically; no manager rights | SP-036: `bundled_with_submission` marker, RLS path B′, `approve_facility_submission` activates eligible bundled events | bundled-event UI (cancelled SP-036 slice 3); **organizer participation** created with the event and approved atomically on facility approval |
| **B** — master creates event at unmanaged facility | event active without manager approval; master's own participation approved; moderation retains override | SP-036 RLS path B (INSERT active at unmanaged facility); `events_update_master`/`events_delete_master`; admin override policies | creation UI; **auto-approved organizer participation** (conflicts with the SP-037 assumption that staff resolves every participation) |
| **C** — master proposes event at managed facility | event + proposer participation pending together; manager approval activates **both atomically**; rejection rejects both — no split states | SP-036 RLS path C (INSERT pending at managed facility) | creation UI; proposal queue in the Owner Workspace; **atomic resolve RPC** (event + organizer participation); SP-037's `resolveEventParticipation` alone cannot guarantee atomicity |
| **D** — facility invites a master | invitation → master accepts/declines; no consent bypass; admin direct-assign stays an operator exception | SP-037: request/resolve machine, admin direct assignment | `initiated_by` distinction, invitation policies + trigger transitions (mirror of the `master_affiliations` handshake), UI on both sides |

**The one real model conflict:** SP-037 was built on "every participation is
resolved by staff/admin". Rules A–C introduce a second, legitimate birth
path: the **organizer's own participation**, which must be born (or become)
`approved` without a manager where no manager exists. Resolution: these
rows are created exclusively by **trusted SECURITY DEFINER RPCs** that
verify eligibility internally — no RLS arm is relaxed, raw API inserts
remain exactly as strict as today.

## 2. Role of `organizer_master_id`

Unchanged and load-bearing: `sauna_events.organizer_master_id`
(NULL = facility event) identifies the event's **organizer of record**.
Organizer-ness is always **derived** (`sauna_event_masters.master_id =
sauna_events.organizer_master_id`) — never a flag on the participation row.
The organizer's authority extends to exactly that event (edit content,
delete; never status/provenance — enforced today by `sauna_events_guard`)
and NEVER implies facility management or affiliation: no `sauna_managers`
row, no `master_affiliations` row is created or inferred by any flow in
this document. Organizer / participant / facility manager / affiliation
remain four independent concepts.

## 3. Event status transitions (target)

```
FACILITY EVENT (organizer_master_id IS NULL) — unchanged
  staff/admin create ─────────────► active ◄──► rejected (admin moderation)

MASTER EVENT, unmanaged facility (rule B)
  create_master_event RPC ────────► active          (born active)
  moderation override ────────────► rejected / deleted

MASTER EVENT, managed facility (rule C)
  create_master_event RPC ────────► pending
  resolve_master_event RPC (staff/admin):
      approve ──► active   (+ organizer participation approved — same tx)
      reject  ──► rejected (+ organizer participation rejected — same tx)

BUNDLED EVENT, own pending facility (rule A)
  create bundled (submission flow) ► pending  [bundled_with_submission]
  approve_facility_submission ────► active for eligible
                                    (+ organizer participation approved)
  reject_facility_submission ─────► rejected (+ participation rejected)
                                    [today bundled events stay orphaned
                                     pending — this closes that gap]
```

Facility management state is decided at **creation/resolution time** by the
existing `public.is_sauna_managed(sauna_id)` helper (point 5) — exists
approved `sauna_managers` row; SECURITY DEFINER, already deployed.

## 4. Participation status transitions (target)

`sauna_event_masters` gains `initiated_by` (see §6). NULL = legacy/admin
direct assignment (the 20 historical rows; also future admin inserts).

```
'master' request (W-11, deployed today)
  INSERT pending, role NULL (master)
    ├─ staff/admin resolve: → approved (role required, approved_at := now())
    │                        → rejected (role NULL, approved_at NULL)
    └─ master withdraws: DELETE (MVP history limitation, unchanged)

'facility' invitation (rule D, new)
  INSERT pending, role PROPOSED by inviter (staff of the event's sauna)
    ├─ invited master (is_master_owner): → approved (accepts; role kept,
    │                                      approved_at := now())
    │                                    → rejected (declines)
    └─ inviting staff cancels: DELETE while pending

organizer participation (rules A/B/C, new)
  born via trusted RPC only:
    B: born approved (role chosen by organizer, default 'lead')
    A/C: born pending, resolved ATOMICALLY with the event by the same RPC
  never insertable this way through raw API (admin-only INSERT policy is
  untouched; RPCs are SECURITY DEFINER and self-validate)

invariants (all enforced by the existing triggers, extended):
  approved ⇔ approved_at trusted ∧ role ∈ {lead, assistant, guest}
  pending/rejected ⇒ approved_at NULL; role NULL unless 'facility'-initiated
  event_id / master_id / initiated_by immutable after insert
  pending → approved/rejected are the only transitions, resolver depends
  on initiated_by (mirror of guard_affiliation_transition, SP-035)
```

## 5. Actor-by-action matrix

✅ allowed · Ⓢ within scope · RPC = only through the trusted RPC · ⬜ no.

| Action | Verified master | Event staff | Admin | Moderator (non-admin) | Anon/user |
|---|---|---|---|---|---|
| Create facility event | ⬜ | Ⓢ own sauna (SP-034) | ✅ | ⬜ | ⬜ |
| Create master event @ unmanaged | RPC → active + own participation approved | n/a | ✅ | ⬜ | ⬜ |
| Propose master event @ managed | RPC → pending pair | n/a | ✅ | ⬜ | ⬜ |
| Bundled event with own facility submission | RPC/submission flow → pending pair | n/a | ✅ | ⬜ | ⬜ |
| Resolve master-event proposal (event+organizer atomically) | ⬜ | Ⓢ own sauna (RPC) | ✅ (RPC) | ⬜ | ⬜ |
| Edit master-event content | Ⓢ own organized (deployed) | Ⓢ facility events (see §9) | ✅ | ⬜ | ⬜ |
| Change event status directly | ⬜ (guard) | Ⓢ (guard-limited) | ✅ | ⬜ | ⬜ |
| Request participation (W-11) | Ⓢ self, pending (deployed) | ⬜ | ✅ direct | ⬜ | ⬜ |
| Resolve 'master' request | ⬜ | Ⓢ own events (deployed) | ✅ | ⬜ | ⬜ |
| Send invitation ('facility') | ⬜ | Ⓢ own events, role proposed | ✅ | ⬜ | ⬜ |
| Accept/decline invitation | Ⓢ self (invited) | ⬜ | ✅ | ⬜ | ⬜ |
| Cancel pending invitation | ⬜ | Ⓢ inviter | ✅ | ⬜ | ⬜ |
| Withdraw own pending request | Ⓢ self (deployed) | ⬜ | ✅ delete any | ⬜ | ⬜ |
| Direct approved assignment | ⬜ | ⬜ | ✅ operator exception (deployed) | ⬜ | ⬜ |
| See non-approved rows | Ⓢ own | Ⓢ own events | ✅ | ✅ read-only | ⬜ |

## 6. Proposed minimal schema changes (one additive migration)

```sql
-- 1. Handshake direction; NULL = legacy/admin direct assignment.
alter table public.sauna_event_masters
  add column if not exists initiated_by text
    check (initiated_by in ('master', 'facility'));

-- 2. Policies (additive):
--    * staff invitation INSERT: pending, initiated_by='facility',
--      is_event_staff(event_id), role IS NULL OR role in vocabulary
--      (proposal), approved_at NULL;
--    * invited-master UPDATE: is_master_owner(master_id) AND
--      initiated_by='facility' (transitions constrained by the guard);
--    * inviting-staff DELETE: is_event_staff(event_id) AND
--      status='pending' AND initiated_by='facility';
--    * request INSERT policy gains initiated_by='master'.

-- 3. Trigger updates (replace bodies, same names):
--    * normalize_event_master_insert: allow a role PROPOSAL on pending
--      rows when initiated_by='facility' (vocabulary-checked); everything
--      else unchanged;
--    * guard_event_master_columns: resolver depends on initiated_by —
--      'master'/NULL → is_event_staff OR is_admin (today's rule);
--      'facility' → is_master_owner (accept keeps the proposed role,
--      approved requires role in vocabulary); initiated_by immutable.

-- 4. Trusted RPCs (SECURITY DEFINER, search_path='', self-validating,
--    granted to authenticated; anon-execute NOT needed — none is
--    referenced by a SELECT policy [lesson of 2026-07-19]):
--    * create_master_event(payload) → inserts sauna_events +
--      organizer participation in one tx; routing:
--        unmanaged active facility → event active + participation
--          approved (role param, default 'lead')
--        managed facility → both pending
--        own pending facility + bundled=true → both pending
--    * resolve_master_event(event_id, decision, organizer_role) →
--      staff/admin; pending master event → active + organizer approved,
--      or rejected + organizer rejected; single tx (rule C atomicity);
--    * approve_facility_submission: EXTENDED — after activating eligible
--      bundled events also approves their organizers' participation rows
--      (same eligibility re-checks);
--    * reject_facility_submission(sauna_id): NEW — rejects the facility
--      and its bundled events + participations (closes the orphaned
--      pending gap; replaces the plain UPDATE in rejectFacility).
```

No changes to `sauna_events` (columns exist), no new tables, no RLS
relaxation of any existing arm.

## 7. Point-by-point answers

**(6) Atomicity** — every multi-row state change lives in exactly one
SECURITY DEFINER RPC: `create_master_event`, `resolve_master_event`,
`approve/reject_facility_submission`. Guard triggers still fire inside the
RPCs (they validate against `auth.uid()` of the calling user, which is
preserved in DEFINER functions), so the state machines hold even for
trusted paths; split states (rule C's "active event, pending organizer")
become unrepresentable because no non-RPC path can move the pair.

**(8) Editing a master event at an unmanaged facility** — already deployed
and unchanged: the organizer edits/deletes their own event
(`events_update_master` / `events_delete_master`), the guard freezes
status and provenance; moderation overrides. Nobody else edits (no staff
exists).

**(9) Facility gains a manager later** — nothing retroactive: the active
master event stays active (W-09 rule, already documented). From that
moment: (a) new master events route to path C automatically
(`is_sauna_managed` is evaluated at creation time); (b) the manager's
staff arms now cover the facility's events — including the master-created
one: staff can edit/delete it and resolve its pending participation
requests. **Decision point for review:** this gives the manager authority
over a previously master-controlled event (facility sovereignty over its
own name — consistent with Decision 015); the alternative
(organizer-locked events) would require new policy carve-outs. Proposal:
accept facility sovereignty; the organizer keeps concurrent edit rights.

**(10) Compatibility** — SP-036: RLS paths B/B′/C stay as the boundary;
the RPC becomes the only *application* path (raw inserts remain possible
and safe — they just create an event without an organizer lineup entry,
which the master can fix by requesting participation). `bundled` flag,
`approve_facility_submission` signature and the SP-036 admin UI keep
working; the RPC extension only adds participation approval. SP-037: all
deployed code (request/withdraw/resolve actions, Studio, workspace queue,
event-page controls) continues unchanged — `initiated_by` is NULL-safe
for every existing row and query; the resolve action keeps serving
'master' requests; new UI reads `initiated_by` only for the invitation
surfaces.

## 8. Identified conflicts with the deployed SP-037 model

1. **"Staff resolves every participation" vs auto-approved organizer** —
   resolved via trusted-RPC birth (no policy relaxation; §1).
2. **Request policy requires an ACTIVE event** — a master cannot "request"
   into a pending proposal; correct by design (the organizer pair is
   created by the RPC), but the event page must hide the request button on
   pending events (it already renders only for `status='active'`).
3. **`resolveEventParticipation` alone cannot deliver rule C atomicity** —
   superseded for organizer pairs by `resolve_master_event`; stays for
   ordinary requests.
4. **Role on pending rows is normalized to NULL** — invitations need a
   role *proposal*; requires the §6 trigger adjustment (scoped strictly to
   `initiated_by='facility'`).
5. **`rejectFacility` plain UPDATE leaves bundled events orphaned-pending**
   — closed by `reject_facility_submission`.

## 9. Migration strategy

Read-only probe first (counts of `sauna_event_masters` by status ×
initiated_by-candidate paths — trivial, data known), then ONE additive
migration script (column + policies + trigger-body replacements + RPCs +
extended facility RPCs), functional rollback preserving all hardening
(drop invitation arms + RPC creation paths; organizer rows already born
stay valid data). All triggers/RPCs follow the established conventions:
`search_path=''`, full qualification, vocabulary + timestamp ownership in
triggers, execution grants only where policies do not reference them.

## 10. Recommended implementation slices

1. **DB migration** (everything in §6) — review → manual apply → verify.
2. **Rule B+C creation**: "Utwórz wydarzenie" in Master Studio (facility
   picker over active facilities, managed-state routing message), organizer
   auto-participation; organizer badge on the event page (Decision 015
   visible distinction — reuses `organizer_master_id`).
3. **Rule C resolution**: "Propozycje wydarzeń" queue in the Owner
   Workspace on `resolve_master_event` (atomic approve/reject).
4. **Rule A**: bundled-event step in the facility submission form (the
   resurrected SP-036 slice 3) + the extended facility RPCs in
   `approveFacility`/`rejectFacility` actions.
5. **Rule D**: invitations — staff "Zaproś saunamistrza" on workspace
   events, Accept/Decline cards in Studio "Wystąpienia".
6. **Docs + E2E**: WORKFLOWS W-09/W-10/W-11 statuses, USER_MODEL matrix,
   FEATURES, SPRINT_HISTORY, full checklist on production.

Each slice ships behind lint+build with a focused commit; slices 2–5 are
independently deployable after slice 1.

---

## 11. Approved clarifications (Paweł, 2026-07-19 — authoritative)

**Facility gains a manager after a master-created event:** the active
event stays active; future submissions follow the managed workflow; the
manager gains operational/moderation authority over the facility's events
(including deactivating or removing inappropriate ones) — but must NOT
change `organizer_master_id`, take over authorship, silently replace the
organizing master, or bypass master-consent rules for the lineup (all
enforced today: `sauna_events_guard` freezes organizer/provenance for
non-moderation; lineup changes go through the participation machine). The
organizer keeps parallel content-edit rights within immutable identity and
facility fields.

**Edge cases 1–10** (enforced in the Slice 1 migration; see its header for
the mapping): routing decided in-transaction; pending managers don't
manage; orphaned proposals stay pending (master deletes own event or admin
resolves); pending-only, `FOR UPDATE` concurrency-safe resolution;
immutable `event_id`/`sauna_id`/`organizer_master_id`/`master_id`/
`initiated_by`; `initiated_by` decides the resolving side ('master' →
staff/admin, 'facility' → invited master/admin, NULL → operator rows);
requests carry no role while pending; invitations carry a frozen offered
role; facility approval/rejection touches only deterministically bundled
content; RPCs return explicit resulting statuses.

**Review flag carried into Slice 1:** the participation guard's resolver
check widens from `is_admin()` to `is_platform_moderator()` so the
moderator-operated facility RPCs can resolve bundled organizer pairs
atomically. API-layer authorization is unchanged — the UPDATE policies
still exclude non-admin moderators; the widening is reachable only inside
the self-checking SECURITY DEFINER RPCs.
