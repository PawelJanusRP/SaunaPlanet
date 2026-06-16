# CLAUDE.md

# SaunaPlanet

You are working on SaunaPlanet.

Before making any changes, read:

- docs/ARCHITECTURE.md
- docs/DATABASE.md
- docs/VISION.md
- docs/BACKLOG.md
- docs/KNOWN_ISSUES.md
- docs/AGENT_WORKFLOW.md

---

# Project Mission

SaunaPlanet is building a sauna ecosystem rather than a simple sauna directory.

Core entities:

* Sauna Facilities
* Sauna Events
* Sauna Masters
* Certifications
* Reviews
* Rankings

The platform should help users discover:

* where to go
* which events are available
* who conducts them
* what certifications they hold

before visiting a sauna facility.

---

# Current State

The project is already functional.

Implemented:

* sauna map
* event system
* reviews
* rankings
* sauna masters
* master certifications
* avatar satellites on map markers

The project is no longer in prototype stage.

Avoid unnecessary rewrites.

---

# Important Rules

## Rule 1

Do not redesign working functionality unless explicitly requested.

---

## Rule 2

Prefer small focused commits.

---

## Rule 3

Do not modify database schema unless necessary.

If schema changes are required:

* create migration
* explain purpose
* preserve existing data

---

## Rule 4

Do not remove existing features.

---

## Rule 5

Authentication and authorization should be designed with future scalability in mind.

---

## Rule 6

Sauna Masters are first-class entities.

Do not model them as simple event attributes.

---

# Git Workflow

Never commit directly to main.

Always create feature branches.

Examples:

feature/authentication

feature/admin-panel

feature/roles

feature/bookings

feature/payments

feature/master-verification

feature/subscriptions

---

# Code Standards

Requirements:

* TypeScript
* Strong typing
* Reusable React components
* Clear naming
* Avoid duplicated logic

Prefer:

* server actions
* reusable hooks
* reusable components

---

# UI Principles

The map is the heart of the application.

Do not break:

* clustering
* event markers
* sauna master satellites

Map performance is critical.

---

# Database Principles

Current main tables:

* saunas
* sauna_photos
* sauna_events
* sauna_reviews
* sauna_masters
* master_credentials
* sauna_event_masters
* pts_import_log

Use existing structures whenever possible.

---

# Long-Term Vision

Target platform:

Sauna Facilities
+
Sauna Events
+
Sauna Masters
+
Certifications
+
Rankings

Future features:

* bookings
* payments
* subscriptions
* private garden saunas
* verification workflows

Every major feature should support this vision.

---

# Development Approach

When implementing new functionality:

1. Analyze existing code first.
2. Reuse existing components.
3. Minimize breaking changes.
4. Explain architectural decisions.
5. Keep solutions simple.
6. Prefer maintainability over cleverness.

---

# Success Criteria

A successful change:

* compiles
* passes linting
* preserves existing functionality
* improves user experience
* aligns with SaunaPlanet vision
