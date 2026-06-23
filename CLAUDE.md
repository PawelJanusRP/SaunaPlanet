# SaunaPlanet - Agent Instructions

## Required Reading

Before starting any non-trivial task, read:

* docs/PRODUCT_STRATEGY.md
* docs/VISION.md
* docs/ROADMAP.md
* docs/FEATURES.md

Do not assume the project is a simple sauna directory.

Always optimize decisions for the long-term SaunaPlanet ecosystem.

---

## Current Product Direction

SaunaPlanet is evolving toward:

* sauna ecosystem
* event platform
* reservation platform
* private sauna marketplace
* payment platform

Future features should not block:

* reservations
* payments
* moderation workflows
* ownership models
* business accounts
* private sauna listings

---

## Database Rules

Before changing database schema:

1. Explain proposed schema changes.
2. Explain migration impact.
3. Explain compatibility impact.

Before modifying:

* RPC functions
* SQL functions
* RLS policies
* triggers

always present the SQL first.

Do not apply destructive schema changes without approval.

---

## Supabase Rules

Important:

Many business rules are implemented in:

* RPC functions
* SQL views
* database functions

Do not assume all logic exists in the Next.js codebase.

When investigating bugs:

1. Check frontend code.
2. Check Supabase queries.
3. Check RPC functions.
4. Check RLS policies.

---

## Existing Functionality Protection

The following areas are considered high-risk:

* SaunaMap.tsx
* event visibility logic
* sauna master satellite logic
* realtime updates
* map filters
* clustering

When modifying these areas:

* explain impact
* explain risks
* preserve existing behaviour unless explicitly requested

---

## Branch Workflow

For feature branches:

1. Analyze
2. Create implementation plan
3. Implement
4. Run lint
5. Run build
6. Summarize changes
7. Prepare commit

Do not:

* merge into main
* rebase main
* push automatically

unless explicitly instructed.

---

## Documentation Updates

When implementing significant functionality:

update relevant documentation:

* docs/FEATURES.md
* docs/ROADMAP.md
* docs/KNOWN_ISSUES.md

when applicable.

---

## Marketplace Compatibility

When creating:

* user accounts
* ownership models
* moderation workflows
* reservation systems

design them to support future:

* private sauna owners
* paid reservations
* event payments
* business accounts
* marketplace transactions

---

## Preferred Development Style

Prefer:

* small focused commits
* backward compatibility
* reusable components
* incremental delivery

Avoid:

* large refactors
* unnecessary rewrites
* replacing working code without reason
* introducing new frameworks

## Project Overview

SaunaPlanet is a platform connecting:

* sauna facilities
* sauna events
* sauna masters
* certifications
* reviews
* reservations

This is NOT a generic business directory.

The most important product relationship is:

Sauna → Event → Sauna Master

Every implementation should strengthen this ecosystem.

---

## Product Vision

Primary goal:

Become the leading sauna discovery and event platform in Europe.

Users should discover:

1. Events
2. Sauna Masters
3. Sauna Facilities

not only facilities.

See:

* docs/VISION.md
* docs/ROADMAP.md
* docs/FEATURES.md

before implementing major features.

---

## Current Development Phase

Current priorities:

1. User accounts and authentication
2. Sauna submission workflow
3. Admin moderation
4. RLS and permissions
5. Reservations
6. Payments
7. Private garden saunas

---

## Architecture

Stack:

* Next.js
* TypeScript
* TailwindCSS
* Supabase
* PostgreSQL
* PostGIS
* Leaflet

Important entities:

* saunas
* sauna_events
* sauna_masters
* sauna_event_masters
* sauna_reviews
* sauna_photos

---

## Development Rules

Before modifying code:

1. Read relevant documentation.
2. Prepare implementation plan.
3. Explain risks.
4. Wait for approval if requested.

---

## Git Workflow

Always work on the current branch.

Never merge into main automatically.

Never push automatically.

Before proposing a commit:

* run lint
* run build
* summarize changes

---

## UI Rules

Prefer:

* reusable components
* mobile-friendly layouts
* consistency with existing design

Avoid:

* introducing new design systems
* large visual redesigns
* breaking existing UX

---

## Data Safety

Do not remove existing functionality unless explicitly requested.

When modifying queries:

* preserve backwards compatibility
* preserve existing map functionality
* preserve existing event functionality

---

## Long-Term Features

Future roadmap includes:

* reservations
* payments
* private saunas
* marketplace
* subscriptions
* rankings
* certifications

Design new features so they remain compatible with these goals.

---

## Definition of Done

A task is complete only if:

* implementation is finished
* lint passes
* build passes
* functionality is tested
* changed files are summarized
* commit is prepared but NOT merged automatically
