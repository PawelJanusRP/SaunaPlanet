# SaunaPlanet Business Workflows

Status: AUTHORITATIVE central reference for the platform's business
workflows. **Future sprint planning should start here** (see the final
section for how).

Created: 2026-07-11. Product documentation only — no implementation details,
no SQL, no UI design. The repository is the source of truth for what is
implemented today; the documents below are the source of truth for the
vision each workflow points at:

* `docs/USER_MODEL.md` — personas, ownership, permissions (who may do what)
* `docs/EVENT_SESSION_MODEL.md` — Event/Session semantics, reservations,
  publication statuses (Decision 015)
* `docs/PLATFORM_WORKSPACES.md` — where the work happens (workspaces)
* `docs/DECISIONS.md` — binding product decisions (001–015)

Each workflow carries a **Status** so planning can see at a glance what
exists: `Implemented` / `Partial` / `Future`.

Workflow index:

| # | Workflow | Status |
|---|---|---|
| W-01 | User discovers a sauna | Implemented |
| W-02 | User joins an event | Implemented (no notifications) |
| W-03 | User publishes a review | Implemented |
| W-04 | Owner onboarding | Partial (manager path only) |
| W-05 | Owner manages facilities | Partial |
| W-06 | Owner creates an event | Implemented (SP-034) |
| W-07 | Sauna Master onboarding | Implemented (verification badge future) |
| W-08 | Sauna Master creates a session | Future (planned: SP-036) |
| W-09 | Sauna Master creates an event | Future (Decision 015) |
| W-10 | Owner invites a Sauna Master | Partial (admin-side only) |
| W-11 | Sauna Master applies to an event | Future |
| W-12 | Public Sauna Master discovery | Implemented |
| W-13 | Contacting a Sauna Master | Future |
| W-14 | Reservation moderation | Implemented (notifications future) |
| W-15 | Administration | Implemented (disputes/audit future) |
| W-16 | Sauna Master affiliation | Future (planned: SP-035, Decision 016) |

---

# W-01 · User discovers a sauna

**Status:** Implemented.

**Purpose:** turn a spatial question ("where can I sauna?") into an
experience decision ("this sauna, this event, this master") — the top of
every funnel and the majority of traffic (guests included).

**Actors:** Guest, Registered User.

**Trigger:** opening the map (primary interface, Decision 005), a shared
link, or the `/sauny` list.

**Main flow:**

```
Map → browse markers / clusters / master satellites
    → filters (city on /sauny; map filters)
    → sauna popup → Sauna Profile
    → photos · ratings · reviews · upcoming events · resident masters
    → Favorite (logged in) / "I'm Going" on an event
```

**Alternative flows:**

* Entry via shared event/master link instead of the map (J8 — the link must
  convert on its own; see W-12).
* Guest hits a write action (favorite, review, registration) → registration
  wall → returns to the same object after signup.

**Future extensions:** session-level discovery ("what ritual tonight near
me" — the mobile killer query, EVENT_SESSION_MODEL §9), theme/time/master
filters, EVENT vs SESSION pulse grades on the map (EVENT_SESSION_MODEL §4),
"tonight" feed, followed-master notifications.

**Related workspaces:** none (public platform); Personal Workspace stores
the outcomes (favourites, interests).

**Related entities:** saunas, sauna_photos, sauna_reviews, sauna_events,
sauna_masters, user_favorites, user_event_interests.

---

# W-02 · User joins an event

**Status:** Implemented (SP-022); notifications and cancellation deadline
missing (USER_MODEL §6.9–6.10).

**Purpose:** the Core Product Loop's transaction — convert discovery into
attendance with organizer-controlled capacity.

**Actors:** Registered User; the organizer confirms (see W-14).

**Trigger:** "Zapisz się" on an upcoming event page.

**Main flow:**

```
Event page → details (date, price, spots left)
  → Zapisz się → reservation PENDING
  → organizer approves (W-14) → CONFIRMED
  → user attends → review becomes available after the event (W-03)
```

**Alternative flows:**

* Event full → registration blocked ("Brak miejsc"); capacity is enforced at
  confirmation, pending requests may exceed it.
* User cancels own registration (pending or confirmed) at any time.
* Informal "Idę" interest — no reservation, no approval, a public count.
* Organizer rejects → status cancelled (silently today — the notification
  gap).

**Future extensions:** e-mail/push notifications for confirm/reject/cancel
(MVP gap), cancellation deadlines, waiting lists with offer/expiry
(EVENT_SESSION_MODEL §5.5), session-level reservations (Event XOR Session,
§5.1), paid reservations (W-Future: Payments), check-in at the door.

**Related workspaces:** Personal Workspace (my reservations on
/profile/events); Owner Workspace (the other side, W-14).

**Related entities:** sauna_events, event_registrations,
user_event_interests, (future) sessions, transactions.

---

# W-03 · User publishes a review

**Status:** Implemented (SP-002, SP-021); self-review ban not yet enforced.

**Purpose:** build the trust layer that feeds ratings and (future)
rankings — reviews are the currency of the ecosystem.

**Actors:** Registered User (author — reviews always belong to the author,
never to the reviewed party).

**Trigger:** visiting a sauna page (facility review) or a past event page
(event review); upcoming events accept comments instead.

**Main flow:**

```
Sauna or past event → rate (1–5 stars) + optional text → published immediately
Upcoming event → comment (pre-event discussion)
Ratings aggregate → sauna rating, event history rating, (future) master ranking
```

**Alternative flows:**

* Author deletes own review/comment; moderator removes abusive content
  (W-15).
* One review per user per happening (a festival-goer may review the event
  and, in the future, each attended session separately).

**Rules (binding decisions):** no attendance requirement (Decision 012);
owners/managers never review their own facility, organizers never review
their own happenings (Decision 013 — enforcement pending).

**Future extensions:** session reviews as the primary master-ranking source
(SP-023, EVENT_SESSION_MODEL §7), one public response per review by the
reviewed party (badged), report/flag system.

**Related workspaces:** Personal Workspace (my reviews); Owner Workspace and
Master Studio (read-only review sections).

**Related entities:** sauna_reviews, event_reviews, event_comments,
(future) session reviews, rankings.

---

# W-04 · Owner onboarding

**Status:** Partial — the manager application exists (admin-approved); the
ownership concept, claim flow and submitter-becomes-owner are missing
(USER_MODEL G1–G2, J2–J3).

**Purpose:** move a facility from platform-listed (imported) to
owner-operated — the prerequisite for self-service and, later, payouts.

**Actors:** Registered User (future owner), Admin/Moderator (verifier),
future: existing facility Owner (approves managers).

**Trigger:** an owner finds their facility already listed (PTS import), or
submits a new one.

**Main flow (target, per USER_MODEL §3.2):**

```
Registration → find own facility
  → CLAIM (with evidence) → verification (admin/moderation)
  → owner membership granted → Owner Workspace appears in the avatar menu
  → owner invites managers (they accept) → facility is self-operating
```

**Alternative flows:**

* **New facility:** submit → moderation approves → submitter becomes owner
  (J3 — the grant at the end is not yet implemented).
* **Today's interim path:** "Zostań managerem" on the sauna page → admin
  approves → manager membership (no owner role yet; admin remains the
  fallback approver for ownerless saunas).
* Claim disputed → admin resolves (never another user).

**Future extensions:** evidence standards (business e-mail domain, phone,
document — USER_MODEL Q5), owner role in the membership relationship,
ownership transfer (admin-confirmed), e-mail-redeemable manager invitations,
organization accounts for chains, private-host onboarding (same workspace,
listing-creation entry — USER_MODEL §2.8).

**Related workspaces:** Owner Workspace (the destination); Admin (verifier).

**Related entities:** saunas, sauna_managers (today: the whole membership
model), sauna_submissions, (future) ownership claims, invitations.

---

# W-05 · Owner manages facilities

**Status:** Partial — workspace shell, context, dashboard, reservations and
events exist (SP-031/033/034); facility profile editing, photos and team
management still run through the admin panel.

**Purpose:** the daily operating loop of the supply side — "what needs me
today?" answered in under a minute on a phone.

**Actors:** Owner, Manager (owner ⊇ manager; money and membership control
are owner-only — USER_MODEL §3.2).

**Trigger:** opening the Owner Workspace ("Panel obiektu") from the avatar
menu.

**Main flow:**

```
Owner Workspace → Active Facility Context (one facility, or "All facilities")
  → Dashboard: Today Queue (pending registrations first), managed
    facilities, upcoming events, quick actions
  → Reservations (W-14) · Events (W-06) · [future: Facility profile,
    Photos, Team, Reviews, Statistics, Settings]
```

**Alternative flows:**

* Single facility: the workspace *is* that facility — no switcher friction.
* Multiple facilities: switcher + "All facilities" aggregate (merged queues;
  every item deep-links into its facility context).
* Membership role differs per facility (owner of A, manager at B) — the
  workspace renders per-context capabilities.

**Future extensions:** the full section map of PLATFORM_WORKSPACES §4.2
(facility profile, photos, team with invitations, statistics, settings),
badge counts on navigation, event/session proposals queue (W-09/W-11),
check-in mode, payout configuration (owner-only, Phase 6).

**Related workspaces:** Owner Workspace (this is its charter); Admin panel
shrinks as sections ship here.

**Related entities:** sauna_managers, saunas, sauna_events,
event_registrations, sauna_photos, sauna_reviews.

---

# W-06 · Owner creates an event

**Status:** Implemented (SP-034).

**Purpose:** facility self-service for the platform's strategic object —
events published by the people who run the venue, not by admins.

**Actors:** Owner or Manager of the facility (also Admin/Moderator).

**Trigger:** "Dodaj wydarzenie" in Owner Workspace → Events.

**Main flow:**

```
Owner Workspace → Events → select facility
  (= active context, or the account's only facility)
  → Create event (title, date, time, price, capacity, description)
  → published immediately (organizer of record = the facility)
  → reservations open (W-02) → moderation queue fills (W-14)
```

**Alternative flows:**

* "All facilities" context with 2+ facilities → creation unavailable until a
  concrete facility is selected (an event always belongs to one facility).
* Edit or delete an upcoming event from the same list; past events stay
  read-only (review history).
* Admin creates events from the map (same creation path).

**Future extensions:** compose the event's **session timeline** and invite
conductors per session (EVENT_SESSION_MODEL §3, PLATFORM_WORKSPACES §4.2
Happenings — the "one wizard, not five pages" flow), publication lifecycle
with Draft and Cancelled states (EVENT_SESSION_MODEL §2.3 — cancel with
cascade + notifications instead of delete), recurring events, ticketing
(Phase 6).

**Related workspaces:** Owner Workspace (primary place for owner event
management).

**Related entities:** sauna_events, sauna_managers (authorization),
sauna_event_masters (lineup), event_registrations, (future) sessions.

---

# W-07 · Sauna Master onboarding

**Status:** Implemented (SP-015, SP-017); verification badge and
profile-claim flow are future.

**Purpose:** onboard the platform's differentiator — the professional whose
credibility (level, certificates, reviews) users trust.

**Actors:** Registered User (applicant), Moderator (approval), Admin (may
create profiles directly).

**Trigger:** "Zostań saunamistrzem" self-registration.

**Main flow:**

```
Registration → master application (bio, level) → PENDING
  → moderation approves → public master profile (/masters/[id])
  → add certificates (each moderated) → satellite presence on the map
    once assigned to events (W-10)
```

**Alternative flows:**

* Rejected application (with reason).
* Admin-created historical profiles without accounts — a future claim flow
  ("this is me") links them.
* Level changes go through moderation (level implies certification).

**Future extensions:** Master Studio as the professional home
(PLATFORM_WORKSPACES §5 — planned as SP-035), verified badge (Phase 7 —
verification distinct from certification), affiliations with facilities
(W-16, part of SP-035; affiliation = standing consent to publish sessions
there), enforced 1:1 user↔profile integrity and own-profile-only editing
(USER_MODEL MVP §6.1 — security precondition for all master self-service,
in scope of SP-035).

**Related workspaces:** Master Studio (future); Admin (moderation queues).

**Related entities:** sauna_masters, master_certificates,
certificate_types, profiles.

---

# W-08 · Sauna Master creates a session

**Status:** Future — **planned as SP-036 (Sauna Sessions)**, after SP-035
delivers affiliations (W-16) and profile integrity; the G13 model gap;
step 1–2 of the EVENT_SESSION_MODEL adoption path.

**Purpose:** the J8 acquisition loop: masters as content creators whose
shareable rituals bring their own audiences to the platform. Sessions are
**first-class entities independent from Events**:

```
FACILITY ↔ EVENT ↔ SESSION ↔ SAUNA MASTER
```

An Event may contain multiple Sessions. A Session happens at exactly one
facility and may have **one or more masters — the session ↔ master
relationship is many-to-many** (1..n conductors with roles: lead required,
plus support/guest; team Aufguss shows and championship duos are the normal
festival case — EVENT_SESSION_MODEL §3). Accountability stays singular: the
creator/lead conductor answers for the session. A verified master always
creates and manages their own sessions.

**Actors:** Sauna Master (creator, default lead conductor); Facility
(consent when required); Event organizer (for proposals into events).

**Trigger:** "Create session" in the Master Studio — designed for ≤60
seconds on a phone (the product KPI).

**Main flow:**

```
Master Studio → Create session
  → select sauna (defaults to home/affiliated facility)
  → date + time, theme (dictionary), capacity
  → PUBLISH (affiliated venue — affiliation is standing consent)
  → shareable link → master posts it to their social audience
  → registrations arrive → master confirms (W-14 semantics, master-side)
```

**Alternative flows (consent table, EVENT_SESSION_MODEL §2.2):**

* Non-affiliated venue → session request goes to the facility
  (pending → approved).
* Proposal into an existing Event → the Event organizer approves.
* Facility staff creates the session and invites the master → the master
  accepts (two-sided handshake; nobody conducts without consent).
* Team sessions: 1..n conductors with roles (lead required).

**Future extensions:** recurrence templates stamping independent instances
("every Thursday 20:00"), session themes dictionary, SESSION pulse grade on
the map + conductor satellite, paid sessions (gated on master payout model,
Q12).

**Related workspaces:** Master Studio (My Sessions & Schedule, Share);
Owner Workspace (approving visiting masters' session requests).

**Related entities:** (future) sessions, session conductors, session
themes; sauna_masters, saunas, reservations.

---

# W-09 · Sauna Master creates an event

**Status:** Future. Binding product rules: **Decision 015**;
model: EVENT_SESSION_MODEL §2.1 + §2.3.

**Purpose:** let active masters organize larger productions (a
master-branded sauna night, a touring show) even at facilities not yet
active on SaunaPlanet — without ever bypassing a managed facility's
authority over its own name.

**Actors:** verified Sauna Master (creator + organizer of record); Facility
Owner/Manager (approver, when the facility is managed); Admin (optional
review gate).

**Trigger:** "Create event" in the Master Studio (future "Organize"
section).

**Main flow:**

```
Verified Sauna Master → Create Event → Select Facility
        │
        ├─ facility HAS an active owner/manager (MANAGED)
        │    → event enters PENDING FACILITY APPROVAL
        │    → proposal appears in the Owner Workspace Today Queue
        │    → manager approves / rejects / requests changes
        │    → approved → PUBLISHED BY FACILITY
        │
        └─ facility has NO active owner/manager (UNMANAGED)
             → PUBLISHED BY SAUNA MASTER
               (users clearly see it is master-published,
                not officially confirmed by the facility)
```

**Alternative flows:**

* Manager requests changes → master edits → re-submits.
* Rejected → master may propose elsewhere; the event never publishes in the
  facility's name.
* Optional Pending Admin Review gate (per platform policy) before
  publication.
* A previously unmanaged facility gains an owner later → existing
  master-published events remain valid; the new owner gains approval
  authority for future proposals only.

**Principles (Decision 015):**

* A master is **never blocked** from creating events because a facility is
  inactive on the platform.
* A master **cannot officially publish on behalf of a managed facility**
  without the manager's approval.
* Creator, organizer, facility, participating masters, publication status
  and approval status are **independent concepts** — never one role.
* Intended lifecycle: Draft → Pending Facility Approval → Pending Admin
  Review (optional) → Published by Facility / Published by Sauna Master →
  Rejected / Cancelled (long-term vision, not an implementation commitment).

**Future extensions:** paid master-organized events (gated on the master
payout model, Q12–Q13 — until then free-admission), revenue split schedules
(master ↔ hosting facility), session timelines inside master events.

**Related workspaces:** Master Studio (creation, "Organize"); Owner
Workspace (approval queue); Admin (optional review).

**Related entities:** sauna_events (with organizer of record + publication
status), saunas, sauna_masters, sauna_managers (management state decides
the path), (future) sessions.

---

# W-10 · Owner invites a Sauna Master

**Status:** Partial — assignments exist (`sauna_event_masters`,
admin-side); the master's accept/decline half of the handshake is missing.

**Purpose:** staff an event's lineup with consenting professionals —
facilities *invite*, masters *accept*, never the reverse framing.

**Actors:** Owner/Manager (inviter), Sauna Master (invitee).

**Trigger:** managing an event (or, future, a session) in the Owner
Workspace.

**Main flow (target):**

```
Owner Workspace → event → Invite Sauna Master
  → invitation appears in the master's Studio Today Queue
  → master accepts → assignment approved → master appears in the lineup,
    satellite appears on the map (confirmed future presence)
  → master declines → no assignment, owner informed
```

**Alternative flows:**

* Today: admin/moderator assigns masters from the event page (interim,
  one-sided).
* Per-session conducting invitations once sessions exist (lead/support
  roles).
* Affiliation invitation (facility ↔ master standing relationship, W-16)
  — a separate, longer-lived handshake than a single event.

**Future extensions:** invitation notifications (push deep-link to the
queue item), schedule-conflict warnings for the master, master marketplace
("book this master" with payment — far future).

**Related workspaces:** Owner Workspace (invite side), Master Studio
(respond side).

**Related entities:** sauna_event_masters (status workflow),
sauna_masters, sauna_events, (future) affiliations, session conductors.

---

# W-11 · Sauna Master applies to an event

**Status:** Future (the mirror image of W-10).

**Purpose:** let masters proactively join productions — a touring master
finds a festival and offers a show; supply finds demand in both directions.

**Actors:** Sauna Master (applicant), event organizer — facility staff or
organizing master (reviewer).

**Trigger:** an event page or the Studio's event discovery.

**Main flow:**

```
Master → browse upcoming events → Apply (offer to conduct / propose a session)
  → application lands in the organizer's Today Queue
  → organizer accepts → assignment / session added to the event
  → organizer declines → application closed (with reason)
```

**Alternative flows:**

* Proposal of a concrete **session into the event** (with time/theme) vs a
  general "I'd like to perform" application — both resolve in the same
  approval queue (EVENT_SESSION_MODEL §2.2).
* Organizer requests changes (different slot, different theme).

**Future extensions:** discovery aids (events looking for masters,
matching by theme/level/city), application notes and portfolios (career
history auto-builds — PLATFORM_WORKSPACES §5.1).

**Related workspaces:** Master Studio (apply), Owner Workspace (review).

**Related entities:** sauna_events, sauna_event_masters, (future) sessions,
session proposals.

---

# W-12 · Public Sauna Master discovery

**Status:** Implemented (map satellites, /masters directory, cross-linked
detail pages).

**Purpose:** make the ecosystem triangle walkable in every direction —
users discover experiences, not addresses:

```
        SAUNA ⟷ EVENT ⟷ SAUNA MASTER
          ↑                   ↑
          └───────────────────┘
```

* sauna → its events → their masters
* master → their events → the saunas hosting them
* event → its masters and its sauna
* map → master satellite → master profile

**Actors:** Guest, Registered User.

**Trigger:** any entry point: map (satellite avatars orbit saunas with
upcoming assignments), /masters directory (grouped by home sauna), a sauna
page (resident/performing masters), an event page (lineup), a shared link.

**Main flow:** every page of the triangle links to the other two; satellites
appear only for confirmed future presence (Decision 004, generalized by
EVENT_SESSION_MODEL §4.2.4).

**Alternative flows:** discovery via reviews ("who led the best-rated
ceremony?") — future ranking surfaces.

**Future extensions:** sessions as the third happening surface (master's
ritual schedule on their profile), rankings (SP-023), followed masters with
notifications, share-optimized profile cards (OG metadata), master search
by theme/level/city.

**Related workspaces:** none (public platform); Master Studio controls the
public profile content.

**Related entities:** sauna_masters, sauna_event_masters, sauna_events,
saunas, master_certificates.

---

# W-13 · Contacting a Sauna Master

**Status:** Future.

**Purpose:** close the loop between discovering a master and working with
them (a user asking about a ritual, a facility scouting talent) — inside
the platform, where trust and history live.

**Actors:** Registered User or Owner/Manager (initiator), Sauna Master
(recipient).

**Trigger:** "Contact" on a master's public profile.

**Main flow (target):**

```
Master profile → Start chat (in-platform)
  → conversation in both parties' inboxes
  → (facility context) may escalate into an invitation (W-10)
```

**Alternative flows:**

* **Published contact information** (social links, e-mail) — optional,
  shown only if the master chooses to publish it. External contact is
  always master-controlled.

**Principles:** in-platform chat is the **preferred future communication
mechanism** — it keeps masters reachable without exposing personal data,
and keeps the relationship (and future marketplace transactions) on the
platform. External methods are a master-controlled option, never a
requirement.

**Future extensions:** chat notifications, facility↔master negotiation
threads attached to invitations, anti-abuse controls (block/report, rate
limits), business inquiries routed to the Studio's Today Queue.

**Related workspaces:** Master Studio (inbox, contact settings), Personal
Workspace / Owner Workspace (initiator side).

**Related entities:** sauna_masters, (future) conversations/messages,
notification preferences.

---

# W-14 · Reservation moderation

**Status:** Implemented (SP-022/SP-033); notifications are the known gap
that leaves the loop open (USER_MODEL §6.9).

**Purpose:** the highest-frequency business action on the platform — the
organizer clearing the morning queue decides whether guests trust
reservations at all.

**Actors:** Owner/Manager (facility-organized happenings); future: Sauna
Master (own sessions and master-organized events) — "the organizer of the
reserved object confirms" (EVENT_SESSION_MODEL §5.4). Admin/moderator
override always exists.

**Trigger:** a pending reservation appears in the Owner Workspace Today
Queue (dashboard) or the Reservations module.

**Main flow:**

```
Reservation PENDING → Owner Workspace Today Queue
  → approve → CONFIRMED (capacity-guarded: confirms blocked beyond capacity)
  → reject → CANCELLED
  → [future] user notified of the outcome (e-mail, then push)
```

**Alternative flows:**

* "All facilities" context: merged queue across the chain, each item
  deep-linking into its facility.
* User cancels while pending → item disappears from the queue.
* Organizer cancels a confirmed reservation (with notification, future).

**Future extensions:** outcome notifications (the MVP gap), waiting-list
promotion with offer/expiry, cancellation deadlines, door list / check-in
mode, swipeable queue with undo (mobile), session-level queues for masters.

**Related workspaces:** Owner Workspace (today), Master Studio (future,
same queue-row muscle memory).

**Related entities:** event_registrations, sauna_events, sauna_managers,
(future) sessions, waiting lists, notifications.

---

# W-15 · Administration

**Status:** Implemented (9-tab admin panel); report system, audit log and
formal dispute tooling are future.

**Purpose:** keep the platform trustworthy (content) and legitimate
(roles, ownership) — while deliberately shrinking as workspaces absorb
self-service (PLATFORM_WORKSPACES §3.3).

**Actors:** Moderator (content-scoped), Administrator (trust-scoped) —
moderation fixes content; only admins change who holds power.

**Trigger:** daily queue sweep; escalations; (future) user reports.

**Main flow:**

```
Admin panel → pending queues:
  sauna submissions · master registrations · certificates ·
  manager applications (fallback for ownerless saunas) →
  approve / reject with reason
+ content moderation: facilities, events, reviews (edit/remove)
+ trust operations (admin only): roles, dictionaries, user management
```

**Alternative flows:**

* **Verification** (future, Phase 7): facility and master verification
  badges; ownership-claim evidence review (W-04).
* **Dispute resolution** (future): ownership disputes, master↔facility
  conflicts (e.g. a contested cancelled session), forced ownership
  transfer — always admin, always audited.
* Optional "Pending Admin Review" gate for events per policy
  (EVENT_SESSION_MODEL §2.3).

**Future extensions:** report/flag system (moderation today is pull-based
queues only), moderation audit log (mandatory the day payments launch),
platform settings panel (SP-027), payment operations (refunds, disputes,
payout holds — Phase 6).

**Related workspaces:** Administration (the fourth workspace on the shared
skeleton); every capability shipped in Owner Workspace / Master Studio
retires the corresponding admin workflow.

**Related entities:** all moderated content; profiles (roles),
sauna_submissions, sauna_managers, master_certificates.

---

# W-16 · Sauna Master affiliation

**Status:** Future — **planned as SP-035 (Master Studio Foundation)**;
core Studio architecture, not an add-on (Decision 016; model:
PLATFORM_WORKSPACES §5.2).

**Purpose:** establish the standing master↔facility relationship that the
rest of the master economy reads: it replaces the transitional "home sauna"
concept and carries consent (session publication, event creation),
presentation (primary affiliation) and — later — verification and trust.

```
SAUNA MASTER ↔ MASTER AFFILIATION ↔ SAUNA FACILITY
```

**Actors:** Sauna Master, Facility Owner/Manager — either side may
initiate; the other side always consents explicitly.

**Trigger:** master requests affiliation (Studio → Affiliations), or the
facility invites a master (Owner Workspace → Team).

**Main flow:**

```
Request or invitation → affiliation PENDING
  → other side approves (Today Queue on the respective side)
  → AFFILIATION ACTIVE:
      · standing consent to publish sessions at the facility (W-08)
      · appears in the Studio (Affiliations) and the facility Team roster
      · one affiliation may be marked PRIMARY (successor of home sauna)
  → either side may end the affiliation (end date recorded — history kept)
```

**Alternative flows:**

* Declined request/invitation (with reason).
* Changing the primary affiliation (master's choice among active ones).
* Migration: existing `home_sauna_id` values become primary affiliations;
  the column stays readable during transition, then retires (no new feature
  may depend on it).

**Model highlights (product level, no schema):** status, type (resident /
guest / alumni…), primary flag, start/end dates, verification (Phase 7),
permission to publish sessions, permission to create events, future trust
level — see PLATFORM_WORKSPACES §5.2 for the full table.

**Future extensions:** facility-verified badges on public profiles, trust
levels feeding auto-approvals and rankings, revenue-split defaults for
master-organized happenings at the affiliated venue (Q12–Q13 era).

**Related workspaces:** Master Studio (Affiliations), Owner Workspace
(Team).

**Related entities:** sauna_masters, saunas, (future) master affiliations;
today's transitional `home_sauna_id`.

---

# Workflow Relationships

The workflows form the platform's loops:

```
DISCOVERY LOOP (demand):    W-01 → W-02 → W-14 → attendance → W-03 → W-01
MASTER GROWTH LOOP (J8):    W-07 → W-08 → share link → new users → W-01/W-02
SUPPLY LOOP:                W-04 → W-05 → W-06 → W-02/W-14
TALENT LOOP:                W-10 ⟷ W-11 (two directions of the same handshake)
                            anchored by W-16 (standing affiliation),
                            fed by W-12 (discovery) and W-13 (contact)
TRUST LOOP:                 W-03 + W-15 feed ratings, rankings, verification
```

Dependencies worth respecting in planning:

* W-08/W-09/W-11 (master self-service) depend on the master-profile
  integrity fixes (USER_MODEL §6.1–6.2) and the session/organizer model
  (G13) — security and model first, features second. The planned sequence
  encodes this: **SP-035** (Master Studio Foundation: integrity fixes +
  W-16 affiliations, retiring home-sauna as the primary model) →
  **SP-036** (Sauna Sessions: W-08), per Decision 016.
* W-16 is consent infrastructure for W-08 and W-09 — affiliation state
  decides where a master publishes without per-object approval.
* W-14's value is capped until notifications exist: a silently resolved
  reservation breaks W-02's promise.
* W-04 (ownership) is the attachment point for everything money-related;
  every workflow that touches revenue terminates at the owner of record.

---

# Future Workflows

Expected but not yet fully designed (each becomes a W-xx entry when it gets
a design):

* **Payments** — paid event tickets, owner payouts, commission, refunds
  (Phase 6, J5; one money path first: facility-organized event ticket).
* **Memberships / Subscriptions** — premium users, business accounts
  (Phase 9).
* **Marketplace** — private garden-sauna rentals: availability calendars,
  slot booking, host verification, address privacy (Phase 8, J6).
* **Certifications (extended)** — evidence attachments, issuing
  authorities, PTS as a certificate authority (USER_MODEL Q10).
* **Chat** — the W-13 mechanism generalized (user↔master, facility↔master,
  support threads).
* **Notifications** — the cross-cutting layer: reservation lifecycle first,
  then invitations, waitlists, followed masters; push deep-links into queue
  items.
* **Mobile workflows** — PWA installability, offline door list, one-minute
  session creation, swipe-to-confirm queues; later the Expo app (SP-030)
  reusing the workspace navigation model.
* **Federation / Associations** — partnerships with sauna associations
  (PTS): bulk-verified facilities, shared calendars, certificate
  authorities.
* **Competitions** — championship events with juries, scoring and results
  feeding master profiles and rankings.
* **Rankings** — sauna and master rankings from review aggregates (SP-023)
  with admin-tunable parameters (SP-027).
* **Loyalty programs** — attendance streaks, facility-issued perks,
  follower rewards (far future; depends on check-in/attendance data).

---

# How sprint planning should use this document

1. **Start every sprint definition from a workflow**, not from a screen or
   a table: name the W-xx being advanced, its current Status, and which
   step of its Main flow the sprint moves from Future/Partial toward
   Implemented. (SP-034, for example, advanced W-06 from Future to
   Implemented and prepared the queue surface W-09 will need.)
2. **Check the workflow's dependencies** (Workflow Relationships above)
   before scoping — especially the security preconditions for master
   self-service and the notification gap for anything reservation-shaped.
3. **Update the Status column and the workflow entry** in this document as
   part of each sprint's documentation step (Definition of Done), the same
   way FEATURES.md and SPRINT_HISTORY.md are updated.
4. Detailed semantics stay in the specialist documents (USER_MODEL,
   EVENT_SESSION_MODEL, PLATFORM_WORKSPACES) — this document links to them
   instead of duplicating; new workflow-level decisions land in
   DECISIONS.md and are referenced here.
