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

# Authentication

Status: PLANNED

Future scope:

* registration
* login
* password reset
* social login

---

# User Accounts

Status: PLANNED

Future scope:

* user profiles
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
