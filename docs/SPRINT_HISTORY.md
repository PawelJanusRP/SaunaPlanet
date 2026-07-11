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
| SP-034 | In Review   | `feature/sp-034-owner-events`     | —         | Owner Event Management — create/edit/delete events from the Owner Workspace within the active facility context; manager-scoped server actions + additive sauna_events RLS (SQL to apply manually) |

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

The project intentionally continues with **SP-031** because the Workspace
initiative (`docs/PLATFORM_WORKSPACES.md`) became a separate architectural
milestone after earlier roadmap iterations, and it was assigned a fresh
identifier rather than consuming one of the reserved numbers.

## Sources of Truth

* **Git history** is the source of truth for completed implementation.
* **Project documentation** (`docs/BACKLOG.md`, `docs/ROADMAP.md`,
  `docs/PLATFORM_WORKSPACES.md`) is the source of truth for roadmap and
  architectural planning.
* **Sprint numbers must never be renumbered retroactively** once
  implementation has started — branches, commits and documents referencing a
  sprint number keep it permanently.
