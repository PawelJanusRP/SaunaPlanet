# SaunaPlanet

SaunaPlanet is a platform for discovering sauna facilities, sauna events and sauna masters.

The project aims to build a complete sauna ecosystem rather than a simple sauna directory.

---

## Features

### Sauna Map

* Interactive map
* Marker clustering
* Search by name and city
* Category filtering
* Radius filtering
* Photo filtering
* Upcoming event filtering

### Sauna Facilities

* Detailed facility pages
* Photos
* Reviews
* Ratings
* Events
* Sauna masters

### Events

* Event creation
* Event listings
* Upcoming events
* Calendar view

### Sauna Masters

* Dedicated profiles
* Certifications
* Event assignments
* Map satellites

### Rankings

* Sauna rankings
* Review-based scoring

---

## Unique Features

### Event-Based Discovery

Users can discover sauna experiences through events rather than only through locations.

### Sauna Master Ecosystem

Sauna masters are treated as first-class entities.

Each master can have:

* profile
* certifications
* rankings
* event assignments

### Satellite Avatars

Assigned sauna masters appear as avatar satellites around sauna facilities on the map.

Satellite colors reflect master levels:

* Gold — Master
* Purple — Senior
* Blue — Certified
* Gray — Guest

---

## Technology Stack

### Frontend

* Next.js
* TypeScript
* TailwindCSS
* React Leaflet
* react-leaflet-cluster

### Backend

* Supabase
* PostgreSQL
* PostGIS

### Maps

* OpenStreetMap
* Leaflet

---

## Project Structure

See:

* docs/ARCHITECTURE.md
* docs/DATABASE.md

---

## Documentation

Project documentation is located in:

```text
docs/
├── ARCHITECTURE.md
├── DATABASE.md
├── VISION.md
├── BACKLOG.md
├── KNOWN_ISSUES.md
├── AGENT_WORKFLOW.md
├── SETUP.md
└── SCRIPTS_NOTES.md
```

---

## Setup

See:

docs/SETUP.md

---

## Current Focus

Current priorities include:

* Authentication
* User accounts
* Admin panel
* Roles and permissions
* Event management improvements
* Sauna master profile improvements

---

## Long-Term Vision

SaunaPlanet aims to become the leading sauna ecosystem platform in Europe.

Core ecosystem:

Sauna Facilities
→ Sauna Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings

Future plans include:

* bookings
* payments
* subscriptions
* private garden saunas
* verification workflows

---

## Development

For AI-assisted development:

Read:

* CLAUDE.md

before making changes.

---

## Repository

Main branch:

main
