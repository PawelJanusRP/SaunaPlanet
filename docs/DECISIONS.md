# Architecture and Product Decisions

This document records important architectural and product decisions made during SaunaPlanet development.

The purpose is to preserve context and reasoning behind decisions.

Future contributors and AI agents should read this document before making major architectural changes.

---

# Decision 001

Title:

SaunaPlanet is an ecosystem, not a directory.

Date:

2026

Decision:

The platform should evolve into a sauna ecosystem rather than remain a sauna directory.

Reasoning:

Traditional sauna directories only answer:

"Where is a sauna?"

SaunaPlanet should answer:

* Which sauna should I visit?
* What events are available?
* Who conducts them?
* What certifications do they have?
* How do users rate them?

Impact:

All future features should strengthen the ecosystem.

---

# Decision 002

Title:

Sauna Masters are first-class entities.

Date:

2026

Decision:

Sauna masters are modeled as dedicated entities.

Reasoning:

Future requirements include:

* rankings
* certifications
* reviews
* event assignments
* authority system

These capabilities require separate profiles.

Rejected approach:

Storing master names directly in event records.

Impact:

Use:

* sauna_masters
* sauna_event_masters

for all master-related functionality.

---

# Decision 003

Title:

Events are strategic platform objects.

Date:

2026

Decision:

Events should be treated as core platform entities.

Reasoning:

Many users choose experiences based on ceremonies rather than locations.

Impact:

Future development should increasingly emphasize events.

Examples:

* event discovery
* event calendars
* bookings
* event rankings

---

# Decision 004

Title:

Satellite avatars represent active participation.

Date:

2026

Decision:

Sauna master satellites appear only for future approved event assignments.

Reasoning:

The map should show where sauna masters will actually be present.

Impact:

Satellites are event-based, not facility-based.

Visibility conditions:

* approved assignment
* future event

---

# Decision 005

Title:

Map remains the primary application interface.

Date:

2026

Decision:

The map is the central navigation experience.

Reasoning:

Users naturally explore sauna facilities geographically.

Impact:

New features should integrate with the map whenever practical.

Protected functionality:

* clustering
* event highlighting
* satellite markers

---

# Decision 006

Title:

Private saunas are a strategic differentiator.

Date:

2026

Decision:

Private garden and home saunas will become supported platform entities.

Reasoning:

Most competitors focus only on commercial facilities.

Impact:

Future platform architecture should support:

* reservations
* availability calendars
* payments
* reviews

for private facilities.

---

# Decision 007

Title:

Authority and certification system.

Date:

2026

Decision:

SaunaPlanet should support professional recognition and certification.

Reasoning:

Users need trust signals.

Potential future concepts:

* certifications
* authority levels
* trust badges
* verification

Impact:

Certification-related features should be expandable.

---

# Decision 008

Title:

Incremental evolution over rewrites.

Date:

2026

Decision:

The project should evolve incrementally.

Reasoning:

Large rewrites create unnecessary risk.

Impact:

Preferred:

* migrations
* extensions
* additive features

Avoid:

* destructive schema redesign
* unnecessary rewrites
* replacing working systems

---

# Decision 009

Title:

Documentation is part of the product.

Date:

2026

Decision:

Documentation should be maintained alongside code.

Reasoning:

The project will increasingly use AI-assisted development.

Impact:

Major changes should update:

* ARCHITECTURE.md
* DATABASE.md
* FEATURES.md
* ROADMAP.md
* BACKLOG.md

when appropriate.

---

# Decision 010

Title:

European expansion from day one.

Date:

2026

Decision:

The architecture should support future international growth.

Reasoning:

The long-term goal is a European sauna platform.

Initial focus:

Poland

Future markets:

* Germany
* Czech Republic
* Slovakia
* Finland
* Sweden
* Norway
* Estonia
* Latvia
* Lithuania

Impact:

Avoid country-specific assumptions in future designs.

---

# Guiding Principle

Whenever there is uncertainty between two approaches, prefer the one that strengthens:

Facilities
→ Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings
→ Community

This ecosystem is the core identity of SaunaPlanet.
