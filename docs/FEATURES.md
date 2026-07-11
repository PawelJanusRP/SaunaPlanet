# SaunaPlanet Features

This document tracks implemented functionality.

Status values:

* DONE
* IN PROGRESS
* PLANNED

---

# SP-001 Sauna Events

Status: DONE

Implemented:

* event creation
* event list
* event popup
* upcoming events
* event calendar page
* event highlighting on map

Related database objects:

* sauna_events
* get_sauna_events()
* get_upcoming_events()
* get_upcoming_event_saunas()

---

# SP-002 Reviews and Rankings

Status: DONE

Implemented:

* add review
* rating average
* ranking calculation

Related database objects:

* sauna_reviews
* get_top_saunas()

---

# SP-003 Sauna Details

Status: DONE

Route:

/sauna/[id]

Implemented:

* sauna profile page
* photos
* ratings
* reviews
* events
* assigned sauna masters

---

# SP-004 Sauna Masters

Status: DONE

Route:

/masters/[id]

Implemented:

* sauna master profiles
* certifications
* credentials
* event assignments

Related database objects:

* sauna_masters
* master_credentials
* sauna_event_masters

---

# SP-005 Sauna Master Satellites

Status: DONE

Implemented:

* avatar satellites around sauna markers
* level color rings
* future-event visibility logic

Level colors:

* master = gold
* senior = purple
* certified = blue
* guest = gray

Important:

Visible only for approved future event assignments.

---

# SP-006 Project Documentation

Status: DONE

Implemented:

* CLAUDE.md
* Architecture documentation
* Database documentation
* Workflow documentation
* Setup documentation
* Backlog documentation

---

# SP-007 Sauna Master Avatar Upload

Status: DONE

Implemented:

* avatar upload from sauna master profile page
* file stored in Supabase Storage bucket `master-avatars`
* sauna_masters.avatar_url updated after upload
* avatar visible on master profile and as map satellite

Related components:

* components/UploadAvatarButton.tsx
* app/masters/[id]/page.tsx

Related database objects:

* sauna_masters (avatar_url)
* Storage: master-avatars

---

# SP-008 Event and Sauna Master Display Improvements

Status: DONE

Implemented:

* sauna detail page shows only current and future events (date filter)
* each event shows its assigned sauna masters (avatar, name, level)
* sauna master satellites orbit the map marker in a 300° arc
* all masters with avatar shown (no limit)
* add sauna master from sauna detail page (new profile or assign existing)

Related components:

* app/sauna/[id]/page.tsx
* components/SaunaMap.tsx
* components/AddMasterToSaunaModal.tsx

---

# SP-010 Edit Sauna Master Profile

Status: DONE

Implemented:

* edit button on sauna master profile page
* editable fields: name, level, bio
* modal form pre-filled with current values
* saves to sauna_masters via UPDATE
* page refreshes after save

Related components:

* components/EditSaunaMasterModal.tsx
* app/masters/[id]/page.tsx

---

# SP-009 Clickable Satellite Avatars

Status: DONE

Implemented:

* each satellite avatar on the map links to the sauna master profile page
* clicking a satellite navigates to /masters/[id]
* click does not open the sauna popup (stopPropagation)

Related components:

* components/SaunaMap.tsx

---

# SP-011 Authentication

Status: DONE

Route:

* /auth/login
* /auth/register
* /auth/reset-password
* /auth/update-password
* /profile

Implemented:

* email + password registration
* email confirmation flow
* login / logout
* password reset via email
* password update page
* user profile page (server-side auth guard)
* Navbar with auth state (logged in / logged out)
* AuthProvider context for client components
* Supabase SSR client (browser + server)
* Next.js proxy (session refresh on every request)

Related files:

* lib/supabase/client.ts
* lib/supabase/server.ts
* proxy.ts
* components/AuthProvider.tsx
* components/Navbar.tsx
* app/(main)/layout.tsx
* app/(main)/auth/*
* app/(main)/profile/page.tsx

---

# User Accounts

Status: PLANNED

Future scope:

* extended user profiles
* favorites
* event history

---

# SP-012 Roles and Permissions

Status: DONE

Implemented:

* profiles table in Supabase (id, role, created_at)
* roles: user, moderator, admin
* trigger: auto-create profile on registration
* RLS: user sees own profile, admin sees all
* getCurrentUserRole() server helper
* role exposed in AuthProvider context (client-side)
* Navbar shows Admin link for admin/moderator
* /profile page displays role badge
* /admin page — protected, redirects non-admin
* proxy.ts enforces /admin access at middleware level

Related database objects:

* profiles
* handle_new_user() trigger
* on_auth_user_created trigger

Related files:

* lib/supabase/server.ts (getCurrentUserRole)
* components/AuthProvider.tsx (role in context)
* components/Navbar.tsx (Admin link)
* app/(main)/profile/page.tsx
* app/(main)/admin/page.tsx
* proxy.ts

---

# Admin Panel

Status: PLANNED

Future scope:

* sauna management
* event management
* moderation

---

# Event Booking

Status: PLANNED

Future scope:

* reservations
* attendance limits
* waiting lists

---

# Payments

Status: PLANNED

Future scope:

* event payments
* bookings
* subscriptions

---

# Private Garden Saunas

Status: PLANNED

Future scope:

* private sauna listings
* reservations
* payments
* reviews

This is considered a strategic differentiator for SaunaPlanet.

---

# SP-015 Sauna Master Registration Workflow

Status: DONE

Branch: feature/SP-015-master-registration

Scope:

* Ścieżka 1: Admin creates master profile from /masters page (standalone, no event required)
* Ścieżka 2: Authenticated user submits "Zostań saunamistrzem" self-registration form (pending → admin approves)
* Ścieżka 3: Existing flow from sauna detail page (preserved unchanged)
* Schema: home_sauna_id added to sauna_masters (primary sauna without event dependency)
* Schema: status field added to sauna_masters (pending / approved / rejected)
* /masters page grouping updated to use home_sauna_id (replaces event-derived grouping)
* Admin panel: review and approve pending master profiles

Related database objects:

* sauna_masters (home_sauna_id, status)
* RLS policies update

---

# SP-017 Certificate System

Status: DONE

Branch: feature/SP-017-certificates

Scope:

* certificate_types dictionary table managed by admin
* master_certificates table with moderation workflow (pending/approved/rejected)
* Seed: 23 certificate types across 7 categories (certifications, PL championship, Battle of Gladiators, Aufguss WM, Modern Classic Cup, cups, other)
* "Inny certyfikat" with free-text field stored in notes
* AddCertificateModal on master profile (admin → approved, user → pending)
* Master profile: certificates grouped by category, pending visible to admin only
* Admin panel: "Certyfikaty" tab for pending moderation (approve/reject)
* Admin panel: "Słownik certyfikatów" tab for CRUD on certificate_types
* master_credentials table preserved (backward compat)

Related database objects:

* certificate_types
* master_certificates
* RLS policies on both tables

---

# SP-018 Event Detail Page

Status: DONE

Route:

/events/[id]

Scope:

* dedicated event page with full event info (title, date, time, price, description)
* linked sauna displayed with navigation to /sauna/[id]
* assigned sauna masters with avatars, roles, links to /masters/[id]
* admin/moderator: inline event editing (EditEventForm)
* admin/moderator: add sauna master to event (AddEventMasterForm)
* admin/moderator: remove sauna master from event (RemoveEventMasterButton)
* event photos gallery (event_photos table, event-photos storage bucket)
* admin/moderator: upload event photos (UploadEventPhotoButton)
* navigation to /events/[id] from: map popup, map sidebar, events calendar, sauna detail page

Related components:

* app/events/[id]/page.tsx (server component)
* app/events/actions.ts (server actions: updateEvent, removeEventMaster)
* components/EditEventForm.tsx
* components/AddEventMasterForm.tsx
* components/RemoveEventMasterButton.tsx
* components/UploadEventPhotoButton.tsx

Related database objects:

* sauna_events
* sauna_event_masters
* event_photos
* Storage: event-photos (public bucket)

---

# SP-016 Sauna Master Affiliations (BACKLOG)

Status: PLANNED

Description:

Replace home_sauna_id single-column approach with a dedicated affiliations table.
Enables masters to be formally associated with multiple sauna facilities with role/status per affiliation.

Proposed schema:

```sql
CREATE TABLE sauna_master_affiliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id UUID NOT NULL REFERENCES sauna_masters(id) ON DELETE CASCADE,
  sauna_id UUID NOT NULL REFERENCES saunas(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  role TEXT DEFAULT 'resident',
  status TEXT DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(master_id, sauna_id)
);
```

Migration note:

Migrate existing home_sauna_id values into this table when implementing.

---

# Verification Workflow

Status: PLANNED

Future scope:

* sauna master verification
* facility verification
* badges
* authority system

---

# SP-019 Sauny Page

Status: DONE

Route:

/sauny

Implemented:

* full sauna list page accessible from burger menu
* thumbnail (first photo from sauna_photos, fallback to cover_image_url)
* average star rating and review count per sauna
* saunas grouped by city with section headers
* city dropdown filter — selecting a city limits list to that city only
* sauna count updates dynamically with active filter

Related components:

* app/sauny/page.tsx (server component — data fetching)
* components/SaunyClient.tsx (client component — filtering logic)

Related database objects:

* saunas
* sauna_photos
* sauna_reviews

---

# SP-020 User Favorites and Event Interests

Status: DONE

Implemented:

* logged-in user can mark a sauna as favourite (toggle button on /sauna/[id])
* logged-in user can mark an event as "Idę" (toggle button on /events/[id])
* /profile page shows: favourite saunas with thumbnail, upcoming events the user is going to
* thumbnail resolved from sauna_photos (Supabase-hosted), falls back to cover_image_url
* going count displayed on event page with correct Polish plural forms
* schema compatible with future reservations (status field on user_event_interests)

Related database objects:

* user_favorites (user_id, sauna_id, created_at)
* user_event_interests (user_id, event_id, status, created_at)

Related files:

* app/(main)/profile/actions.ts (toggleFavoriteSauna, toggleEventInterest)
* app/(main)/profile/page.tsx
* app/sauna/[id]/page.tsx
* app/events/[id]/page.tsx

---

# SP-021 Event Reviews and Comments

Status: DONE

Implemented:

**Post-event reviews:**

* logged-in user can rate a past event (1–5 stars) + optional text comment
* review form visible only when event_date < today
* one review per user per event (enforced by UNIQUE constraint)
* average rating shown in event header
* EventReviewForm: fixed-width star buttons (opacity toggle) — no layout shift on hover

**Pre-event comments:**

* logged-in user can add a text comment to a future event (no stars)
* comment form visible only when event_date >= today
* comments visible to all; author + date shown

**Historical sauna rating:**

* on upcoming event page: aggregate rating of past events at the same sauna
* displayed as a clickable badge linking to /sauna/[id]/reviews

**Sauna reviews listing page:**

* /sauna/[id]/reviews — all reviews from past events at a sauna
* sorted by event date descending
* each card shows: event name (link to /events/[id]), date, star rating, comment, author

**Delete:**

* author or admin/moderator can delete own review or comment

Related database objects:

* event_reviews (id, event_id, user_id, rating INT 1-5, comment TEXT, created_at)
* event_comments (id, event_id, user_id, comment TEXT, created_at)

Related files:

* app/events/actions.ts (addEventReview, deleteEventReview, addEventComment, deleteEventComment)
* app/events/[id]/page.tsx
* app/sauna/[id]/reviews/page.tsx
* components/EventReviewForm.tsx
* components/EventCommentForm.tsx

---

# SP-031 Shared Workspace Infrastructure

Status: DONE

Implemented:

* reusable Workspace Shell (breadcrumbs, header with title/subtitle/context/actions, shared navigation, Today-queue slot, content area)
* single navigation definition rendered in two responsive variants: horizontal chips (mobile) and sidebar (desktop)
* workspace hub in the avatar menu (Navbar): Profile → Owner Workspace → Master Studio → Admin, driven by configuration
* WorkspaceAccess snapshot in AuthProvider: global role + approved sauna_managers membership + linked sauna_masters profile (navigation visibility only — enforcement stays in RLS/server actions)
* Owner Workspace and Master Studio registered as `planned` destinations (never rendered as links until their routes exist)
* no new authorization model — visibility derives from the existing role model only

Related files:

* components/workspace/WorkspaceShell.tsx
* components/workspace/WorkspaceNav.tsx
* components/workspace/WorkspaceBreadcrumbs.tsx
* components/workspace/TodayQueue.tsx
* components/workspace/AvatarMenu.tsx
* lib/workspace/types.ts
* lib/workspace/destinations.ts
* components/AuthProvider.tsx
* components/Navbar.tsx

See docs/PLATFORM_WORKSPACES.md for the design reference.

---

# SP-032 Personal Workspace Foundation

Status: DONE

Implemented:

* Personal Workspace (/profile) rebuilt on the shared Workspace Shell — reference implementation for Owner Workspace and Master Studio
* configuration-driven navigation (lib/workspace/personal.ts): Pulpit, Profil, Ulubione, Recenzje, Wydarzenia, Ustawienia
* Personal Dashboard (/profile): welcome header, Today queue, upcoming events, favourites preview, recent activity (own reviews); manager-oriented sections (pending registrations queue, managed saunas) moved to the Owner Workspace in SP-033
* /profile/details — name editing (existing EditProfileNameForm) + planned identity fields (avatar, bio, location, languages, public profile) rendered as consistent "coming soon" rows, never as fake data
* /profile/favorites — full favourites list with thumbnails
* /profile/reviews — own sauna reviews and event reviews
* /profile/events — own reservations with status + followed ("Idę") events
* /profile/settings — account data, role badge, password change (existing ChangePasswordForm), notifications placeholder
* consistent empty states via WorkspaceEmptyState; reusable dashboard sections via WorkspaceSection

Related files:

* app/(main)/profile/page.tsx
* app/(main)/profile/details/page.tsx
* app/(main)/profile/favorites/page.tsx
* app/(main)/profile/reviews/page.tsx
* app/(main)/profile/events/page.tsx
* app/(main)/profile/settings/page.tsx
* components/workspace/WorkspaceSection.tsx
* components/workspace/WorkspaceEmptyState.tsx
* lib/workspace/personal.ts

---

# SP-033 Owner Workspace Foundation

Status: DONE

Implemented:

* Owner Workspace ("Panel obiektu") at /workspace on the shared Workspace Shell — first business workspace, validates the multi-workspace architecture
* configuration-driven navigation (lib/workspace/owner.ts): Pulpit, Rezerwacje, Wydarzenia — one definition for mobile chips and desktop sidebar
* generic active-context model (lib/workspace/context.ts): "All facilities" aggregate or a single facility, carried in the `context` query param; unknown/foreign ids fall back to the aggregate; reusable for future workspace types
* WorkspaceContextSwitcher — generic client control that rewrites the context param on the current pathname (shown only with 2+ approved facilities)
* server-side scope resolution (lib/workspace/ownerServer.ts): one place answering "which facilities does this account operate and which are in scope" — every /workspace page consumes the resolved scope, no per-module filters
* Owner Dashboard (/workspace): Today queue (pending event registrations, migrated from the personal dashboard), managed facilities with membership status, upcoming events, quick actions
* /workspace/reservations — pending registration moderation (existing RegistrationModerationActions) + recently resolved registrations
* /workspace/events — upcoming and past events of the facilities in scope
* Personal Workspace cleanup: manager queue and managed-sauna list removed from /profile; personal Today queue now shows the user's own events today; managers see a link card to the Owner Workspace
* avatar-menu hub destination `owner-workspace` switched from `planned` to `available` (visible with approved sauna_managers membership, as configured in SP-031)
* no new authorization model — data access unchanged (RLS + explicit user_id filters + existing server actions)

Related files:

* app/(main)/workspace/page.tsx
* app/(main)/workspace/reservations/page.tsx
* app/(main)/workspace/events/page.tsx
* components/workspace/WorkspaceContextSwitcher.tsx
* lib/workspace/context.ts
* lib/workspace/owner.ts
* lib/workspace/ownerServer.ts
* lib/workspace/destinations.ts
* app/(main)/profile/page.tsx
* app/events/actions.ts

See docs/PLATFORM_WORKSPACES.md §4 for the design reference.

---

# SP-034 Owner Event Management

Status: DONE

Implemented:

* owners/managers create, edit and delete events of their own facilities from /workspace/events — the platform no longer requires admin data entry for facility events (USER_MODEL §6.8)
* event creation requires a concrete facility: the selected context, or the account's only facility; in the "All facilities" aggregate with 2+ facilities the page explains that a specific facility must be selected — no create action is offered
* server actions createEvent / updateEvent / deleteEvent (app/events/actions.ts) authorize as "admin/moderator OR approved sauna_managers member of the event's facility"; WorkspaceContext is presentation-only and never used for authorization
* RLS extension (supabase/2026-07-11_sp034_owner_events_rls.sql, run manually): is_sauna_staff() helper + additive INSERT/UPDATE/DELETE policies on sauna_events for approved facility staff; existing admin policies unchanged
* updateEvent/deleteEvent detect an RLS mismatch (0 affected rows) and report it as an authorization error instead of silently succeeding
* AddEventModal switched from a direct client-side insert to the createEvent server action — one creation path for the admin map flow and the Owner Workspace; gains a max_participants field
* EditEventForm gains a max_participants field (existing SP-022 column driving reservation capacity); reused unchanged on /events/[id] and per event row in /workspace/events
* past events stay read-only in the workspace (reviews history; "cancel, not delete" semantics per PLATFORM_WORKSPACES §6 remain future work)

Related files:

* app/(main)/workspace/events/page.tsx
* app/events/actions.ts
* components/AddEventModal.tsx
* components/EditEventForm.tsx
* components/DeleteEventButton.tsx
* components/workspace/OwnerCreateEventButton.tsx
* supabase/2026-07-11_sp034_owner_events_rls.sql

---

# SP-023 Sauna and Sauna Master Rankings (BACKLOG)

Status: PLANNED

Description:

Ranking system for saunas and sauna masters based on aggregated event reviews.

Design considerations:

* sauna ranking: average of sauna_reviews + event_reviews for events at that sauna
* sauna master ranking: weighted average of event_reviews for events where master is assigned
* dedicated /ranking page or section on map
* badges: Top 10, Best Master of the Month
* master profile page displays computed rating and contributing event count
* rating visible as satellite ring intensity or badge on map

Open questions:

* weighting: equal per event or weighted by recency?
* minimum threshold: require N events before displaying rating?

Dependencies:

* SP-001 (events), SP-002 (reviews), SP-004 (masters), SP-021 (event reviews)

See also: SP-016 (affiliations), SP-027 (rating parameters)

---

# SP-027 Rating Parameters Admin Panel (BACKLOG)

Status: PLANNED

Description:

Admin panel section for configuring parameters used in the sauna master
rating algorithm (SP-023) and potentially other platform ranking formulas.
Allows tuning without code changes or direct database access.

Proposed parameters:

* recency decay factor — how much older events are discounted (e.g. half-life in days)
* minimum event threshold — minimum number of events before a rating is published
* event weight source — toggle between sauna_reviews vs. event_reviews as input
* rating visibility threshold — minimum computed score to display publicly
* satellite intensity scale — min/max rating values mapped to visual ring intensity

Proposed implementation:

* platform_settings table: key-value store (key TEXT, value JSONB, updated_at, updated_by)
* RLS: readable by all authenticated users, writable by admin only
* admin panel "Parametry rankingu" tab — form rendered from settings schema
* rating computation reads from platform_settings at query time (no hardcoded constants)

Proposed schema:

```sql
CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
```

Dependencies:

* SP-023 (rankings — defines which parameters are needed)
* SP-012 (roles — admin-only write access)

See also: SP-023

---

# Feature Summary

Completed:

* Sauna Map
* Sauna Details
* Events
* Reviews
* Rankings
* Sauna Masters
* Satellites
* Documentation
* Authentication
* Roles and permissions
* Admin panel (submissions + users + master moderation)
* Sauna master registration workflow (SP-015)
* Certificate system with dictionary and moderation (SP-017)
* Event detail page with masters, photos, inline editing (SP-018)
* Sauny list page with thumbnails, ratings, city filter (SP-019)
* User favorites and event interests — /profile (SP-020)
* Event reviews (post-event) + comments (pre-event) + sauna reviews page (SP-021)
* Shared Workspace infrastructure — shell, hub, config-driven navigation (SP-031)
* Personal Workspace — dashboard + profile modules on the shared shell (SP-032)
* Owner Workspace — facility context, dashboard, reservations, events (SP-033)
* Owner event management — create/edit/delete from the Owner Workspace (SP-034)

Planned:

* Bookings (SP-022)
* Payments (SP-024)
* Private Saunas (SP-025)
* Verification
* Recurring events
* Sauna master affiliations (SP-016, SP-026)
* Sauna and master rankings (SP-023)
* Rating parameters admin panel (SP-027)
* Native Mobile App — Expo, 3 phases: Architecture → Android → iOS (SP-030)
