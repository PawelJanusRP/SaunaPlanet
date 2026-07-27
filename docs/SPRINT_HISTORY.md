# Sprint History

Chronological record of sprint execution. For scope details of each sprint see
`docs/BACKLOG.md`; for feature documentation see `docs/FEATURES.md`.

## History

| Sprint | Status      | Branch                            | Commit    | Description |
|--------|-------------|-----------------------------------|-----------|-------------|
| SP-019 | Completed   | —                                 | `668efb8` | Administration — admin panel for sauna, event and review management |
| SP-020 | Completed   | —                                 | `07f90fe` | User Profile / Favorites / "I'm Going" — user_favorites, user_event_interests, /profile sections |
| SP-021 | Completed   | —                                 | `3c077fd` | Event Reviews & Comments — post-event reviews (1–5 stars), pre-event comments, aggregated ratings |
| SP-022 | Completed   | —                                 | `84ac415` | Event Reservations — "Zapisz się" flow, event_registrations, seat limits, sauna manager role |
| SP-023 | Planned     | —                                 | —         | Sauna and sauna master rankings |
| SP-024 | Planned     | —                                 | —         | Event payments |
| SP-025 | Planned     | —                                 | —         | Private saunas (marketplace) |
| SP-026 | Planned     | —                                 | —         | Sauna master ↔ sauna assignments (many-to-many, roles) |
| SP-030 | Planned     | —                                 | —         | Native Mobile App (Expo) |
| SP-031 | Completed   | `feature/sp-031-workspace-shell`  | `0000e77` | Shared Workspace Infrastructure — reusable shell, avatar-menu hub, WorkspaceAccess snapshot (see `docs/PLATFORM_WORKSPACES.md`) |
| SP-032 | Completed   | `feature/sp-031-workspace-shell`  | `465e3d7` | Personal Workspace Foundation — /profile rebuilt on the shared shell: dashboard, details, favorites, reviews, events, settings; reference implementation for Owner Workspace and Master Studio |
| SP-033 | Completed   | `feature/sp-033-owner-workspace`  | `8047212` | Owner Workspace Foundation — /workspace on the shared shell: active facility context (all/one), dashboard, reservations and events modules; manager functionality migrated out of the Personal Workspace |
| SP-034 | Completed   | `feature/sp-034-owner-events`     | `8bda515` | Owner Event Management — create/edit/delete events from the Owner Workspace within the active facility context; manager-scoped server actions + additive sauna_events RLS (SQL applied 2026-07) |
| SP-035 | Completed   | `feature/sp-035-master-studio`    | `47b400c` | Master Studio Foundation (+SP-035D quality pass) — /studio on the shared shell, profile integrity (unique account↔profile link, own-row RLS, privileged-column guard), first-class master_affiliations with two-direction lifecycle, Owner Workspace Team module; home_sauna_id frozen as legacy (SQL applied 2026-07) |
| SP-036 | Completed   | `feature/sp-036-master-facilities` / `feature/sp-036-facility-moderation` | `c5c5404`+ | Master-Contributed Facilities & Events — community facility submissions (pending + moderation), duplicate detection (pg_trgm + distance gating), RLS hardening of live anon-write holes, admin facility-moderation tab. URL import descoped to SP-038; bundled-submission UI delivered inside SP-037B |
| SP-037 | Completed   | `feature/sp-036-facility-moderation` | `1802c48` | Master Event Participation (W-11) — sauna_event_masters as a workflow table (policies + guard triggers, trusted approved_at), request from event pages, /studio/events, staff moderation queue in /workspace/events (SQL applied + verified 2026-07-19) |
| SP-037B | Completed  | `feature/sp-036-facility-moderation` | `ec0d76b` | Master Events & Invitations (W-09/W-10) — initiated_by handshake direction; trusted RPCs: create_master_event (unmanaged → active + organizer lead, managed → atomic pending pair), resolve_master_event (atomic proposal resolution), submit_facility_with_master_event (atomic bundled facility + first event), reject_facility_submission; organizer UI + proposal queue; facility→master invitations with master consent, frozen offered role, staff withdrawal (SQL applied + verified; production E2E green 2026-07-20) |
| SP-038 | Completed   | `feature/sp-038-smart-import`     | `4147963` | Smart Facility Import — website provider (OG/metadata/JSON-LD with deterministic per-field merge), SSRF-safe fetch, duplicate detection, editable `/submit` preview, import→submission linking, social links, controlled consent-gated image import, Storage authorization hardening, moderation provenance panel. Merged + deployed to production 2026-07-27 (docs/SP038_SMART_IMPORT_ARCHITECTURE.md). FB best-effort / paste fallback deferred to backlog |
| SP-039 | In progress | `feature/sp-039-master-growth` (merged, deleted) | `e3b037c` | Saunamaster Pilot Foundation — **Slice 1 CLOSED/deployed 2026-07-27** (expanded master profile, UUID/slug dual lookup, public profile redesign, completeness lib, Studio editor, avatar/cover upload, privileged-field + Storage hardening, restored `masters_select` own-row visibility). Slices 2–6 = profile-claim + onboarding workflow for the 10-master private pilot (docs/ROADMAP.md §SP-039). Rescoped from the earlier "Sauna Sessions"; recurrence relocated to SP-041 |

Sprints prior to SP-019 (SP-012 through SP-018: roles and permissions, RLS
hardening, submission moderation, master registration, certificates, event
detail page) are recorded in git history and `docs/FEATURES.md`.

## Sprint Numbering

Sprint numbers are **identifiers**, not a contiguous chronological sequence.
A gap between the highest completed sprint number and the sprint currently in
progress is intentional and must not be "fixed".

Numbers **SP-023 through SP-030** are intentionally unassigned or reserved:
some of them are already scoped as planned initiatives in `docs/BACKLOG.md`
(rankings, payments, private saunas, master assignments, native mobile app),
while others are held back for future planning and history reconstruction.
None of them have started implementation.

**SP-016 (master↔sauna affiliations)** was absorbed into **SP-035 Master
Studio Foundation** (Decision 016) — the identifier stays valid in older
references, but the work is delivered inside SP-035, not as a standalone
sprint.

The project intentionally continues with **SP-031** because the Workspace
initiative (`docs/PLATFORM_WORKSPACES.md`) became a separate architectural
milestone after earlier roadmap iterations, and it was assigned a fresh
identifier rather than consuming one of the reserved numbers.

**SP-036** was rescoped from the original "Sauna Sessions" reservation to
**Master-Contributed Facilities & Events**; Sessions moved to **SP-039**,
then (2026-07-27) out of SP-039 to **SP-041 Recurring Sauna Sessions** when
the private-master pilot became the top priority. **SP-037B** is a
mid-sprint extension of SP-037 (the invitation and master-event rules A–D
pivot) — it shares the SP-037 architecture document and branch and keeps
its own identifier in commits.

**Pilot reprioritization renumbering (2026-07-27).** SP-039 was rescoped to
**Saunamaster Pilot Foundation** (master profile + profile-claim
onboarding; docs/ROADMAP.md §SP-039), with a new operational phase
**SP-039P Controlled Sauna Master Pilot**. Three *planned, not-yet-started*
identifiers were reorganized (permitted precisely because none had begun
implementation): **SP-040** became **Platform Operations and Free-Tier
Guardrails** (absorbing the earlier "Platform Capacity & System Health
Dashboard"); **SP-041** became **Recurring Sauna Sessions**; the earlier
"Architecture, Performance & Scalability Review" moved to **SP-043**.
SP-042 (Facility Data Improvement Proposals) is unchanged. This does not
violate the "never renumber retroactively once implementation has started"
rule below — SP-038 and SP-039 Slice 1 keep their identifiers permanently,
and only unstarted planning numbers were moved.

## Sources of Truth

* **Git history** is the source of truth for completed implementation.
* **Project documentation** (`docs/BACKLOG.md`, `docs/ROADMAP.md`,
  `docs/PLATFORM_WORKSPACES.md`) is the source of truth for roadmap and
  architectural planning.
* **Sprint numbers must never be renumbered retroactively** once
  implementation has started — branches, commits and documents referencing a
  sprint number keep it permanently.
