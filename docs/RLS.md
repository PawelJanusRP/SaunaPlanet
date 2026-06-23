# Row Level Security (RLS)

## Purpose

This document describes the security model of SaunaPlanet.

Current implementation is suitable for MVP development.

Production deployment requires a stricter authorization model.

---

# Current State

Status: HARDENED (SP-013)

All tables have RLS enabled with explicit policies.

Anonymous write access has been removed from all tables.

Public read access is preserved for all content tables.

---

# Known Technical Debt

Current MVP includes temporary update permissions.

This approach is acceptable during development only.

Before public launch:

* anonymous write access must be removed
* ownership validation must be implemented
* role-based access control must be introduced

---

# Security Goals

The production system should provide:

* authentication
* authorization
* ownership validation
* role-based permissions
* auditability

---

# Planned User Roles

## Anonymous

Permissions:

* view public sauna facilities
* view events
* view public reviews
* view sauna master profiles

Restrictions:

* cannot modify data

---

## Registered User

Permissions:

* create reviews
* manage own profile
* manage favorites
* create bookings

Restrictions:

* cannot manage facilities

---

## Sauna Manager

Permissions:

* manage assigned facilities
* manage facility events
* upload photos

Restrictions:

* only assigned facilities

---

## Sauna Master

Permissions:

* manage own profile
* manage certifications
* accept event assignments

Restrictions:

* only own profile

---

## Moderator

Permissions:

* review moderation
* image moderation
* content moderation

---

## Administrator

Permissions:

* full platform access

---

# Ownership Model

Future tables should support ownership.

Examples:

saunas.owner_id

sauna_events.created_by

sauna_reviews.user_id

sauna_masters.user_id

This enables secure RLS policies.

---

# Review Security

Users should only be able to:

* create their own reviews
* edit their own reviews
* delete their own reviews

Moderators and administrators may override.

---

# Event Security

Facility managers should only manage:

* their own facilities
* their own events

Cross-facility editing should be prevented.

---

# Sauna Master Security

Sauna masters should only edit:

* their own profile
* their own certifications

unless elevated permissions exist.

---

# Admin Panel Security

Admin functionality must never rely solely on frontend checks.

Authorization must be enforced by:

* Supabase RLS
* database policies

---

# Import Security

Import processes should use:

* service accounts
  or
* service role keys

Imports should not require public write permissions.

---

# Migration Plan

Phase 1

* Supabase Auth
* user accounts

Phase 2

* ownership fields
* ownership validation

Phase 3

* role management

Phase 4

* remove MVP policies

Phase 5

* production security review

---

# Principle

The frontend is not a security boundary.

Security must be enforced by the database.
