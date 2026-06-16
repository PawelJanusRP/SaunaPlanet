# CLAUDE.md

# SaunaPlanet

You are working on SaunaPlanet.

Before making any changes, read:

* docs/ARCHITECTURE.md
* docs/DATABASE.md
* docs/VISION.md
* docs/BACKLOG.md
* docs/FEATURES.md
* docs/ROADMAP.md
* docs/DECISIONS.md
* docs/IMPORTS.md
* docs/RLS.md
* docs/KNOWN_ISSUES.md
* docs/AGENT_WORKFLOW.md
* docs/SETUP.md
* docs/SCRIPTS_NOTES.md

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
* sauna details
* events
* reviews
* rankings
* sauna masters
* master certifications
* avatar satellites on map markers
* project documentation

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

## Rule 7

Read documentation before making architectural decisions.

Do not assume project direction from code alone.

---

# Git Workflow

Never commit directly to main.

Always create feature branches.

Examples:

feature/authentication

feature/admin-panel

feature/roles-permissions

feature/bookings

feature/payments

feature/calendar

feature/master-verification

feature/private-saunas

---

# Development Priorities

Current priority:

Phase 2 – Accounts and Security

Focus areas:

* authentication
* user accounts
* role-based permissions
* admin capabilities
* RLS improvements

See:

docs/ROADMAP.md

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

See:

docs/DATABASE.md

---

# Protected Systems

These systems have already required significant debugging effort.

Be cautious when modifying:

* map clustering
* event highlighting
* sauna master satellites
* sauna detail page
* sauna master profiles
* import scripts
* Supabase RPC functions

Review:

docs/KNOWN_ISSUES.md

before changing them.

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
+
Community

Future features:

* bookings
* payments
* subscriptions
* private garden saunas
* verification workflows

Every major feature should support this vision.

---

# Security Principles

Current security model is MVP-oriented.

Future development should move toward:

* Supabase Auth
* ownership validation
* role-based permissions
* strict RLS policies

See:

docs/RLS.md

---

# Import Principles

Imported data should:

* preserve existing records
* avoid duplicates
* be logged
* remain traceable

See:

docs/IMPORTS.md

---

# Documentation Rules

Documentation is part of the product.

Major architectural changes should update:

* ARCHITECTURE.md
* DATABASE.md
* FEATURES.md
* ROADMAP.md
* DECISIONS.md
* BACKLOG.md

when appropriate.

---

# Development Approach

When implementing new functionality:

1. Analyze existing code first.
2. Read relevant documentation.
3. Reuse existing components.
4. Minimize breaking changes.
5. Explain architectural decisions.
6. Keep solutions simple.
7. Prefer maintainability over cleverness.

---

# Success Criteria

A successful change:

* compiles
* passes linting
* preserves existing functionality
* improves user experience
* aligns with SaunaPlanet vision

---

# Guiding Principle

When there is uncertainty between two approaches, prefer the one that strengthens:

Facilities
→ Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings
→ Community

This ecosystem is the core identity of SaunaPlanet.
