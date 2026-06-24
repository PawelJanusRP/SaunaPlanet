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

# SP-020 Sauna Master Ratings (BACKLOG)

Status: PLANNED

Description:

Rating system for sauna masters derived from aggregate ratings of events
in which they participate — no separate review form needed.

Design considerations:

* master rating = weighted average of event ratings where the master is assigned
* event rating = average of all sauna reviews submitted for events at the linked sauna
  (or dedicated event_ratings table if introduced in the future)
* master profile page displays computed rating and contributing event count
* masters list page can be sorted by rating
* rating visible as satellite ring intensity or badge on map

Open questions:

* source of truth: reuse sauna_reviews or introduce event_ratings table?
* weighting: equal weight per event or weighted by recency?
* minimum threshold: require N events before displaying rating?

Dependencies:

* SP-001 (events)
* SP-004 (sauna masters)
* SP-002 (reviews)

See also: SP-016 (affiliations), Phase 7 (Verification and Authority)

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

Planned:

* Bookings
* Payments
* Private Saunas
* Verification
* Recurring events
* Sauna master affiliations (SP-016)
* Sauna master ratings from event aggregation (SP-020)
