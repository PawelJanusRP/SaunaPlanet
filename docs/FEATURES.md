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

# Roles and Permissions

Status: PLANNED

Future scope:

* user
* sauna manager
* sauna master
* moderator
* administrator

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

# Verification Workflow

Status: PLANNED

Future scope:

* sauna master verification
* facility verification
* badges
* authority system

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

Planned:

* Authentication
* Accounts
* Roles
* Admin Panel
* Bookings
* Payments
* Private Saunas
* Verification
