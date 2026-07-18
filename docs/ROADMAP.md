# SaunaPlanet Roadmap

This document describes the planned evolution of SaunaPlanet.

The roadmap reflects current priorities and may evolve over time.

---

# Phase 1 - Foundation

Status: COMPLETED

Goal:

Create the core SaunaPlanet platform.

Delivered:

* Sauna map
* Sauna details page
* Events
* Reviews
* Rankings
* Sauna masters
* Certifications
* Satellite avatars
* Project documentation

Milestones:

* SP-001
* SP-002
* SP-003
* SP-004
* SP-005
* SP-006

---

# Phase 2 - Accounts and Security

Status: COMPLETED

Goal:

Introduce authenticated users and secure access control.

Features:

* registration
* login
* password reset
* user profiles
* Supabase Auth
* RLS redesign
* role management

Expected roles:

* user
* sauna manager
* sauna master
* moderator
* administrator

Success criteria:

Users can create accounts and securely interact with platform content.

---

# Phase 3 - Administration

Status: COMPLETED

Goal:

Provide management tools.

Delivered:

* admin dashboard (SP-012, SP-015, SP-017)
* sauna submission workflow
* sauna master moderation (pending / approved / rejected)
* certificate moderation and dictionary management (SP-017)
* event detail page with inline admin editing (SP-018)
* event photos management (SP-018)
* sauna list page with thumbnails, ratings, city filter (SP-019)
* admin users tab: name/email display, role assignment (SP-012 enhancement)
* facility management (edit/delete from admin panel) — SP-019
* event moderation (approve/reject events) — SP-019
* review moderation — SP-019

Success criteria:

Most content can be managed without direct database access.

---

# Phase 4 - Event Platform

Status: IN PROGRESS

Goal:

Transform events into first-class platform objects.

Delivered:

* user event interests — "Idę" toggle with going count (SP-020)
* post-event star ratings + pre-event comments (SP-021)
* historical sauna rating from past events shown on event page (SP-021)
* sauna event reviews listing page /sauna/[id]/reviews (SP-021)

Delivered (Workspace track, 2026-07):

* shared Workspace infrastructure — shell, hub, navigation (SP-031)
* Personal Workspace at /profile (SP-032)
* Owner Workspace at /workspace with active facility context (SP-033)
* owner event management from the Owner Workspace (SP-034)

Remaining:

* **Master Studio Foundation (SP-035)** — Master Workspace on the shared
  shell; Sauna Master profile; profile integrity fixes (own-profile-only
  editing, unique user↔profile link); the **affiliation model** (formerly
  SP-016, Decision 016) replacing the home-sauna concept as the primary
  model
* **Sauna Sessions (SP-036)** — Sessions as a first-class entity independent
  from Events (Facility ↔ Event ↔ Session ↔ Sauna Master; an Event may
  contain many Sessions; a Session happens at exactly one facility and may
  have one or more masters — session ↔ master is many-to-many, lead
  conductor required — see docs/EVENT_SESSION_MODEL.md §3)
* recurring events
* advanced calendar
* waiting lists and reservation lifecycle completion (cancellation
  deadlines, notifications)
* event categories and filtering
* sauna and master rankings derived from event reviews (SP-023)

Success criteria:

Users can discover and manage events efficiently; facilities and masters
operate self-service through their workspaces.

---

# Phase 5 - Bookings

Status: PLANNED

Goal:

Allow reservations through SaunaPlanet.

Features:

* event reservations
* booking confirmations
* cancellation support
* booking history

Success criteria:

Users can reserve participation without contacting facilities directly.

---

# Phase 6 - Payments

Status: PLANNED

Goal:

Support financial transactions.

Features:

* event payments
* booking payments
* subscription payments

Potential integrations:

* Stripe
* PayU
* Przelewy24

Success criteria:

Users can complete transactions entirely within SaunaPlanet.

---

# Phase 7 - Verification and Authority

Status: PLANNED

Goal:

Increase trust and quality.

Features:

* sauna master verification
* facility verification
* certification validation
* authority system
* trust badges

Success criteria:

Users can easily identify trusted facilities and professionals.

---

# Phase 8 - Private Sauna Ecosystem

Status: PLANNED

Goal:

Open the platform to private sauna owners.

Features:

* private garden saunas
* home saunas
* reservations
* availability calendars
* payments
* reviews

Strategic value:

Major differentiator compared to traditional sauna directories.

---

# Phase 9 - Premium Platform

Status: PLANNED

Goal:

Introduce monetization.

Features:

* subscriptions
* premium search
* advanced filters
* event alerts
* favorite master tracking

Success criteria:

Platform generates recurring revenue.

---

# Phase 10 - International Expansion

Status: FUTURE

Target countries:

* Germany
* Czech Republic
* Slovakia
* Finland
* Sweden
* Norway
* Estonia
* Latvia
* Lithuania

Goal:

Become the leading sauna platform in Europe.

---

# Product Priorities

Highest priority:

1. Authentication
2. Roles and permissions
3. Admin panel
4. Event management improvements

Medium priority:

5. Bookings
6. Payments
7. Verification

Long-term priority:

8. Private sauna ecosystem
9. International expansion

---

# Platform Operations (future infrastructure sprints)

**SP-040 — Architecture, Performance & Scalability Review** (full scope:
docs/BACKLOG.md) — a comprehensive, evidence-based technical review
(database, map at 10x/100x datasets, images, frontend, Next.js
architecture, network, realtime, mobile readiness, cost modeling at
100→100k users, security, SEO, accessibility) to run **before significant
user growth and before the native mobile app (SP-030)**. Review only — the
deliverable is a P1–P4 optimization roadmap, with nothing implemented
during the sprint itself.

**SP-041 — Platform Capacity & System Health Dashboard** (full scope:
docs/BACKLOG.md) — a privileged `/admin/system` section fed by a scheduled
collector writing `system_metrics_snapshots` (never direct browser calls to
infrastructure providers): platform health, database/storage capacity and
growth forecasts, traffic, product metrics, configurable alert thresholds
(60% Watch / 75% Warning / 90% Critical). Recorded 2026-07-18 so proactive
capacity planning is not forgotten before production growth demands it.

---

# Mobile Roadmap

SaunaPlanet is a mobile-first product. The mobile strategy runs in parallel with the main platform phases.

## Short-term (PWA / Responsive)

* improve responsive web experience on mobile
* optimize map interaction on mobile
* support camera-based photo uploads
* support location-based sauna discovery

## Medium-term (PWA+)

* make SaunaPlanet installable as a PWA
* improve offline / poor-network behavior
* add push notifications for events and favourite sauna masters

## Long-term (Native App)

* build native mobile app using React Native / Expo
* reuse Supabase backend
* reuse product model: Sauna → Event → Sauna Master

---

# Guiding Principle

SaunaPlanet should evolve from:

Sauna Directory

into

Sauna Ecosystem

connecting:

Facilities
→ Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings
→ Community
