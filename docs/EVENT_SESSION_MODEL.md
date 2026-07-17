# SaunaPlanet Event & Session Model

Status: AUTHORITATIVE product reference for everything involving events,
sessions (seanse/rytuały), their reservations, their payments and their map
presence. Read together with `docs/USER_MODEL.md` (personas, ownership,
permissions); where this document is more specific than USER_MODEL §1.6, this
document wins (see §13 for the exact deltas).

Created: 2026-07-11. Product decision by owner; recorded as Decision 014 in
`docs/DECISIONS.md`.

This is a product architecture document: no UI design, no SQL, no migrations.
Database and UI notes in §12 are directional concepts only.

---

# 1. Core Concept

## 1.1 The Session is the atom of sauna experience

A **Session** (Polish: *seans*; genre names: *rytuał*, *Aufguss*) is an
individual sauna ritual: one master (or a team) in one sauna room, one start
time, a short duration, a theme, a small capacity. It is the thing people
actually experience, remember, photograph, and review — "the herbal ritual
Kasia led at 19:00".

An **Event** is a larger organized occurrence: a sauna night, a festival, a
competition. **An Event is a container and a commercial wrapper — it may
contain many Sessions.** An Event is *not* a big Session, and a Session is
*not* a small Event.

```
Winter Sauna Festival (EVENT)
 ├── Session 10:00 — Classic Aufguss, master A
 ├── Session 11:00 — Herbal ritual, master B
 └── Session 12:00 — Championship show, masters A+C

Friday Evening (EVENT)
 ├── Herbal Session — 19:00
 └── Ice Session — 21:00

"My Thursday ritual" (STANDALONE SESSION, no Event)
 └── Session 20:00 — master D at their home sauna
```

A standalone Session exists without any Event — this is the everyday case: a
master's regular ritual during normal facility opening hours.

## 1.2 Why this is a core differentiator

Directories list saunas. Event platforms list events. **Nobody models the
ritual itself.** Modeling the Session as a first-class object gives
SaunaPlanet three things competitors cannot copy cheaply:

1. **The master economy** — sessions are *authored by masters*. Every master
   becomes a content creator with a schedule, a shareable link, and an
   audience they bring themselves (USER_MODEL journey J8). Rankings, reviews
   and certifications attach to the exact thing the master did.
2. **Honest discovery** — "what ritual can I attend *tonight near me*" is a
   question only session-level data can answer. This is the mobile-first
   killer query (VISION: discoverability).
3. **A monetization ladder** — free sessions build habit; events ticket the
   special occasions; paid premium sessions and master payouts come later
   without remodeling (§8).

Every design choice below is tested against these three.

## 1.3 Definitions (glossary)

| Term | Meaning |
|---|---|
| **Session** (seans) | Atomic ritual: master(s) + facility + start time + duration + theme + capacity. May belong to at most one Event. |
| **Event** | Organized occurrence with a timeframe and an organizer; may contain 0..n Sessions; the unit of separate ticketing. |
| **Happening** | Umbrella word for "Event or Session" — used when a rule applies to both (e.g. reviews, map presence). |
| **Organizer** | The party answerable for a happening: a facility (acting through owner/manager) or a master. |
| **Conductor** | A master performing a Session (lead or support). |
| **Lineup** | The set of masters associated with an Event (derived from its Sessions plus direct assignments). |
| **Admission product** | Future payment object: what a reservation may be priced as (§8). |

---

# 2. Ownership and Organizer Model

Consistent with USER_MODEL's three-layer model: organizing is a *contextual*
capability, never a global role.

## 2.1 Who organizes an Event

An Event may be organized by:

* **a Facility** — the normal case; owner or manager acts on the facility's
  behalf (the facility is the organizer of record, the person is the actor),
* **a Sauna Master** — a touring show, a master-branded sauna night.

Rules:

* Every Event has exactly **one organizer of record**: a facility *or* a
  master. (A manager never organizes in their own name — they act for the
  facility; this keeps the future payee unambiguous.)
* A master-organized Event held at a **managed** facility requires **facility
  consent** (the facility hosts it). Consent is a workflow
  (`pending → approved`), consistent with USER_MODEL §1.4; the facility may
  approve, reject or request changes (Decision 015, §2.3 below).
* At an **unmanaged** facility (no active owner/manager in SaunaPlanet) a
  *verified* master publishes directly; the event is visibly attributed
  "Published by Sauna Master" (§2.3). A master is never blocked from
  organizing merely because the facility is not active on the platform.
* **Money constraint:** master-organized Events may be *paid* only after the
  master-payout model exists (USER_MODEL Q12–Q13). Until then master-organized
  Events are free-admission. The model supports paid ones from day one; the
  capability is gated, not the schema concept.

## 2.2 Who creates a Session

A Session may be created by:

* **a Sauna Master** — the primary case; the master is creator and (default)
  lead conductor,
* **a Facility (owner/manager)** — optional: staff schedules the day's ritual
  program and invites masters to conduct,
* inside an Event — by the **Event organizer**, or proposed by a master into
  the Event (organizer approves).

Consent rules (all reuse the pending→approved pattern):

| Situation | Needs approval from |
|---|---|
| Master creates standalone Session at **affiliated** sauna | nobody — affiliation is standing consent (USER_MODEL Q11) |
| Master creates standalone Session at **non-affiliated** sauna | the facility (owner/manager) |
| Master proposes Session **into an Event** | the Event organizer |
| Facility staff creates Session and assigns a master | the master (two-sided handshake — nobody conducts without consent, mirroring `sauna_event_masters`) |
| Event organizer adds Session to own Event at own facility | nobody (self) |

## 2.3 Publication workflow and statuses (Decision 015)

Event publication follows the facility's management state. The step-by-step
workflow lives in `docs/WORKFLOWS.md` (W-09); this section defines the model.

```
Verified Sauna Master → Create Event → Select Facility
        │
        ├─ facility HAS an active owner/manager
        │    → Pending Facility Approval
        │       (Owner Workspace Today Queue: approve / reject / request changes)
        │    → approved → PUBLISHED BY FACILITY
        │
        └─ facility has NO active owner/manager
             → PUBLISHED BY SAUNA MASTER
               (visibly distinct from a facility-confirmed event)
```

Intended long-term lifecycle (product vision — not an implementation
commitment; today's implementation knows only `active`/`rejected`):

| Status | Meaning |
|---|---|
| **Draft** | being composed; visible only to the creator |
| **Pending Facility Approval** | master's proposal awaiting the managed facility's decision |
| **Pending Admin Review** *(optional)* | platform-level moderation gate, per policy |
| **Published by Facility** | officially confirmed by the facility (facility-created, or master proposal approved) |
| **Published by Sauna Master** | published directly by a verified master at an unmanaged facility |
| **Rejected** | declined by the facility (or moderation), with reason |
| **Cancelled** | withdrawn after publication (cascade per §3; never deletion of history) |

Independence principle: **creator, organizer, facility, participating
masters, publication status and approval status are independent concepts** —
they must never collapse into a single role or flag. (Example: a facility
manager may *create* an event whose *organizer of record* is the facility;
a master may be *creator and organizer* of an event *at* a facility they do
not manage, with the facility only *approving*.)

When an unmanaged facility later gains an owner (claim flow, USER_MODEL J2),
existing "Published by Sauna Master" events remain valid; the new owner gains
approval authority for future proposals only.

## 2.4 Promotion links

Both Events and Sessions have **canonical, share-first URLs** — a master must
be able to post "my Friday ritual → link" or "our festival → link" on social
media and have it land on a page that converts (guest-readable, registration
CTA, good social preview). This is the J8 acquisition loop and applies to both
object kinds equally.

---

# 3. Relationship Model

```
FACILITY 1 ────────< EVENT 0..n          (event anchored at a primary facility)
FACILITY 1 ────────< SESSION 0..n        (every session happens at exactly one facility)
EVENT    1 ────────< SESSION 0..n        (containment; session.event is OPTIONAL)
SESSION  n >──────< MASTER (conductors: role = lead | support | guest)
EVENT    n >──────< MASTER (lineup: direct assignment, e.g. announced headliner)
USER     1 ────────< RESERVATION >──────── exactly one of {EVENT, SESSION}
ORGANIZER (facility XOR master) ──── EVENT
CREATOR  (master or facility actor) ──── SESSION
```

Answers to the required questions:

**Event → many Sessions?** Yes, 0..n. An Event with zero Sessions is valid
(simple events keep working exactly as today — nothing existing breaks).

**Session → one Event?** At most one. `session.event` is optional and, when
set, immutable in spirit (moving a session between events is an organizer
action, not a user-visible state). A Session never belongs to two Events —
if a ritual is part of two festivals, it is two Sessions.

**Can multiple masters participate in one Session?** Yes — 1..n conductors
with roles (**lead** required, plus support/guest). Team Aufguss shows and
championship duos are real and common at exactly the festivals this model
targets. Conductor entries follow the two-sided consent handshake.

**Can one master conduct multiple Sessions during one Event?** Yes,
unbounded — a festival master conducting 10:00, 12:00 and 16:00 is the
expected headliner pattern. Each Session is a separate conductor record;
schedule-conflict *warnings* (same master, overlapping times) are a quality
feature, not a model constraint.

**Can Sessions exist independently?** Yes — standalone Sessions are the
*primary* growth mechanism (J8), not an edge case. The everyday ritual at a
public sauna needs no Event wrapper.

Additional rules:

* **Facility inheritance:** a Session inside an Event defaults to the Event's
  facility but carries its own facility reference — this keeps multi-venue
  festivals (city sauna week) possible later without remodeling. For now,
  product behaviour: same facility unless the Event is explicitly multi-venue
  (future).
* **Time containment:** a Session inside an Event should fall within the
  Event's timeframe — enforce as validation warning, not hard rule (schedules
  shift).
* **Lineup derivation:** an Event's public lineup = union of its Sessions'
  conductors + directly assigned masters. Direct assignment (today's
  `sauna_event_masters`) remains useful for announcing masters before the
  session schedule exists; once sessions are scheduled, sessions are the
  precise source of truth.
* **Cancellation cascade:** cancelling an Event cancels its Sessions (with
  notifications, and refunds in the payments era). Cancelling one Session
  never affects its siblings or the Event.

---

# 4. Map Behaviour and Visual Hierarchy

The map is the primary interface (Decision 005) and `SaunaMap.tsx` is a
protected area — this section defines *product behaviour*; implementation is
planned separately and carefully.

## 4.1 Presence grades

A sauna marker has exactly one **pulse grade** at any moment, derived from
upcoming happenings at that facility:

| Grade | Trigger | Visual intent (not final design) |
|---|---|---|
| **EVENT** | any upcoming Event anchored here, or any upcoming Session here that belongs to an Event | strong pulse — today's behaviour; visually dominant |
| **SESSION** | only standalone upcoming Session(s) here | smaller / softer / slower pulse — clearly alive, clearly subordinate |
| **NONE** | nothing upcoming | no pulse |

## 4.2 Precedence rules

1. **One pulse per marker.** Grades never stack or blend; the marker shows
   the highest applicable grade: `EVENT > SESSION > NONE`.
2. **Containment does not double-count.** Sessions inside an Event contribute
   to the EVENT grade (they *are* the event's substance); they never produce
   a second, session-style pulse at the same marker.
3. **Coexistence:** a facility with an upcoming Event *and* an unrelated
   standalone Session pulses EVENT; the standalone Session remains fully
   discoverable in the popup/detail hierarchy — precedence affects the pulse,
   never the content.
4. **Satellites are additive and grade-independent.** A master satellite
   appears for any confirmed upcoming presence — event lineup membership *or*
   session conducting. This generalizes Decision 004 from "approved future
   event assignments" to "**confirmed future presence**". Satellites keep
   their level-color rings; they do not change with pulse grade.
5. **Popup/detail hierarchy mirrors the model:** Events first (with their
   Sessions nested as a timeline), then standalone Sessions, chronological
   within each group.
6. (Nice to have) **Imminence intensification:** pulse animation may
   intensify as the happening approaches (tonight > next week), within its
   grade — never crossing grades.

Rationale for EVENT-dominance: events are rarer, ticketed and curated — they
deserve the scarce attention a strong pulse spends. Sessions are frequent and
ambient; a soft ubiquitous pulse tells users "this map is alive" without
crying wolf.

---

# 5. Reservation Model

## 5.1 The one rule

> **A reservation always targets exactly one reservable object: an Event or a
> Session.** "Reserving both" is two linked reservations, never one blended
> record.

This keeps capacity, confirmation authority, waiting lists and (future)
payments unambiguous per object.

## 5.2 Reservation shapes

| Shape | Meaning | Example |
|---|---|---|
| **Event-only** | admission to the Event; contained Sessions are first-come within their capacity | festival ticket, drop into whichever ritual has space |
| **Session-only** | a seat in one Session | reserve Thursday's herbal ritual (standalone), or one festival show where the Event is free-admission |
| **Event + Session(s)** | Event admission plus guaranteed seats in chosen Sessions | festival ticket + reserved seat at the 12:00 championship show |

Dependency rule: an Event may declare **"sessions require event admission"**.
When set, a Session reservation inside it requires (and is linked to) a valid
Event reservation; cancelling the Event reservation cancels the dependent
Session reservations. Standalone Sessions never have this dependency.

## 5.3 Capacity

* Capacity is defined and enforced **per reservable object, independently**.
  Session capacity is physical (a sauna room: ~15–60 people) and should be
  strongly encouraged; Event capacity is the venue and may be unlimited/null.
* Session capacities do not sum to Event capacity and are never derived from
  it — a 500-person festival contains 40-person rituals.
* Capacity is enforced at **confirmation** time (consistent with USER_MODEL
  §6.10): pending requests may exceed capacity; confirmations may not.

## 5.4 Confirmation authority

Generalizes USER_MODEL §1.6 into one rule:

> **Registrations are confirmed by the organizer of the reserved object.**

* Session → the Session's creator / lead conductor (typically the master);
  facility staff of the hosting facility may also confirm (they run the door).
* Event → the Event organizer: facility staff for facility-organized,
  the organizing master for master-organized.
* Moderator/admin override always exists.

## 5.5 Waiting lists (post-MVP, modeled now)

Per reservable object, FIFO. On a cancellation freeing capacity, the head of
the list is **offered** the spot (notification) with an expiry window; expiry
promotes the next. Waiting lists never auto-confirm — an offer accepted is a
confirmation. Session waitlists will matter *more* than event waitlists
(small capacities fill first) — design mobile-first.

## 5.6 Ownership of reservations

* The **user** owns their reservation: sees it on /profile, cancels it
  (within the cancellation window), (future) holds its receipt.
* The **organizer** manages its status (confirm/reject) and sees its list.
* The **facility owner** has read visibility over all reservations at their
  facility, including master-organized happenings hosted there — oversight of
  their own venue, not management of someone else's guest list.
* **Admin** sees and can fix everything (audited).

Today's `event_registrations` (SP-022) is the Event-only shape of this model —
the model extends it, nothing contradicts it.

---

# 6. Payment Model (future-compatible; no implementation)

## 6.1 Admission products

Money never attaches to Events or Sessions directly — it attaches to an
**admission product** offered on a reservable object:

| Product | Object | Notes |
|---|---|---|
| **Event ticket** | Event | the anchor of monetization (Phase 6, J5); contained Sessions included by default |
| **Session included in Event ticket** | Session (via dependency) | zero-priced; exists so a seat can be *reserved* without being *sold* |
| **Premium Session add-on** | Session inside a ticketed Event | optional extra charge for a special show; supported by the model, launched later |
| **Session ticket** | standalone Session | paid rituals — gated on master payout model (Q12) |
| **Free** | either | no product; reservation without transaction — the default today |

A reservation links to at most one transaction; a transaction references the
admission product it purchased. Refund/cancellation policy is a property of
the product (cancellation windows), not of the reservation.

## 6.2 Who receives the money

> **Revenue follows the organizer of record; the platform takes commission;
> splits are a schedule, not a hack.**

* **Facility-organized Event** → payee is the **facility owner** (never a
  manager — USER_MODEL §3.2). This is the only payee type needed for Phase 6.
* **Master-organized happening** → payee is the **master**, with an optional
  **revenue split schedule**: an ordered list of (party, share) — e.g. master
  70 / hosting facility 30 — agreed at consent time (§2.1). Requires master
  payout accounts: explicitly deferred (Q12–Q13), explicitly not precluded.
* **Included sessions carry no money** — all value concentrates on the Event
  ticket; this avoids intra-event accounting entirely in Phase 6.
* Platform commission applies at the product level, configured per product
  type (future `platform_settings`, SP-027 pattern).

## 6.3 Sequencing

Phase 6 ships exactly one money path: **facility-organized Event ticket,
owner payee, platform commission**. Everything else in §6.1–6.2 is modeled so
that adding it later is additive (new product types, new payee type, split
schedules) — never a remodel. This is the same "cheap now, expensive later"
logic as the ownership model.

---

# 7. Reviews and Rankings Implications

* Reviews attach to the **happening the user experienced**: Session reviews
  rate the ritual (and therefore its conductors); Event reviews rate the
  production (organization, venue, atmosphere).
* **Master rankings (SP-023) should source primarily from Session reviews**
  once sessions exist — they measure exactly what the master did. Event
  reviews contribute to facility/organizer reputation. (Today's
  `event_reviews` remain valid: they are reviews of session-less Events.)
* Review eligibility follows Decision 012 (no attendance requirement);
  self-review bans follow Decision 013 (organizers and conductors do not
  review their own happenings; owners/managers not their facility's).
* One review per user per happening (existing SP-021 rule, applied per
  object — a festival-goer may review the Event *and* each Session attended).

---

# 8. User Journeys

**Guest.** Opens map → sees a softly pulsing sauna nearby → popup shows
"tonight: Herbal ritual 19:00, master Kasia (satellite avatar)" → session page
(shared link or map) → registration wall → converts. Sessions multiply the
number of "something is happening" moments a guest can hit — most days have no
Event nearby, but many days have a Session.

**Registered User.** Checks "tonight near me" → reserves a seat in the ice
session (pending) → master confirms → push/email → attends → reviews the
session → follows the master → next week reserves the master's Friday ritual
at a different facility. At a festival: buys the Event ticket (future),
reserves seats in two specific shows, drops into others freely.

**Sauna Master.** Creates a standalone Session at their affiliated sauna in
under a minute (mobile) → shares the link on Instagram → 14 registrations →
confirms until capacity → conducts → collects session reviews that feed their
ranking. Festival month: proposes two Sessions into "Winter Sauna Festival" →
organizer approves → appears in the lineup → conducts three shows in one day.
Long-term: organizes their own free sauna night (Event), later a paid one
(after Q12–Q13).

**Sauna Manager.** Builds "Friday Evening" as an Event → adds Herbal 19:00 and
Ice 21:00 Sessions → invites masters per session (they accept) → publishes →
morning routine: confirm registrations per session on the phone → at the door:
checks the confirmed list (future: check-in). Also approves a visiting
master's request to hold a standalone session on Sunday.

**Facility Owner.** Approves hosting a master-organized event at their venue
(and, in the payments era, its revenue split) → watches the reservation and
review dashboard → sees which masters and which session themes fill the house
→ books those masters more (future: pays them — the master marketplace).

**Administrator.** Moderates happenings like any content; resolves disputes
(a master and a facility disagree over a cancelled session); features
festivals; in the payments era operates refunds. The admin's role *shrinks*
as organizers self-serve — same trajectory as USER_MODEL §2.7.

---

# 9. Discovery: Search, Filters, Notifications

**Search.** Sessions make search *temporal and personal*, not just spatial:
"herbal ritual", "Aufguss tonight", "sessions by master Kasia", "ice sessions
this weekend in Wrocław". Master names and session themes become first-class
search dimensions alongside city/facility.

**Session themes** should be a managed dictionary (the `certificate_types`
pattern): herbal, ice, music Aufguss, meditation, classic, championship-style,
beginners… — powering filters, search and (later) personalization. Free-text
themes fragment discovery; dictionaries keep it coherent and translatable
(Decision 010: i18n from day one).

**Filters (map and lists).**

* Kind: Events / Sessions / both (default: both, hierarchy per §4.2.5).
* Time: today / tonight / this weekend / date range.
* Theme (dictionary above).
* Master: level, specific master, followed masters (future).
* Free vs ticketed (future).

**Notifications** (priority order):

1. Reservation lifecycle: confirmed / rejected / organizer-cancelled —
   USER_MODEL MVP item §6.9; applies identically to sessions.
2. Reminder before a confirmed happening (day-of, mobile-first).
3. Followed master published a new Session/Event (the retention half of J8).
4. Waitlist offer with expiry (§5.5).
5. Schedule changes to a reserved happening.

---

# 10. Mobile Experience (future direction)

Sessions are the **mobile primitive**. The defining mobile question — "what
can I attend tonight near me?" — is answered by session-level data, location
and time. Directional concepts (consistent with the mobile roadmap:
responsive → PWA → Expo):

* **Tonight view:** a time-sorted, distance-aware feed of upcoming sessions
  and events; arguably the future default screen alongside the map.
* **One-minute session creation** for masters: phone-first form (theme from
  dictionary, time, capacity), instant shareable link with a good social
  card. If creating a session takes longer than posting on Instagram, masters
  will post on Instagram only.
* **One-tap confirmations** for organizers: registration queue as swipeable
  list; this is a daily-frequency job (§8 Manager/Master journeys).
* **Push** (PWA/native): the notification set of §9 — especially followed
  masters and waitlist offers, which are time-critical.
* **Later:** check-in at the door (organizer scans/taps), offline-tolerant
  "my reservations" for poor-signal saunas.

---

# 11. Adoption Path

Sequenced against USER_MODEL §6–7; no timelines, only order and dependencies.

**Step 1 — Model foundation (belongs to USER_MODEL MVP item §6.8):**
Session as an object with: facility, optional parent Event, time, theme,
capacity, creator, conductors (lead required), status workflow. Organizer of
record on Events (facility XOR master). Reservations generalized to target
Event XOR Session. Consent workflows per §2.2. *This unblocks everything and
is the G13 gap in USER_MODEL §3.3.*

**Step 2 — Master self-service + share loop (J8):**
Mobile-first session creation, canonical share URLs with social cards,
master-side registration confirmation. This is the growth feature; ship it
before map visuals — links work without pulses.

**Step 3 — Map hierarchy (§4):**
EVENT/SESSION pulse grades, satellite rule generalized to "confirmed future
presence". Touches protected `SaunaMap.tsx` — isolated, carefully reviewed
change.

**Step 4 — Event-as-container UX:**
Session timelines on event pages, lineup derivation, session proposals into
events, Friday-Evening-style composed events for managers.

**Step 5 — Reservations maturation:**
Dependency rule (sessions-require-event-admission), waitlists, reminders,
check-in.

**Step 6 — Money (Phase 6):**
Facility-organized Event tickets only (§6.3). Premium sessions, session
tickets and master payouts follow Q12–Q13 decisions.

---

# 12. Recommendations

**Database concepts (high level only — no migrations now):**

* Model the Session as a **separate entity referencing an optional parent
  Event**, rather than a self-referencing single table or a `kind` flag on
  `sauna_events`. Sessions and Events differ in lifecycle, conductor model,
  capacity semantics and (future) pricing; forcing them into one row shape
  buys nothing and costs clarity. This *supersedes* the "kind on the same
  object" wording of USER_MODEL §1.6 (see §13).
* Conductors as a junction (session ↔ master with role + consent status),
  parallel to `sauna_event_masters` (which remains as the event lineup layer).
* Reservations: evolve `event_registrations` toward "target = Event XOR
  Session" (one table, exclusive reference) rather than duplicating the
  reservation machinery per object.
* Session themes as a dictionary table (the `certificate_types` pattern).
* Organizer of record on Events as an exclusive reference (facility XOR
  master) + `created_by` actor attribution everywhere (USER_MODEL G5).
* Everything lands in versioned migrations (USER_MODEL G3) — the current
  schema-only-in-Supabase state must end before this model is built on.

**UI concepts (directional, not designs):**

* Session card as a reusable unit (theme badge, time, master avatar+level,
  capacity state) used in: event timelines, "tonight" feeds, master profiles,
  facility pages, map popups.
* Event page = header + session timeline; master profile gains "upcoming
  sessions"; facility page gains a ritual schedule.
* Share-first session/event pages: OG cards, guest-readable, single dominant
  CTA. Fix the broken PWA manifest metadata before promoting share links
  (REPOSITORY_AUDIT §8.10 — links currently unfurl with another project's
  name).

**Map:** implement §4 exactly; grades computed from data, precedence in one
place; satellites = confirmed future presence. Treat as a protected-area
change with explicit regression checks on clustering, filters, realtime.

**Search & filters:** §9 — kind/time/theme/master dimensions; dictionary-backed
themes; time-based queries ("tonight") need session start times to be
first-class, indexed data (note: FK/index debt in REPOSITORY_AUDIT §8.3 bites
here first).

**Notifications:** §9 order; reservation-lifecycle notifications are already a
USER_MODEL MVP item and must cover sessions from day one.

**Mobile:** §10 — measure master session-creation time as a product KPI; if
it exceeds ~1 minute on a phone, J8 will not happen.

---

# 13. Consistency with USER_MODEL.md

This document refines USER_MODEL §1.6 (written earlier the same day). Deltas,
all of which this document authoritatively supersedes:

| USER_MODEL §1.6 said | This model says |
|---|---|
| Sessions and Events are two parallel kinds — "a kind on the same underlying object" | Session is an **atom** that an Event may **contain**; separate entities, optional containment (§1, §3, §12) |
| Events are facility-organized | Events may be organized by a facility **or a master**; paid master-organized events still gated on Q12–Q13 (§2.1) |
| Sessions confirmed by the organizing master; events by facility staff | Generalized: **the organizer of the reserved object confirms** (§5.4) |
| Sessions not separately ticketed | Still true today; §6.1 defines the future ladder (included → premium add-on → session ticket) without changing the present |

Unchanged and still binding from USER_MODEL: the three-layer ownership model,
owner ⊇ manager, single owner per sauna, review decisions (012, 013),
affiliation-as-consent (Q11 default), the MVP security items (§6.1–6.3), and
the private-host test ("does this work for one person with a garden sauna?"
— answer here: yes, a host's sauna hosts standalone sessions and small events
identically).

Open questions Q11–Q13 in USER_MODEL remain open and apply to this model
unchanged.

---

# 14. Open Questions (new, this model)

1. **Recurring sessions.** A master's weekly ritual is the natural recurring
   object (ROADMAP Phase 4 lists recurring events). Recommendation: recurrence
   as a *template that stamps out independent Session instances* — never a
   single mutating record. Decide before Step 2 ships, or masters will feel
   the pain weekly.
2. **Multi-venue Events.** The model keeps the door open (§3, facility
   inheritance). Decide only when a real city-festival partner appears.
3. **Session duration & scheduling granularity.** Is duration required
   (enables timeline rendering and conflict warnings) or optional (lower
   friction)? Recommendation: optional with a sensible default (~15 min).
4. **Event-grade pulse for festival satellite venues** (§4.1 EVENT trigger
   includes event-sessions at non-primary facilities) — confirm this is the
   desired behaviour when multi-venue arrives; irrelevant until then.
5. **Do managers confirm session registrations at their facility by default**
   (§5.4 says yes, "they run the door") — or only when the conducting master
   delegates? Decide with Step 2; default: yes, both may confirm.
