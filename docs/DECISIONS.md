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

# Decision 011

Title:

Sessions and Events are distinct kinds of happenings.

Date:

2026-07-11

Decision:

The platform distinguishes two kinds of happenings sharing one infrastructure:

* Session (seans/rytuał) — a sauna ritual led by a sauna master. The master is
  the organizer, promotes the session via SaunaPlanet links on social media,
  appears as a satellite of the sauna, and confirms registrations. Not
  separately ticketed (part of facility admission); registration manages
  capacity only. Pulses distinctly on the map.
* Event — a larger production (sauna night, festival, competition), organized
  by the facility (owner/manager) and separately ticketed. Performing masters
  are assigned. Pulses distinctly on the map (existing event highlight).

Reasoning:

Sauna masters can be event organizers — but for sessions, not for ticketed
events. Sessions turn masters into an acquisition channel: a master inviting
their own social-media audience brings new users with every session. Events
remain the monetization anchor (payee = facility owner).

Impact:

* The happenings data model needs a kind distinction and organizer attribution.
* Session registrations are confirmed by the organizing master; event
  registrations by facility staff.
* Map must visually distinguish session pulsing from event pulsing
  (SaunaMap.tsx — protected area).
* Full model: docs/USER_MODEL.md §1.6, journey J8.

---

# Decision 012

Title:

Reviews do not require confirmed registration or attendance.

Date:

2026-07-11

Decision:

Any logged-in user may review a past happening. No confirmed registration,
check-in or attendance proof is required.

Reasoning:

Most attendees currently register offline; attendance-gating would silence the
majority of genuine reviewers. Attendance-gating remains the ready remedy if
review abuse appears once reservations are universal.

Impact:

Current SP-021 behaviour is confirmed as intended. See docs/USER_MODEL.md §8.0.2.

---

# Decision 013

Title:

No self-reviews by owners, managers or organizers.

Date:

2026-07-11

Decision:

Owners and managers must not review their own facility or its happenings.
Corollary adopted in USER_MODEL.md: organizers (masters for their sessions)
must not review their own happenings.

Reasoning:

Conflict of interest undermines the trust the review system exists to create.

Impact:

Requires enforcement once ownership/management relationships are queryable at
review time. See docs/USER_MODEL.md §8.0.3 and MVP item §6.11.

---

# Decision 014

Title:

The Session is the atom; the Event is a container.

Date:

2026-07-11

Decision:

A Session is an individual sauna ritual (master(s) + facility + time + theme +
capacity) — not a smaller Event. An Event is a larger organized occurrence
that may contain many Sessions; a Session belongs to at most one Event and may
exist standalone. Events may be organized by a facility or by a sauna master;
Sessions are created by masters (primary case) or facility staff, always with
two-sided consent. Reservations target exactly one object (Event XOR Session);
the organizer of the reserved object confirms them. On the map, Event presence
pulses dominantly and Session presence pulses softer; one pulse per marker,
Event > Session; master satellites represent any confirmed future presence
(generalizing Decision 004).

Reasoning:

Modeling the ritual itself is a core differentiator: it turns masters into
content creators with shareable schedules (acquisition), answers the mobile
killer query ("what ritual tonight near me"), and creates a monetization
ladder (free sessions → event tickets → premium/paid sessions later).

Impact:

Refines Decision 011 and USER_MODEL.md §1.6 (containment instead of two
parallel kinds; master-organized events allowed, paid ones gated on the master
payout model). Authoritative model: docs/EVENT_SESSION_MODEL.md.

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
