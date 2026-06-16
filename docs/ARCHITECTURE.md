# SaunaPlanet - Architecture

## Repository

GitHub:

https://github.com/PawelJanusRP/SaunaPlanet

Main branch:

main

---

# Technology Stack

## Frontend

* Next.js App Router
* TypeScript
* TailwindCSS
* React Leaflet
* react-leaflet-cluster

## Backend

* Supabase
* PostgreSQL
* PostGIS

## Maps

* OpenStreetMap
* Leaflet

---

# Application Overview

SaunaPlanet is a platform for discovering sauna facilities, sauna events and sauna masters.

The long-term goal is to build a complete sauna ecosystem rather than a simple sauna directory.

Core entities:

* Sauna Facilities
* Sauna Events
* Sauna Masters
* Certifications
* Rankings
* Reviews

---

# Main Functional Areas

## Sauna Map

The map is the primary entry point of the application.

Implemented features:

* interactive map
* marker clustering
* search by name
* search by city
* category filtering
* radius filtering
* photo filtering
* upcoming event filtering

Additional visual features:

* event-highlighted markers
* sauna master avatar satellites
* level-based satellite rings

---

## Sauna Details

Route:

/sauna/[id]

Implemented features:

* sauna information
* photo gallery
* event list
* upcoming events
* reviews
* ratings
* assigned sauna masters
* certifications

Purpose:

Provide a complete profile of a sauna facility.

---

## Sauna Master Profiles

Route:

/masters/[id]

Implemented features:

* profile page
* avatar
* biography
* certifications
* assigned events
* associated sauna facilities

Purpose:

Allow users to discover sauna masters before attending events.

---

## Events

Implemented features:

* add event
* event popup
* event list
* event calendar page
* upcoming event list

Current goal:

Allow discovery of sauna ceremonies and experiences.

---

## Reviews

Implemented features:

* add review
* rating average
* ranking support

Purpose:

Build trust and quality rankings for sauna facilities.

---

# Marker System

## Sauna Marker

Standard marker representing a sauna facility.

---

## Event Marker

Saunas with upcoming events receive highlighted map markers.

Current rule:

Upcoming event within the next 7 days.

---

## Sauna Master Satellites

Small avatar markers displayed around sauna facilities.

Visibility requirements:

* approved assignment
* active future event

Current implementation:

* 2–4 masters supported
* positioned around sauna marker

Level ring colors:

* master = gold
* senior = purple
* certified = blue
* guest = gray

Future improvements:

* clickable satellites
* profile preview
* event quick access

---

# Database Architecture

## Main Tables

saunas

Stores sauna facilities.

---

sauna_photos

Stores photos assigned to saunas.

---

sauna_events

Stores events and ceremonies.

---

sauna_reviews

Stores user reviews and ratings.

---

sauna_masters

Stores sauna master profiles.

---

master_credentials

Stores certifications and qualifications.

---

sauna_event_masters

Stores event-to-master assignments.

---

pts_import_log

Stores import logs from PTS imports.

---

# RPC Functions

## get_saunas_nearby()

Returns nearby sauna facilities.

---

## get_sauna_events()

Returns events for a sauna.

---

## get_upcoming_events()

Returns future events.

---

## get_upcoming_event_saunas()

Returns sauna facilities with upcoming events.

---

## get_top_saunas()

Returns highest-rated sauna facilities.

---

# Approximate Folder Structure

The structure below is descriptive and may differ from the current implementation.

app/
├── page.tsx
├── sauna/
│   └── [id]/
├── masters/
│   └── [id]/
├── events/
└── api/

components/
├── SaunaMap.tsx
├── SaunaMarker.tsx
├── EventMarker.tsx
├── SaunaDetails.tsx
├── SaunaMasterSatellite.tsx
└── ...

lib/
├── supabase.ts
├── queries.ts
└── helpers.ts

supabase/
├── migrations/
└── functions/

---

# Development Principles

1. Do not redesign working features without explicit request.

2. Preserve existing data structures whenever possible.

3. Prefer incremental improvements over large rewrites.

4. Maintain backward compatibility with existing database schema.

5. New features should integrate with:

   * sauna facilities
   * events
   * sauna masters
   * certifications

6. Sauna masters are first-class entities and should not be treated as simple event attributes.

---

# Future Architecture Direction

Target ecosystem:

Sauna Facility
↓
Events
↓
Sauna Masters
↓
Certifications
↓
Reviews
↓
Rankings

The application should evolve toward becoming the central discovery platform for sauna culture, events and sauna professionals.
