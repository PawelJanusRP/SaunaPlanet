# Repository Audit — SaunaPlanet

Last full audit: 2026-07-11 (branch `main`, after commit `bf68c5c`).

Purpose: this is the **working repository map** for product and architecture analysis.

Rules for agents and contributors:

* Read this document first before exploring the repository.
* Inspect only the source files relevant to the current question.
* Do not repeat a full-repository review unless explicitly requested.
* Update this document when the repository materially changes (new features, schema changes, new routes, resolved debt).

---

## 1. Product Summary

SaunaPlanet is a **sauna ecosystem platform** (not a directory) for Europe, starting in Poland.

Core product relationship: **Sauna → Event → Sauna Master**.

* Users discover *experiences* (events, ceremonies led by certified sauna masters), not just facilities.
* Entities: sauna facilities, sauna events, sauna masters (with certifications), reviews, reservations.
* Planned monetization: reservation/event commissions, premium accounts, business accounts, private sauna marketplace.
* Mobile-first product; mobile strategy: responsive web → PWA → native app (Expo, SP-030).

Current phase: **Phase 4 — Event Platform (IN PROGRESS)**. Phases 1–3 (Foundation, Accounts & Security, Administration) are COMPLETED.

Authoritative sources: `docs/VISION.md`, `docs/PRODUCT_STRATEGY.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`.

---

## 2. Implemented Feature Inventory

DONE (as of this audit):

| SP | Feature |
|----|---------|
| SP-001 | Sauna events (creation, listing, popup, calendar, map highlighting) |
| SP-002 | Sauna reviews and rankings |
| SP-003 | Sauna detail page `/sauna/[id]` |
| SP-004 | Sauna master profiles `/masters/[id]` |
| SP-005 | Master satellite avatars on map (300° orbit, level color rings) |
| SP-006 | Project documentation set |
| SP-007 | Master avatar upload (`master-avatars` bucket) |
| SP-008 | Event + master display on detail pages |
| SP-009 | Clickable satellite avatars |
| SP-010 | Edit master profile modal |
| SP-011 | Authentication (Supabase Auth: register, login, reset, email confirm, profiles) |
| SP-012 | Roles and permissions (`profiles.role`: user/moderator/admin) + admin users tab |
| SP-015 | Master registration (self-registration with moderation, admin creation) |
| SP-017 | Certificate system (23 types / 7 categories, moderation, admin dictionary tab) |
| SP-018 | Event detail page `/events/[id]` with inline admin editing, event photos |
| SP-019 | `/sauny` list page (thumbnails, ratings, city filter) + admin facility/event/review moderation |
| SP-020 | User favorites (saunas) + event interests ("Idę" toggle with going count) |
| SP-021 | Event reviews (post-event stars) + pre-event comments + `/sauna/[id]/reviews` |
| SP-022 | Event reservations ("Zapisz się", `event_registrations`, `max_participants`, sauna manager approval role) — **committed but BACKLOG.md still says PLANNED (stale)** |
| SP-031/032/033 | Shared Workspace infrastructure, Personal Workspace (/profile), Owner Workspace (/workspace) with active facility context |
| SP-034 | Owner event management — create/edit/delete events from /workspace/events via manager-scoped server actions (`createEvent`/`updateEvent`/`deleteEvent`); additive `sauna_events` RLS for approved `sauna_managers` (`supabase/2026-07-11_sp034_owner_events_rls.sql`, applied manually) |

PLANNED: SP-016/SP-026 (master↔sauna affiliations), SP-023 (rankings), SP-024 (payments), SP-025 (private saunas marketplace), SP-027 (rating parameters admin panel), SP-029 (PWA installability), SP-030 (native app, Expo).

Authoritative sources: `docs/FEATURES.md` (detailed, mostly current), `docs/BACKLOG.md` (Polish, partially stale), `docs/ROADMAP.md` (phases).

---

## 3. Route Map

| Route | Type | Purpose | Auth |
|-------|------|---------|------|
| `/` | Client | Leaflet map (dynamic import of `SaunaMap`) | No |
| `/sauny` | Server | Sauna list, city filter (client child: `SaunyClient`) | No |
| `/sauna/[id]` | Server | Sauna detail: photos, reviews, events, masters, favorite toggle | No |
| `/sauna/[id]/reviews` | Server | Past event reviews for a sauna | No |
| `/events` | Server | Upcoming events + calendar (client: `EventsPageClient`) | No |
| `/events/[id]` | Server | Event detail: registration, comments/reviews, masters (459 lines — largest page) | No |
| `/masters` | Server | Masters directory grouped by home sauna | No |
| `/masters/[id]` | Server | Master profile: certs, events | No |
| `/(main)/profile` | Server | Personal Workspace dashboard on the shared Workspace Shell: Today queue (own events today), upcoming events, favourites, activity; links to Owner Workspace for managers (SP-032, manager features moved out in SP-033) | Logged in |
| `/(main)/profile/details`, `/favorites`, `/reviews`, `/events`, `/settings` | Server | Personal Workspace modules (nav config in `lib/workspace/personal.ts`) | Logged in |
| `/(main)/workspace` | Server | Owner Workspace dashboard on the shared Workspace Shell: facility context switcher, Today queue (pending registrations), managed facilities, upcoming events, quick actions (SP-033) | Logged in |
| `/(main)/workspace/reservations`, `/events` | Server | Owner Workspace modules scoped by the active facility context (nav config in `lib/workspace/owner.ts`); `/workspace/events` includes owner event CRUD (SP-034) — creation requires a concrete facility context | Logged in |
| `/(main)/submit` | Server | Sauna submission form | Logged in |
| `/(main)/admin` | Server | 9-tab admin panel (417 lines) | admin/moderator |
| `/auth/login`, `/register`, `/reset-password`, `/update-password` | Client | Auth forms | No |
| `/auth/callback` | Route (GET) | Code-for-session exchange | No |

Naming inconsistency: `/sauny` (Polish) vs `/sauna/[id]`, `/events`, `/masters` (English).

Middleware: `proxy.ts` — checks *login only* for `/admin` (role enforcement happens in pages/actions via `assertAdmin()`).

---

## 4. Architecture and Major Modules

Stack: Next.js 16.2 (App Router; dev runs with `--webpack`), React 19, TypeScript 5 (strict), Tailwind CSS 4, Supabase (`@supabase/ssr` + `supabase-js`), Leaflet + react-leaflet-cluster, sonner (toasts), date-fns (pl-PL locale), browser-image-compression.

Three parallel data-access patterns (no caching layer such as React Query/SWR):

1. **Direct client-side Supabase queries** — most read paths and some writes (forms, uploads).
2. **Server actions** (~25) — moderation, reservations, event reviews/comments, role changes:
   * `app/(main)/admin/actions.ts` — 16 actions (approve/reject submissions, masters, certificates, managers; sauna/event/review admin CRUD; `updateUserRole` via RPC)
   * `app/(main)/profile/actions.ts` — 3 actions (favorite toggle, manager request, event interest toggle)
   * `app/events/actions.ts` — 9 actions (event edit, master remove, register/cancel, registration status, event reviews/comments CRUD)
3. **RPC calls** — geographic/aggregation queries and privileged admin queries (see §5).

Major modules:

| Module | File(s) | Notes |
|--------|---------|-------|
| Map (HIGH RISK) | `components/SaunaMap.tsx` | **1,352 lines**, 20+ useState, realtime subscriptions, clustering, satellites, filters, 7 modal orchestrations. Protected area per CLAUDE.md. |
| Auth context | `components/AuthProvider.tsx` | React Context: user + role (from `profiles`) + `WorkspaceAccess` snapshot (approved `sauna_managers` membership, linked `sauna_masters` profile) — drives workspace navigation visibility only |
| Workspace infrastructure (SP-031/032/033) | `components/workspace/*`, `lib/workspace/*` | Shared Workspace Shell (breadcrumbs, header, responsive nav, Today-queue slot), avatar-menu hub, config-driven destinations and per-workspace nav; generic active-context model (`lib/workspace/context.ts` + `WorkspaceContextSwitcher`); Personal Workspace at `/profile` and Owner Workspace at `/workspace` (scope resolution in `lib/workspace/ownerServer.ts`) |
| Supabase clients | `lib/supabase/client.ts` (browser singleton), `lib/supabase/server.ts` (SSR + `getCurrentUserRole()`), `lib/supabase.ts` (**legacy re-export singleton, used only by SaunaMap**) |
| Reservation helpers | `lib/reservationTime.ts`, `components/ReservationBadge.tsx` | Countdown formatting |
| Moderation actions UI | `components/*ModerationActions.tsx`, `SubmissionActions.tsx`, `ManagerApprovalActions.tsx`, `RegistrationModerationActions.tsx` | ~6 near-identical approve/reject components (duplication) |
| Modals/forms | `components/Add*.tsx`, `Edit*.tsx` | Repeated modal pattern, no shared `<Modal>` abstraction |
| Import scripts | `scripts/importPtsSaunas.ts` (411 lines), `scripts/seedSaunas.ts` | See §6 |

State management: AuthContext + local useState only. No shared types file — entity types (Sauna, Event, Master) redeclared per component.

---

## 5. Database and Storage Model

**⚠ Source-of-truth caveat:** `supabase/all_scripts_history.sql` (1,913 lines, untracked) is an ad-hoc script dump, NOT a migration set. It contains test-data INSERT/DELETE/TRUNCATE statements and **does not include the newest tables** used by committed code: `event_reviews`, `event_comments`, `event_registrations`, `sauna_managers`. The live Supabase schema is ahead of the repo. There is no `supabase/migrations/` directory.

Tables (from SQL history + code usage):

| Table | Purpose |
|-------|---------|
| `saunas` | Core facility registry; PTS import fields (`pts_id` unique), nullable lat/lng, status |
| `sauna_photos` | Facility gallery |
| `sauna_events` | Events; **has redundant `event_date` timestamptz AND date columns**; text `price` |
| `sauna_reviews` | Facility reviews (rating 1–5 CHECK, optional `user_id`) |
| `sauna_masters` | Master profiles (level, status pending/approved/rejected, `home_sauna_id`) |
| `sauna_event_masters` | Event↔master junction with approval workflow |
| `master_certificates` + `certificate_types` | Certification registry + dictionary (supersedes legacy `master_credentials`) |
| `profiles` | Auth bridge; `role` check: user/moderator/admin; also `first_name`, `last_name`, `email` (live DB, 2026-06-24 — not in repo SQL); auto-created by trigger `on_auth_user_created` → `handle_new_user()`. RLS: SELECT own row + admin; UPDATE own row limited to name columns via column grants; cross-user display names read through the `public_profiles` view (id + names only, definer) — see `supabase/2026-07-11_profiles_name_rls.sql` |
| `user_favorites` | Unique (user_id, sauna_id) |
| `user_event_interests` | Unique (user_id, event_id), status 'going' |
| `sauna_submissions` | User-submitted facilities, admin approval |
| `event_photos` | Event galleries |
| `pts_import_log` | Import audit trail |
| `event_reviews`, `event_comments` | SP-021 — **not in repo SQL history** |
| `event_registrations`, `sauna_managers` | SP-022 — **not in repo SQL history** |

RPC functions: `get_saunas_nearby` (PostGIS ST_DWithin/ST_Distance; aggregates photos, ratings, masters jsonb), `get_sauna_events`, `get_upcoming_events`, `get_upcoming_event_saunas`, `get_top_saunas`, `is_admin()` (SECURITY DEFINER), `handle_new_user()` (SECURITY DEFINER trigger fn), `admin_get_users` + `admin_update_user_role` (SECURITY DEFINER, added commit `803c35a` — not in repo SQL history).

RLS: enabled on all tables. Model: public read for approved content; ownership-based writes for user content (reviews, favorites, interests, submissions); admin/moderator for the rest. **Critical known gap: `sauna_masters` UPDATE policy is `USING (true) WITH CHECK (true)`** — any authenticated user can modify any master (MVP leftover for avatar upload). Inconsistency: `is_admin()` checks only 'admin' while some inline policies include 'moderator'.

Indexes: essentially none beyond PKs and `pts_id` unique — **no FK indexes** (sauna_id, event_id, user_id lookups full-scan).

Storage buckets: `sauna-images` (public read, auth upload), `master-avatars` (auth upload), `event-photos` (used by code).

PostGIS: extension enabled; coordinates stored as plain float8, cast to geography in `get_saunas_nearby`.

Authoritative sources: live Supabase project (primary), `supabase/all_scripts_history.sql` (partial history), `docs/DATABASE.md` + `docs/RLS.md` (**both stale — see §10**).

---

## 6. External Integrations

| Integration | Where | Notes |
|-------------|-------|-------|
| Supabase | whole app | Auth, Postgres+PostGIS, Storage, Realtime (map subscribes to `saunas`, `sauna_photos`) |
| OpenStreetMap tiles | `SaunaMap.tsx` | OSM TileLayer with `detectRetina` |
| PTS (Polskie Towarzystwo Saunowe) | `scripts/importPtsSaunas.ts` | HTML scraping of partner facility pages (regex-based), upsert on `pts_id`; **ToS/permission status unknown** |
| Nominatim (OSM) | `scripts/importPtsSaunas.ts` | Geocoding, 1.2 s rate limit |
| Vercel | assumed hosting | Not confirmed in repo (no vercel.json/vercel.ts); deployment undocumented |
| Payments (Stripe/PayU/Przelewy24) | none yet | Planned SP-024 |

---

## 7. Current Documentation

| Doc | State |
|-----|-------|
| `docs/VISION.md`, `docs/PRODUCT_STRATEGY.md`, `docs/DECISIONS.md` (14 decisions; 011–014 added 2026-07-11: sessions vs events, review eligibility, self-review ban, session-as-atom/event-as-container), `docs/ROADMAP.md` | Current, high quality |
| `docs/USER_MODEL.md` | Authoritative user/persona/ownership/permission model (2026-07-11); reference for all auth/ownership/reservation/marketplace/payment features |
| `docs/EVENT_SESSION_MODEL.md` | Authoritative Event vs Session model (2026-07-11, Decision 014): session = atom, event = container; organizers, map pulse hierarchy, reservations, future payments |
| `docs/PLATFORM_WORKSPACES.md` | Authoritative design reference for Owner/Manager Workspace and Master Studio (2026-07-11): workspace hub, section maps, object-capability matrix, MVP scope, mobile-first workflows |
| `docs/FEATURES.md` | Detailed, mostly current (21 DONE, 8 PLANNED) |
| `docs/BACKLOG.md` | Polish; **stale statuses** (SP-022 says PLANNED though implemented; SP-019 says IN PROGRESS) |
| `docs/KNOWN_ISSUES.md` | Useful map-bug postmortems; **stale**: claims "Authentication: NOT IMPLEMENTED" (SP-011 is DONE) |
| `docs/DATABASE.md` | ~15 lines; missing ~7 tables and newer functions — **severely stale** |
| `docs/RLS.md` | Describes *aspirational* role model (5 roles), not the implemented one (3 roles) |
| `docs/SETUP.md`, `docs/IMPORTS.md`, `docs/SCRIPTS_NOTES.md` | Minimal/changelog-style |
| `docs/AGENT_WORKFLOW.md`, `docs/CLAUDE.md`, `docs/README.md` | Skeletal (4–8 lines each) |
| `CLAUDE.md` (root), `AGENTS.md` | Agent rules — scattered across 4 files |
| `OstatniePostepy.doc` | Binary .doc, unreadable by tooling, content unknown |

Missing entirely: ARCHITECTURE.md (required by Decision 009 but does not exist), deployment guide, testing strategy, RPC reference, production-readiness checklist, i18n strategy, migration process, contribution guide.

---

## 8. Technical Debt

Critical:

1. **Open RLS policy on `sauna_masters` UPDATE** — any authenticated user can modify any master record. Must fix before public launch.
2. **No migration structure** — schema not reproducible from repo; SQL history mixes DDL with destructive test-data statements (TRUNCATE at line ~232, DELETEs/UPDATEs); newest tables (SP-021/022) missing entirely.
3. **No FK indexes, no pagination** — full-table scans on every relation lookup; `/sauny` computes rating averages in memory from full `sauna_reviews` fetch.

High:

4. `SaunaMap.tsx` at 1,352 lines — extreme complexity, regression risk (protected area; decompose carefully per Decision 008).
5. No tests of any kind; no `error.tsx` boundaries; validation client-side only.
6. Duplicated `assertAdmin()` in multiple actions files; middleware checks login only.
7. No shared entity types (`lib/types.ts` missing); category labels defined in 5 places; photo-upload logic tripled; ~6 copy-paste moderation components; repeated modal scaffolding.
8. Legacy `lib/supabase.ts` singleton coexists with `lib/supabase/client.ts` (SaunaMap uses the legacy one).
9. No audit logging for admin actions.

Medium:

10. PWA broken: `public/manifest.webmanifest` has name **"Śmieciarka jedzie"** (copy-pasted from another project); no service worker; icon validity unverified.
11. Redundant `event_date` columns on `sauna_events`; text `price` field (not payment-ready).
12. Accessibility ~3/10: no ARIA labels, no keyboard nav, no focus trap in modals, contrast issues.
13. Realtime subscription cleanup in SaunaMap unverified (potential leak); no debounce on map filters.

---

## 9. Product Debt

1. **Role model gap for marketplace**: docs plan 5–6 roles (incl. sauna manager, master, owner); DB implements 3 (`user/moderator/admin`) plus a `sauna_managers` table. No `owner_id` on `saunas` — private sauna marketplace (SP-025) will force an RLS redesign.
2. **No i18n** despite Decision 010 (European expansion from day one) — all UI strings hardcoded Polish across 36 components; cost grows with every feature.
3. **Payments-readiness gap**: `event_registrations` has no price/transaction linkage; `sauna_events.price` is free text; no transaction/invoice tables (SP-024 blocked until modeled).
4. **Mobile-first claim vs reality**: PWA non-functional, no offline support, desktop-era known issues on mobile UX unresolved.
5. **Reservations missing lifecycle features**: no cancellation deadline, no waiting lists, no notifications (email/push).
6. **Recurring events, event categories, advanced calendar** — Phase 4 remainder, unimplemented.
7. **PTS data dependency** — scraping legality/partnership unconfirmed; no incremental sync (existing `pts_id` rows are skipped, never updated).

---

## 10. Contradictions and Stale Assumptions

| # | Contradiction | Truth |
|---|--------------|-------|
| 1 | KNOWN_ISSUES.md: "Authentication: NOT IMPLEMENTED" | SP-011 DONE; auth fully working |
| 2 | BACKLOG.md: SP-022 "PLANNED" | Implemented (commit `84ac415`) |
| 3 | BACKLOG.md: SP-019 "IN PROGRESS" | Delivered per ROADMAP Phase 3 |
| 4 | RLS.md describes 5-role model as if current | DB has 3 roles + `sauna_managers` table |
| 5 | DATABASE.md table list | Missing ~7 tables and 4+ functions |
| 6 | Decision 009 requires updating ARCHITECTURE.md | File does not exist |
| 7 | manifest.webmanifest: app name "Śmieciarka jedzie" | Wrong project; SaunaPlanet metadata needed |
| 8 | Repo SQL history implies full schema | Live schema is ahead (SP-021/022 tables, admin RPCs absent from file) |

---

## 11. Important Unknowns

1. Is the product publicly deployed with real users/traffic? (Determines urgency of RLS/index fixes.)
2. Where does the authoritative schema live — only in the live Supabase project? Does SQL for SP-021/022 exist anywhere in version control?
3. How is the sauna manager role granted/stored — only via `sauna_managers` table, or was `profiles.role` extended too?
4. Deployment topology: Vercel? Single environment or prod+staging? One Supabase project or separate dev/prod?
5. Contents of `OstatniePostepy.doc`.
6. PTS scraping: is there permission/partnership with Polskie Towarzystwo Saunowe?
7. Priority order among SP-024 (payments), SP-025 (marketplace), SP-030 (native app) — each requires different prep work.
8. i18n timing: before or after Polish market validation?
9. Is PWA (SP-029) a near-term goal (fix manifest + add SW) or deferred?

---

## 12. Authoritative Source File Map

| Area | Authoritative files |
|------|---------------------|
| Product vision/strategy | `docs/VISION.md`, `docs/PRODUCT_STRATEGY.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` |
| Feature status | `docs/FEATURES.md` (primary), `docs/BACKLOG.md` (stale statuses) |
| Agent/dev rules | `CLAUDE.md` (root, primary), `AGENTS.md`, `docs/AGENT_WORKFLOW.md` |
| Map & discovery | `components/SaunaMap.tsx` (protected), `components/SaunyClient.tsx`, `app/page.tsx`, `app/sauny/page.tsx` |
| Sauna detail & reviews | `app/sauna/[id]/page.tsx`, `app/sauna/[id]/reviews/page.tsx`, `components/AddReviewForm.tsx` |
| Events | `app/events/page.tsx`, `app/events/[id]/page.tsx`, `app/events/actions.ts`, `components/events/*`, `components/AddEventModal.tsx`, `EditEventForm.tsx`, `DeleteEventButton.tsx`; owner CRUD: `app/(main)/workspace/events/page.tsx`, `components/workspace/OwnerCreateEventButton.tsx`, `supabase/2026-07-11_sp034_owner_events_rls.sql` |
| Event reviews/comments (SP-021) | `app/events/actions.ts`, `components/EventReviewForm.tsx`, `EventCommentForm.tsx` |
| Reservations (SP-022) | `app/events/actions.ts` (`registerForEvent`, `updateRegistrationStatus`), `components/RegistrationModerationActions.tsx`, `ReservationBadge.tsx`, `lib/reservationTime.ts`, `app/(main)/profile/page.tsx` (manager panel) |
| Masters & certificates | `app/masters/*`, `components/AddMasterModal.tsx`, `AddMasterToSaunaModal.tsx`, `BecomeMasterForm.tsx`, `AddCertificateModal.tsx`, `ManageCertificateTypes.tsx`, `UploadAvatarButton.tsx` |
| Favorites/interests (SP-020) | `app/(main)/profile/actions.ts`, `app/(main)/profile/page.tsx` |
| Admin panel | `app/(main)/admin/page.tsx`, `app/(main)/admin/actions.ts`, `components/*ModerationActions.tsx`, `UserRoleSelector.tsx`, `EditSaunaAdminForm.tsx` |
| Auth & roles | `app/(main)/auth/*`, `components/AuthProvider.tsx`, `lib/supabase/server.ts` (`getCurrentUserRole`), `proxy.ts` |
| Supabase clients | `lib/supabase/client.ts`, `lib/supabase/server.ts` (`lib/supabase.ts` is legacy) |
| Database schema | live Supabase project (primary); `supabase/all_scripts_history.sql` (partial, untracked); `docs/DATABASE.md` + `docs/RLS.md` (stale) |
| Data import | `scripts/importPtsSaunas.ts`, `scripts/seedSaunas.ts`, `docs/IMPORTS.md` |
| Submission workflow | `app/(main)/submit/page.tsx`, `components/SubmitSaunaForm.tsx`, `SubmissionActions.tsx` |
| PWA/mobile | `public/manifest.webmanifest` (broken metadata), `app/layout.tsx`, `app/icon.tsx` |
| Config | `next.config.ts`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs` |
