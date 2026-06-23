# Known Issues

This document describes known issues, technical limitations and important implementation notes.

These items should be reviewed before modifying existing functionality.

---

# Critical Rule

Do not redesign or replace working functionality unless explicitly requested.

Many systems were implemented incrementally and have already been debugged.

---

# Sauna Master Satellite System

Status: Working

Description:

Sauna master avatar satellites are displayed around sauna markers in an orbital layout.

Requirements:

* approved assignment
* future active event
* avatar_url set on sauna_masters record

Current behavior:

* all masters with avatar_url are shown (no limit)
* satellites orbit the main marker in a 300° arc (from SSW to SSE through top)
* bottom area reserved for rating badge
* satellite ring color depends on master level

Levels:

* master = gold
* senior = purple
* certified = blue
* guest = gray

Important:

This functionality was recently refactored. Do not redesign or replace without explicit request.

---

# Event Visibility

Status: Fixed

Fix applied:

* sauna detail page (`app/sauna/[id]/page.tsx`) now filters events with `event_date >= today`
* only current and future events are displayed
* sorted ascending by event_date

Note:

RPC `get_sauna_events` (used in map popup) may still return past events.
That RPC should be updated separately in Supabase Dashboard.

---

# Authentication

Status: Not Implemented

Current application operates without a full authentication layer.

Planned:

* Supabase Auth
* user accounts
* role management

Important:

Future implementations should not require major database redesign.

---

# Authorization

Status: MVP

Current state includes temporary development policies.

Important:

Current policies are not suitable for public production deployment.

Before launch:

* implement proper RLS
* implement ownership validation
* implement role-based permissions

---

# Supabase RLS

Status: Temporary

Known technical debt:

Development-friendly policies were used during MVP development.

These policies must be reviewed before public release.

---

# PTS Import

Status: Operational

Description:

Sauna facilities imported from PTS sources.

Known historical issues:

* missing coordinates
* duplicate detection
* import logging
* RLS restrictions during import

Related table:

pts_import_log

Important:

Preserve import compatibility when modifying sauna-related schema.

---

# Reviews

Status: Working

Implemented:

* reviews
* average ratings
* rankings

Future work:

* moderation
* abuse prevention
* verification

---

# Event System

Status: Working

Implemented:

* add event
* event listing
* event calendar
* upcoming event views

Future improvements should preserve existing workflows.

---

# Map Performance

Status: Acceptable

Current features:

* clustering
* event markers
* satellite markers
* filters

Important:

Map performance is critical.

Avoid solutions that require excessive client-side rendering.

---

# Database Compatibility

Important Rule

Avoid unnecessary schema redesigns.

Preferred approach:

* additive migrations
* backward compatibility
* incremental evolution

Avoid:

* dropping tables
* renaming major entities
* destructive migrations

unless explicitly requested.

---

# Mobile Experience

Status: Requires Future Review

Current focus has been desktop functionality.

Future work:

* responsive improvements
* mobile UX
* touch interactions

---

# Future Risks

Potential complexity areas:

* bookings
* payments
* subscriptions
* verification workflows
* role-based permissions

When implementing these features:

* prefer simple solutions
* avoid premature optimization
* preserve maintainability

---

# Architecture Principle

SaunaPlanet is evolving toward an ecosystem:

Facilities
→ Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings

Changes that strengthen this ecosystem are generally preferred.

Changes that move the platform toward a simple sauna directory should be avoided.

---

# Legacy Item Code in Sauna Forms

Status: Fixed

Both components have been rewritten to use correct SaunaPlanet database objects.

---

## components/AddSaunaForm.tsx

Fixed:

* inserts into `saunas` table
* inserts into `sauna_photos` table
* uploads to `sauna-images` bucket
* legacy fields removed

---

## components/EditSaunaModal.tsx

Fixed:

* uses correct sauna update logic
* UI messages updated to sauna terminology
