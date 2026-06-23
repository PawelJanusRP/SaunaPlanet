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

Sauna master avatar satellites are displayed around sauna markers.

Requirements:

* approved assignment
* future active event

Current behavior:

* only masters assigned to future events are displayed
* satellite ring color depends on master level

Levels:

* master = gold
* senior = purple
* certified = blue
* guest = gray

Important:

This functionality was recently fixed.

Do not redesign or replace without explicit request.

---

# Event Visibility

Status: Needs Review

Observed issue:

Historical events may still appear on sauna detail pages.

Expected behavior:

Past events should either:

* be hidden
* or appear in a dedicated history section

Review before implementing changes.

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
