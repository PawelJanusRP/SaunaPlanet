# SaunaPlanet — Current Project State

Last updated: 2026-07-27 (`main` @ `e3b037c`, SP-039 Slice 1 deployed).

This is the canonical **handover document** for ongoing development. Its purpose
is orientation: a new AI or human session should understand the current project
state in a few minutes without replaying the repository history. It is
deliberately not a roadmap, not a specification and not a user model — those
live in their own documents, referenced below.

Keep this document short. Update it when a sprint merges or the architecture
changes; prune anything that stops being current.

---

## Project Status

SaunaPlanet is a working, feature-rich MVP of a sauna ecosystem platform
(map-first discovery of facilities, events and sauna masters), currently in
**Phase 4 — Event Platform** of `docs/ROADMAP.md`. Phases 1–3 (Foundation,
Accounts & Security, Administration) are completed.

What already exists and works on `main`:

* Leaflet map with clustering, event highlighting and master satellite avatars
* facility pages, list page, submission + moderation workflow
* events with detail pages, reviews, comments, interests and reservations
* sauna master profiles with certifications and moderation
* Supabase Auth with `user/moderator/admin` roles plus a `sauna_managers` table
* a 9-tab admin panel
* the shared Workspace architecture: Personal Workspace (`/profile`) and
  Owner Workspace (`/workspace`)

Since SP-038 the project has a **Vitest suite** (`lib/**/__tests__`, 173
tests as of `e3b037c`, run with `npm test`) and **versioned SQL migrations**
under `supabase/*.sql` that are applied to the live database through a
controlled preflight → apply → post-apply-verify checkpoint flow (the live
Supabase project remains the schema source of truth, but every applied
change is now in Git). The map/list era code still has no automated tests.
See `docs/REPOSITORY_AUDIT.md` for the full repository map — read it before
any code exploration.

---

## Current Architecture

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4,
Supabase (Postgres + PostGIS, Auth, Storage, Realtime), Leaflet.

The architectural backbone since 2026-07 is the **shared Workspace
architecture** (design reference: `docs/PLATFORM_WORKSPACES.md`):

* **Workspace Shell** (`components/workspace/*`) — one reusable shell
  (breadcrumbs, header, responsive nav, Today-queue slot) used by every
  workspace; no per-workspace layout forks.
* **Configuration-driven navigation** — each workspace is a config module
  (`lib/workspace/personal.ts`, `owner.ts`, `master.ts`), not duplicated UI.
* **Workspace Context** (`lib/workspace/context.ts` +
  `WorkspaceContextSwitcher`) — generic active-context model (e.g. "all
  facilities" vs one facility in the Owner Workspace). Presentation only —
  never an authorization source.
* **Workspace Access** — a `WorkspaceAccess` snapshot in
  `components/AuthProvider.tsx` (approved manager memberships, linked master
  profile) that drives navigation visibility only.
* **Personal Workspace** at `/profile` (SP-032) — the reference
  implementation; **Owner Workspace** at `/workspace` (SP-033/034) with active
  facility context; **Master Studio** at `/studio` (SP-035).
* **Supabase + authorization** — three data-access patterns (client queries,
  ~25+ server actions, RPCs). Authorization is enforced server-side by
  **Server Actions + RLS**; the database is the boundary. RLS philosophy:
  public read for approved content, own-row writes for user content,
  moderation roles for the rest; server actions re-verify the caller and fail
  loudly when RLS matches zero rows.

Implementation details are documented in `docs/REPOSITORY_AUDIT.md` (routes,
modules, schema, RPCs) — do not duplicate them here.

---

## Completed Sprint Summary

Merged into `main` (details: `docs/SPRINT_HISTORY.md`, `docs/FEATURES.md`):

* **SP-001…SP-018** — foundation era: map, events, reviews, detail pages,
  master profiles and satellites, documentation set, authentication (SP-011),
  roles (SP-012), master registration (SP-015), certificates (SP-017), event
  detail page (SP-018).
* **SP-019** — administration: `/sauny` list page and admin moderation of
  facilities, events and reviews.
* **SP-020** — user favorites (saunas) and event interests ("Idę" toggle).
* **SP-021** — event reviews (post-event stars), pre-event comments,
  `/sauna/[id]/reviews`.
* **SP-022** — event reservations: registration flow, seat limits, sauna
  manager approval role.
* **SP-031** — shared Workspace infrastructure: shell, avatar-menu hub,
  WorkspaceAccess snapshot.
* **SP-032** — Personal Workspace: `/profile` rebuilt on the shared shell.
* **SP-033** — Owner Workspace foundation: `/workspace` with active facility
  context; manager features migrated out of the Personal Workspace.
* **SP-034 — Owner Event Management**: create/edit/delete events from
  `/workspace/events` via manager-scoped server actions, within the active
  facility context. Merged 2026-07-17 (`8bda515`).
* **SP-035 — Master Studio Foundation** (incl. **SP-035D** code-quality
  implementation): `/studio` on the shared shell (dashboard with invitation
  Today queue, own-profile editing, affiliations); master profile integrity
  (unique `sauna_masters.user_id` link, own-row RLS replacing the open
  `USING(true)` policy, privileged-column trigger); first-class
  `master_affiliations` with a two-direction lifecycle (W-16); Owner
  Workspace **Team** module (`/workspace/team`); moderation status
  visibility on `/masters` and admin Users; master rejection notes
  (`master_moderation_notes`); event-pulse on map clusters. `home_sauna_id`
  is frozen as legacy display data. Merged 2026-07-17 (`47b400c`). Full
  scope: `docs/FEATURES.md` §SP-035, `docs/CODE_QUALITY_REVIEW.md`.
* **SP-036 — Master-Contributed Facilities & Events**: community facility
  submissions (all authenticated users, pending + admin/moderator
  moderation), duplicate detection (pg_trgm + distance gating), RLS
  hardening of live anon-write holes, facility moderation tab in the admin
  panel. Slice 1 merged 2026-07-18 (`c5c5404`); moderation and dedup fixes
  completed on `feature/sp-036-facility-moderation`. Bundled-submission UI
  was descoped into SP-037B; URL import moved to SP-038.
* **SP-037 — Master Event Participation (W-11)**: `sauna_event_masters`
  became a workflow table (policies + guard triggers; `approved_at` owned
  by the database), masters request participation from event pages,
  `/studio/events` in Master Studio, staff moderation queue in
  `/workspace/events`. Completed and deployed 2026-07-19.
* **SP-037B — Master Events & Invitations**: `initiated_by` handshake
  direction; trusted RPCs `create_master_event` (unmanaged → active +
  organizer `lead`; managed → atomic pending pair), `resolve_master_event`
  (manager approves/rejects proposal + organizer atomically),
  `submit_facility_with_master_event` (atomic bundled facility + first
  event), extended `approve/reject_facility_submission`; organizer UI
  (Studio creation, proposal queue, organizer badge from
  `organizer_master_id` only); facility→master invitations with master
  consent (W-10) — offered role frozen, invited master resolves,
  staff withdrawal. Completed and deployed 2026-07-20 (E2E green:
  DB matrix 20/20, UI matrix on production).

The SP-034/SP-035 SQL scripts (`supabase/2026-07-11_sp034_owner_events_rls.sql`,
`2026-07-11_sp035_master_studio.sql`, `2026-07-12_sp035_master_insert_level_guard.sql`,
`2026-07-16_sp035d_master_moderation_notes.sql`,
`2026-07-17_sp035d_masters_select_rls.sql`) were applied manually to the live
Supabase project and runtime-verified before the merge (2026-07-17).

---

Also merged into `main` since the summary above:

* **SP-036 / SP-037 / SP-037B** merged to `main` and deployed 2026-07-20
  (`351d7a2`) — production and `main` are in sync again.
* **SP-038 — Smart Facility Import** merged + deployed 2026-07-27 (`4147963`):
  website provider (OG/metadata/JSON-LD with deterministic per-field merge),
  SSRF-safe fetch, duplicate detection, editable `/submit` preview,
  import→submission linking, social links, consent-gated controlled image
  import, Storage authorization hardening, moderation provenance panel
  (docs/SP038_SMART_IMPORT_ARCHITECTURE.md).
* **SP-039 Slice 1 — Saunamaster Pilot Foundation** merged + deployed
  2026-07-27 (`e3b037c`): expanded master profile (slug + UUID/slug dual
  lookup, city, specialties, languages, experience year, social links,
  website, cover image, Founding Partner badge), public profile redesign,
  approved-affiliation display, hide-empty, rating hidden at zero reviews,
  completeness library, Studio profile editor, avatar/cover upload,
  privileged-field guard + Storage hardening, restored `masters_select`
  own-row visibility.

## In Review

Nothing in review — `main == origin/main == production == e3b037c`. All
applied migrations are versioned in Git under `supabase/`.

The next work is **SP-039 Slice 2 — Claim Architecture and Security Review**
(architecture/security review only; no implementation) for the private
10-master pilot. See docs/ROADMAP.md §SP-039.

---

## Current Domain Model

Implemented entities (schema details: REPOSITORY_AUDIT §5; personas and
permissions: `docs/USER_MODEL.md`):

* **User** — `profiles` (roles: user/moderator/admin), Supabase Auth
* **Facility** — `saunas` (+ photos, submissions); no `owner_id` column yet
* **Owner/Manager** — `sauna_managers` membership table (approval-based)
* **Sauna Master** — `sauna_masters` + `master_certificates`
* **Event** — `sauna_events` + `sauna_event_masters` (master assignments)
* **Reservation** — `event_registrations` (seat limits, manager approval)
* **Review** — `sauna_reviews`, `event_reviews`, `event_comments`
* **Favorite / Interest** — `user_favorites`, `user_event_interests`
* **Affiliation** — `master_affiliations` (SP-035; Decision 016)

Planned, not yet implemented:

* **Prepared / claimed master profile** — admin-prepared profiles claimed by
  the authenticated master via a secure token (SP-039 Slices 2–6; the six
  independent states — prepared / claimed / identity-verified /
  qualifications-verified / Founding Partner / published — must never be
  collapsed; see docs/ROADMAP.md §SP-039)
* **Recurring session series** — `sauna_event_series` + generated concrete
  occurrences (SP-041, relocated out of SP-039; authoritative model:
  `docs/EVENT_SESSION_MODEL.md`)
* **Platform operations dashboard** — free-tier guardrails at `/admin/system`
  (SP-040; must precede broad pilot invitations)
* **Payments / transactions** — no tables yet (SP-024)
* **Private sauna ownership** — marketplace entities (SP-025)

---

## Current Product Decisions

Every future sprint must respect these (full reasoning: `docs/DECISIONS.md`):

* **The repository is the source of truth** — git history for completed work,
  docs for planning; the live Supabase project is the schema source of truth
  until a migration structure exists.
* **Documentation before implementation** — workflows (`docs/WORKFLOWS.md`)
  and product models are written first and drive product evolution;
  documentation is part of the product (Decision 009).
* **Ecosystem, not directory** (Decision 001); incremental evolution over
  rewrites (Decision 008); the map stays the primary interface (Decision 005).
* **Workspace-driven architecture** — self-service surfaces are workspaces on
  the shared shell; **configuration over duplication** for navigation and
  layout.
* **WorkspaceContext and WorkspaceAccess are presentation only** —
  authorization is enforced exclusively by **Server Actions + RLS**.
* **Affiliation replaces `home_sauna_id`** (Decision 016) — `home_sauna_id`
  is transitional, read-only legacy, never an authorization source.
* **Sessions are independent from Events** — Session is the atom, Event is a
  container (Decisions 011/014); **Sessions support multiple masters**
  (many-to-many with roles, lead conductor required).
* **Masters are never blocked by inactive facilities** — event publication
  follows facility management state (Decision 015).
* **Mobile-first** — every feature is designed for the phone first (root
  `CLAUDE.md`).

---

## Current Roadmap

Next stages (do not duplicate — see `docs/ROADMAP.md` and
`docs/BACKLOG.md`):

* **SP-039 — Saunamaster Pilot Foundation** (active sprint): Slice 1 closed
  and deployed; next is **Slice 2 — Claim Architecture and Security Review**
  (review only), then Slices 3–6 (admin-prepared profiles, atomic claim,
  onboarding, pilot E2E). Highest current product priority: a controlled
  private pilot with the first 10 sauna masters.
* **SP-039P — Controlled Sauna Master Pilot**: operational waves of 2 → 3 → 5
  masters, gated by SP-040.
* **SP-040 — Platform Operations and Free-Tier Guardrails**: `/admin/system`
  usage/capacity dashboard; must precede broad pilot invitations
  (supersedes the earlier "Capacity Dashboard").
* **SP-041 — Recurring Sauna Sessions**: recurrence engine relocated out of
  SP-039 (`docs/EVENT_SESSION_MODEL.md`).
* **SP-042 — Facility Data Improvement Proposals**: unchanged.
* **SP-043 — Architecture, Performance & Scalability Review**: renumbered
  from the earlier SP-040 (2026-07-27 pilot reprioritization; see the
  renumbering note in `docs/ROADMAP.md`).

> Numbering note: the 2026-07-27 pilot reprioritization moved three
> *planned, not-yet-started* identifiers (old SP-040 Architecture Review →
> SP-043; old SP-041 Capacity Dashboard → absorbed into the new SP-040).
> Started sprints (SP-038, SP-039 Slice 1) keep their numbers permanently.

---

## Open Technical Debt

Full list: REPOSITORY_AUDIT §8–10. Highlights every session should know:

* **Manual SQL application** — no `supabase/migrations/`; scripts under
  `supabase/*.sql` are applied by hand; the live schema is ahead of the repo.
* **Runtime verification still required** for SP-034/SP-035 (nothing on the
  branch has been exercised against the live database).
* **`home_sauna_id` migration** — data migration into primary affiliations
  deliberately deferred (would grant session-publication consent without
  facility consent); retire the column later.
* **Workspace nav badge counts** — `badgeCount` slot exists in
  `lib/workspace/types.ts` / `WorkspaceNav` but is not populated anywhere.
* **Notifications** — none (email/push); reservation and affiliation flows
  are silent.
* **Moderator permissions inconsistency** — `is_admin()` checks only `admin`
  while some policies include `moderator`.
* **Legacy compatibility** — `lib/supabase.ts` singleton (used only by
  `SaunaMap.tsx`), redundant `sauna_events` date columns, text `price`.
* No tests, no FK indexes, no i18n, broken PWA manifest, several stale docs
  (`docs/DATABASE.md`, `docs/RLS.md`, parts of `docs/KNOWN_ISSUES.md` and
  `docs/BACKLOG.md`).

---

## Starting a New Development Session

For a future AI assistant:

1. **Read this document first** (`docs/CURRENT_STATE.md`).
2. **Then read the referenced documents** relevant to the task:
   `docs/REPOSITORY_AUDIT.md` (always, before exploring code),
   `docs/DECISIONS.md`, `docs/WORKFLOWS.md`, and the domain model for the
   area you touch (`docs/USER_MODEL.md`, `docs/EVENT_SESSION_MODEL.md`,
   `docs/PLATFORM_WORKSPACES.md`).
3. **Inspect the repository** — check the current branch, `git log` against
   `main`, and only the source files relevant to the task.
4. **Only then start planning or implementation**, following the rules in the
   root `CLAUDE.md` (plan → implement → lint → build → summarize → prepare
   commit; never merge or push automatically).
