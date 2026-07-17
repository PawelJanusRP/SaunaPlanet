# SaunaPlanet Platform Workspaces

Status: AUTHORITATIVE design reference for the **Owner Dashboard**, the
**Manager Dashboard** and the **Sauna Master Dashboard** (the "Master
Studio"). Read together with:

* `docs/USER_MODEL.md` — personas, ownership model, permission model
* `docs/EVENT_SESSION_MODEL.md` — Event/Session semantics, reservations, map
* `docs/WORKFLOWS.md` — the business workflows themselves (actors, triggers,
  flows, status) — the central reference for sprint planning

Where those documents define *who may do what* and *which workflow runs*,
this document defines *where and how they do it*. Conflicts resolve in favour of USER_MODEL (permissions)
and EVENT_SESSION_MODEL (happening semantics).

Created: 2026-07-11. Product architecture and UX design only — no code, no
migrations, no visual design (layouts described are structural intents, not
screens).

---

# 1. Purpose

SaunaPlanet has two business-critical user groups whose daily experience
decides whether the platform becomes self-operating or stays admin-operated:

1. **Facility owners and managers** — supply side: facilities, events,
   sessions, reservations.
2. **Sauna masters** — the differentiator: content creators with their own
   audiences (EVENT_SESSION_MODEL §1.2, journey J8).

Today both are served by fragments: a manager panel embedded in `/profile`,
master editing via an unscoped modal, and everything else routed through the
admin panel. This document designs the coherent platform that replaces that
fragmentation — **one platform, multiple workspaces**, scaling from a single
garden sauna to a facility chain, and from a first-time master to a touring
professional.

---

# 2. Design Principles

1. **One account, many workspaces.** Identity is singular; roles are additive
   (USER_MODEL §1.2). A workspace is a *context the account enters*, never a
   separate account, login or app. A person who is user + master + manager
   moves between three workspaces with two taps.
2. **Workspaces are queues first, pages second.** Business users open the
   platform to answer "what needs me today?" — pending registrations,
   invitations, unanswered reviews. Every workspace leads with an actionable
   today-view; browsing and settings come after.
3. **The phone is the primary terminal.** Managers confirm registrations at
   the front desk; masters publish sessions from the sauna bench. Every
   workflow below must be completable on a phone in under a minute — this is
   a hard requirement, not an aspiration (CLAUDE.md mobile-first; ROADMAP
   mobile track; EVENT_SESSION_MODEL §10 KPI).
4. **The master is a creator, not an employee.** The Master Studio borrows
   its mental model from creator platforms (a studio with content, audience,
   stats and a share button), not from HR software. Facilities *invite*;
   masters *accept* — never the reverse framing.
5. **Same skeleton everywhere.** All workspaces share one anatomy (§3.2) so
   learning one teaches all — and so the eventual Expo app reuses one
   navigation model (§9).
6. **Scale by aggregation, not by redesign.** The owner of one sauna and the
   operator of twelve see the same workspace; the chain operator gets a
   facility switcher and an "all facilities" aggregate on top. Nothing about
   the single-facility experience changes when a second facility appears.
7. **Every capability shown is a capability held.** Workspaces render from
   the permission model (USER_MODEL §4) — a manager sees no billing, a
   support conductor sees no session-edit. No disabled buttons explaining
   what you can't do; absent is absent.

---

# 3. Common Design Language (Part 3)

## 3.1 Platform anatomy — one hub, four spaces

```
                    ┌─────────────────────────────┐
                    │  PUBLIC PLATFORM             │
                    │  map · events · sessions ·   │
                    │  saunas · masters            │
                    └──────────────┬──────────────┘
                                   │ avatar menu = workspace hub
        ┌──────────────┬───────────┼───────────────┬──────────────┐
        ▼              ▼           ▼               ▼              ▼
   MY PROFILE     OWNER/MANAGER   MASTER        ADMINISTRATION
   (everyone)     WORKSPACE       STUDIO        (moderator/admin)
   /profile       "Panel obiektu" "Studio"      /admin (exists)
                  (if ≥1 sauna    (if linked    
                  membership)     master profile)
```

* The **avatar menu** is the single hub: it lists exactly the workspaces the
  account holds, plus the personal profile. No workspace → no entry. This is
  the whole navigation contract of Part 3: *Profile → Owner Workspace →
  Master Studio → Administration*, each one tap from anywhere.
* **`/profile` returns to being purely personal** (favourites, interests, my
  reservations, account settings). The manager panel currently embedded there
  migrates into the Owner/Manager Workspace. `/profile` is the consumer "me";
  workspaces are the professional "me".
* **Deep links are workspace-aware:** a push notification about a pending
  registration opens the relevant workspace queue directly, not a homepage.

## 3.2 Shared workspace skeleton

Every workspace is built from the same five elements:

| Element | Behaviour |
|---|---|
| **Context bar** | workspace name + context switcher (facility switcher for owners; nothing to switch for most masters) + back-to-platform |
| **Today view** (landing) | action queue: things awaiting this person, soonest/most-urgent first, each item resolvable inline |
| **Sections** | 4–7 top-level sections as tabs — horizontally scrollable chips on mobile, sidebar on desktop, native tabs in Expo |
| **Badges** | pending counts on sections and on the workspace entry in the avatar menu ("Panel obiektu • 3") |
| **Action sheet pattern** | all create/confirm/edit actions open as bottom sheets (mobile) / modals (desktop) — never separate form pages |

Shared component vocabulary (one implementation, used everywhere):
**happening card** (event or session: kind badge, time, theme, conductor
avatars, capacity state), **queue row** (who/what/when + approve/reject),
**review card**, **person card** (avatar, name, role/level, status),
**stat tile** (number + trend). These map 1:1 to the reusable-component debt
already identified (REPOSITORY_AUDIT §8.7 — ~6 copy-paste moderation
components; this vocabulary is their replacement).

## 3.3 Relationship to the admin panel

The admin panel (9 tabs, exists) keeps the same skeleton but stays a separate
workspace. The long-term trajectory (USER_MODEL §2.7): every admin tab that
exists because owners/masters *can't yet self-serve* — facility edits, event
CRUD, photo uploads — shrinks as the workspaces absorb the work. Admin
retains: moderation queues, roles, dictionaries, disputes, platform settings.

---

# 4. Owner / Manager Workspace (Part 1)

One workspace serves both owners and managers; the difference is which
sections and actions render (owner ⊇ manager, USER_MODEL §3.2). Entry
condition: ≥1 approved membership (`owner` or `manager` role) on any sauna.

## 4.1 Context model — one sauna to a chain

* **Single facility** (the overwhelmingly common case, including future
  private hosts): the workspace *is* that facility; no switcher friction.
* **Multiple facilities:** context bar gains a facility switcher +
  an **"All facilities"** aggregate context. The aggregate shows merged
  queues (all pending registrations across the chain), portfolio status and
  cross-facility stats; every item deep-links into its facility context.
* Membership role may differ per facility (owner of A, manager at B) — the
  workspace renders per-context capabilities accordingly.

## 4.2 Sections

### Dashboard (Today)

The landing queue, in priority order:

1. Pending registrations for upcoming happenings (inline confirm/reject —
   the highest-frequency action in the entire platform).
2. Today's and tomorrow's happenings (happening cards; tap → manage).
3. Pending requests: manager applications (owner only), master session
   proposals, **master event proposals awaiting facility approval
   (Decision 015 — approve / reject / request changes)**, affiliation
   requests, masters awaiting session-assignment consent.
4. New reviews since last visit.
5. Status alerts: facility pending moderation, unverified claim, missing
   photos, (future) expiring payout config.

### My Saunas (portfolio)

List of facilities with **status chips** forming the facility lifecycle:

```
draft → pending (moderation) → published → verified (Phase 7)
                                   └→ unpublished/closed (owner action)
```

Plus claim state where relevant (claim pending / claim verified). Single
facility: this section collapses into the context bar status chip.

### Facility profile (Edit sauna)

* Operational content — description, amenities, hours, contact: **manager+**.
* Identity — name, location, closing the listing: **owner** (moderation may
  review changes to identity fields; location changes affect the map).
* Address privacy toggle for private listings (future, EVENT_SESSION_MODEL /
  USER_MODEL §2.8).

### Photos

Facility gallery: camera-first upload (multi-select, client compression —
exists today), reorder, set cover, delete own facility's photos. Happening
photos are managed from the happening, not here.

### Happenings (Events & Sessions)

The operational calendar — list + week view of the facility's events and
sessions, per EVENT_SESSION_MODEL:

* **Create event** (manager+): details, timeframe, capacity, (future)
  ticketing; then compose its session timeline — add sessions, invite
  conductors per session (two-sided consent).
* **Create session** (manager+): standalone ritual with an assigned master
  (master must accept).
* **Approve/decline** master-proposed sessions at this facility and
  session-proposals into own events (EVENT_SESSION_MODEL §2.2).
* Edit, cancel (with cascade + notifications per EVENT_SESSION_MODEL §3),
  manage happening photos, share links (owners promote too).

### Reservations

Per-happening queues plus a merged "all upcoming" view:

* Confirm/reject with capacity guard (confirms blocked beyond capacity —
  USER_MODEL §6.10); counts per happening (confirmed/pending/capacity).
* (Post-MVP) waiting lists with offer/expiry (EVENT_SESSION_MODEL §5.5),
  cancellation-deadline display, export of the confirmed list ("door list").
* (Future) check-in mode: day-of list optimized for the front desk.

### Reviews

Facility reviews + happening reviews at this facility, newest first, rating
trends. (Post-MVP) owner/manager public responses — one response per review,
clearly badged. Never edit/delete of others' reviews (moderation's job;
report button instead).

### Team

The membership surface (owner-only for mutations; managers see the roster):

* Roster: owner, managers, **affiliated masters** (SP-016) as person cards.
* Approve/reject manager applications (owner; admin fallback for ownerless
  saunas — USER_MODEL §3.2).
* **Invite** a manager (by account; post-MVP by email with redeem-on-signup)
  and invite a master to affiliate; invitee always accepts explicitly.
* Remove a manager; leave (a manager may resign).
* Ownership transfer (initiate; admin confirms — USER_MODEL §3.2).

### Statistics

Read-only, per facility + aggregate: profile/happening views, registrations
(requested/confirmed/attended), review volume and average, follower-driven
traffic (future), fill rate per session theme ("herbal fills in 2 days, ice
in 6 hours") — the insight that closes the loop between stats and booking
masters. (Future) revenue dashboard, payout history.

### Settings

Facility-level: verification status and evidence (Phase 7), notification
preferences per facility, (future) payments/payout configuration —
**owner-only, always** (USER_MODEL §3.2 money line).

---

# 5. Master Studio (Part 2)

Entry condition: account linked to an approved master profile
(`sauna_masters.user_id` = self — after the USER_MODEL MVP integrity fixes).
Pending masters see a minimal "application pending" studio shell.

The Studio is a **career hub for an independent professional**: their content
(sessions), their audience (followers, share links), their reputation
(reviews, rankings, certificates) and their relationships (affiliations,
invitations) — with facilities as venues they work *with*, not bosses they
work *for*.

## 5.1 Sections

### Dashboard (Today)

1. **Invitations** awaiting response: session-conducting requests, event
   lineup assignments, affiliation offers — accept/decline inline (the
   two-sided handshakes of EVENT_SESSION_MODEL §2.2).
2. Pending registrations for own sessions (inline confirm — same queue row
   as the owner workspace, same muscle memory).
3. Today's/next conducting engagements (happening cards).
4. New reviews and rating movement.
5. Nudges: "your Friday ritual has no session yet" (recurrence, future),
   profile completeness, expiring certificate validity.

### My Sessions & Schedule

The creator's content surface:

* **Create session** — the flagship flow, designed for under 60 seconds on a
  phone (EVENT_SESSION_MODEL §10): venue (defaults to home/affiliated sauna),
  date+time, theme from dictionary, capacity, done. Non-affiliated venue →
  request goes to the facility (Q11); proposal into an event → to the
  organizer.
* Upcoming schedule: sessions I conduct (own + invited) and events I'm in
  the lineup of, chronological; conflicts warned (EVENT_SESSION_MODEL §3).
* Per session: edit, cancel (notifies registrants), registrations queue,
  **Share** (section below), photos.
* (Future) recurrence templates: "every Thursday 20:00" stamping independent
  instances (EVENT_SESSION_MODEL §14.1).

### Share (the growth surface)

Every session and event the master is part of gets a share block: canonical
link, prewritten social caption, (post-MVP) QR code and story-format card.
One tap opens the native share sheet. This is journey J8 as a feature — the
Studio treats sharing as a primary action, equal to creating.

### Public Profile

Edit own public presence: bio, avatar, gallery. Level is displayed, not
edited (level implies certification → changes via moderation, USER_MODEL
§2.4). A "view as public" toggle shows exactly what a guest sees.

### Certifications

Own certificates grouped by category (exists, SP-017): add → moderation;
pending badge visible only to self/moderation; evidence attachment (future).

### Career (History, Portfolio, Rankings)

* **Session & event history** — every past engagement, auto-accumulated:
  date, venue, theme, attendance (future), rating received. The portfolio
  *builds itself from work done* — a master who conducts is never asked to
  curate a CV.
* Highlights: pin best sessions/photos to the public profile (post-MVP).
* **Reviews**: all reviews of own sessions/happenings, rating trend;
  (post-MVP) public responses, same one-response rule as facilities.
* **Rankings** (SP-023): current position, contributing reviews, what moves
  it. Rankings read from session reviews first (EVENT_SESSION_MODEL §7).

### Affiliations

Facilities I'm affiliated with (primary affiliation highlighted): request
affiliation, accept facility invitations, leave. Affiliation = standing
consent to publish sessions there (USER_MODEL Q11) — the Studio states this
plainly, because it is the master's main reason to affiliate. This section
renders the affiliation model of §5.2 — it is core Studio architecture, not
an add-on.

### Followers & Audience (future)

Follower count and growth, notification reach ("312 people will be notified
when you publish"), which sessions converted followers. Framed as audience,
not vanity.

### Organize (future)

Master-organized **events** (EVENT_SESSION_MODEL §2.1): compose an event with
sessions at a consenting venue; free-admission until the payout model
(Q12–Q13), then ticketing and revenue splits. Renders only when the
capability unlocks.

### Statistics

Sessions conducted (month/quarter), registrations and fill rate, profile
views, share-link conversion ("your Instagram link brought 41 people" — the
number that proves J8 to the master), rating trend. (Future) earnings.

## 5.2 The Affiliation Model (core architecture — Decision 016)

> **Implementation status (SP-035, in review):** the minimal form ships as
> `master_affiliations` — lifecycle (pending/approved/rejected/ended),
> initiation direction, primary flag, provenance — with the transition
> rules enforced in the database (RLS + trigger). Type, verification,
> start/end-date semantics, session/event permissions and trust levels
> remain future columns, added when their features ship.

The single `home_sauna_id` on the master profile is a **temporary
transitional solution**. The Master Studio is built on its replacement — a
first-class, reusable business relationship:

```
SAUNA MASTER ↔ MASTER AFFILIATION ↔ SAUNA FACILITY
```

An affiliation is not a foreign key with a label; it is the object that
carries the master↔facility relationship's whole lifecycle. The product
model (no database columns defined yet) — an affiliation may define, among
other things:

| Aspect | Meaning |
|---|---|
| **Status** | the standard lifecycle: requested/invited → approved → ended (consistent with USER_MODEL §1.4 — every elevation is a workflow) |
| **Type** | the nature of the relationship: resident master, guest, alumni… (dictionary, extensible) |
| **Primary affiliation** | exactly one affiliation may be primary — the successor of "home sauna" for display, defaults and map grouping |
| **Start/end dates** | affiliations are historical facts, not just current state — the master's career timeline reads from them |
| **Verification** | (future, Phase 7) the facility or platform confirms the relationship is real — trust signal on the public profile |
| **Permission to publish sessions** | the operational core: an approved affiliation is standing consent to publish sessions at the facility without per-session approval (USER_MODEL Q11) |
| **Permission to create events** | whether the master may propose/publish events for this facility beyond the default Decision 015 rules |
| **Future trust level** | graded trust as history accumulates — a lever for auto-approval, rankings and (much later) revenue splits |

Design rules:

* **One relationship object, both directions.** Master requests / facility
  invites — both land in the same affiliation record with provenance
  (who initiated, who approved), like the manager membership model
  (USER_MODEL §3.2).
* **Affiliation is consent infrastructure.** Session publication (W-08),
  event proposals (W-09, Decision 015) and satellite/home presentation all
  *read* affiliations; none of them redefine the relationship locally.
* **`home_sauna_id` retires as the primary model in SP-035** — kept readable
  during transition, migrated into primary affiliations, then removed. No
  new feature may depend on it.
* Both workspaces surface the same records: the Studio's Affiliations
  section (master side) and the Owner Workspace Team section (facility
  side, PLATFORM_WORKSPACES §4.2) are two views of one relationship.

---

# 6. Product Model — Object Ownership & Capabilities (Part 4)

Consolidates USER_MODEL §4 and EVENT_SESSION_MODEL §2–5 into one reference.
"Owner of record" = accountable party; capabilities per role.
(M+ = manager and owner of the relevant facility; Org = organizer of record.)

| Object | Owner of record | Create | Edit | Delete | Approve | Invite | Publish | Cancel |
|---|---|---|---|---|---|---|---|---|
| **Sauna** | facility owner (person; future: org) | submitter / owner (private) / admin | operational: M+ · identity: owner | admin only (owner may *close*) | moderation approves listing; owner approves claims-adjacent requests | owner invites managers/masters | moderation → published; owner may unpublish | owner closes; admin removes |
| **Event** | organizer of record (facility XOR master) | M+ (for facility) · master (own, venue consent) · admin | Org (+M+ if facility-organized) | Org before publish; after publish → cancel, not delete | venue approves hosting (master-organized); moderation per policy | Org invites lineup/conductors | Org | Org (cascade to sessions + notifications) |
| **Session** | creator (master, or facility via staff) | master (affiliated: free; else venue consent) · M+ (with master's acceptance) · Org (into own event) | creator + lead conductor (+M+ at facility) | creator before publish; after → cancel | venue (non-affiliated), event Org (proposals), master (assignments) — all two-sided | creator invites co-conductors | creator (auto after required consents) | creator / lead / M+ / Org of parent event |
| **Photos** | the object they attach to | facility: M+ · happening: Org/creator+M+ · master gallery: the master | uploader + object controller | object controller + moderation | moderation (reports) | — | with the object | — |
| **Reviews** | the **author** (user) — never the reviewed party | any logged-in user (Decisions 012/013 constraints) | author | author + moderation (reviewed party may only *report* and, post-MVP, respond once) | — | — | immediate | — |
| **Reservations** | the **user** who holds it | user (self) | status: Org confirms/rejects · user cancels own | user cancels; Org cancels with notification | Org (capacity-guarded) | — | — | user / Org / cascade from happening |
| **Statistics** | derived — belong to the object's controller | system | nobody | nobody | — | — | visible to object controller (+admin) | — |

Three invariants worth restating:

* **Reviews are never owned by the reviewed.** Facilities and masters get
  visibility and (later) one public response — no edit, no delete, report only.
* **Reservations belong to the guest; their *status* belongs to the
  organizer.** Neither can act on the other's side of the record.
* **Money-adjacent controls (future) always terminate at the owner of
  record** — never at a manager, never at a support conductor.

---

# 7. MVP (Part 5)

MVP here = the workspace scope that makes facilities and masters
self-operating for the *current free platform* (aligned with USER_MODEL §6 —
its items 6.8/6.9/6.11 and G13 are prerequisites, not repeated here).

## 7.1 Owner / Manager Dashboard MVP — Required

1. Workspace shell: avatar-menu entry, context bar, Today queue with pending
   registrations (migrating the existing `/profile` manager panel).
2. Facility switcher (trivial when n=1; the data model assumes n≥1 from day
   one — no single-sauna assumptions).
3. My Saunas with status chips (existing statuses; claim state text-only).
4. Facility profile editing (operational fields) + photo management.
5. Happenings: create/edit/cancel events **and sessions**; assign masters
   with two-sided consent; approve master session proposals.
6. Reservations: per-happening queue + merged view, capacity-guarded
   confirmation.
7. Reviews: read-only list, newest first.
8. Team: roster view; owner approval of manager applications (in-app
   invitation by account pick).

## 7.2 Master Studio MVP — Required

1. Studio shell + Today queue: invitations (accept/decline) + own-session
   registration confirmations.
2. Create session (≤60-second mobile flow) at affiliated venue; request flow
   for non-affiliated.
3. Upcoming schedule (conducting + lineup).
4. Share block: canonical link + native share sheet (social cards depend on
   fixing the broken manifest/OG metadata — REPOSITORY_AUDIT §8.10 — treat as
   part of this item).
5. Public profile editing (own only — rides on the RLS fix) + certificates
   (exists, relocated into the Studio).
6. Reviews: read-only list + current average.

## 7.3 Post-MVP (both workspaces)

* Email-redeemable invitations; master affiliation invitations (SP-016 UI).
* Waiting lists, cancellation deadlines UI, door list.
* Review responses (one per review, badged).
* Statistics v1 (views, registrations, fill rate; share-link conversion for
  masters).
* Portfolio highlights, QR/story share cards, "view as public".
* Chain aggregate context ("All facilities" merged queues + stats).
* Verification status surfaces (Phase 7), claim evidence upload.
* Recurrence templates for sessions.
* Push notifications (PWA) for queue events.

## 7.4 Future Vision

* Revenue dashboards, payout configuration, ticketing management (Phase 6);
  master earnings and revenue splits (Q12–Q13).
* Organize: master-organized events end-to-end.
* Followers/audience analytics; master marketplace ("book this master").
* Check-in mode with QR; attendance-fed stats and portfolios.
* Organization accounts for chains (USER_MODEL §3.2); staff scheduling.
* Private-host onboarding preset: the same workspace with a
  one-sauna, calendar-first configuration (USER_MODEL §2.8).

---

# 8. Ideal Daily Workflows (Part 6)

> These are experiential vignettes — the formal workflow definitions
> (actors, triggers, flows, status) live in `docs/WORKFLOWS.md`.

**Manager, 8:55, front desk phone:**
Opens app → badge "Panel obiektu • 7" → Today queue → swipes through 6
pending registrations for tonight's ice session (5 confirm, 1 reject — full)
→ sees tonight's two happening cards → notices tomorrow's herbal session has
no photos → camera → two photos from yesterday's ritual → done before the
first guest arrives. *Elapsed: 3 minutes.*

**Owner, Tuesday evening, sofa:**
Opens workspace → approves a manager application from the new front-desk hire
→ reviews the week's stats tile ("ice sessions fill 3× faster") → creates
"Friday Evening" event → adds Herbal 19:00 and Ice 21:00 sessions → invites
master Kasia to conduct both → she'll get the invitation in her Studio →
reads two new reviews. *One sitting, one flow — event composition is a single
wizard, not five pages.*

**Master, next morning, tram:**
Push: "Zaproszenie: Friday Evening" → opens Studio → accepts both sessions →
they appear in Schedule → taps Share on the herbal session → Instagram story
with the SaunaPlanet link → by lunch, 9 registrations → confirms 9 with one
queue pass → checks yesterday's review (5★) and the rating tick upward.
*The entire professional day: three app entries, each under two minutes.*

**Chain operator, Monday:**
"All facilities" context → merged queue sorted by urgency across 4 saunas →
clears it → aggregate stats: facility #3's fill rate dropped → switches
context to #3 → sees its master resigned affiliation last week → opens Team →
invites two masters from the city's ranking list. *Scale changed the volume,
not the workflow.*

---

# 9. Mobile (Part 7)

The workspaces are designed mobile-first and must translate to React
Native/Expo without redesign:

* **Navigation maps 1:1 to native:** workspace hub = profile/avatar tab;
  workspace sections = native tab bar / segmented control; Today queue =
  first tab. No sidebars, no hover, no breadcrumbs anywhere in the design.
* **Queues are swipeable lists** (confirm/reject as swipe actions with undo),
  the single most-repeated interaction — optimize it once, reuse everywhere.
* **All forms are bottom sheets** with minimal typing: dictionary pickers
  (themes), time wheels, venue defaults, camera-first photo entry
  (compression exists). The 60-second session-creation KPI is measured on a
  phone.
* **Share uses the OS share sheet** — the J8 loop lives inside Instagram/
  WhatsApp, not inside SaunaPlanet.
* **Push is the workspace's front door** (PWA first, native later): pending
  registration, invitation, waitlist offer, new review — every push
  deep-links to the exact queue item.
* **Poor-signal tolerance:** today's happenings and the confirmed guest list
  cached read-only — saunas have famously bad reception; the door list must
  open in a basement.
* **No desktop-only concepts:** no wide data tables (cards with progressive
  disclosure instead), no multi-pane editing, no drag-and-drop-only
  interactions (photo reorder gets tap-based fallback). Desktop is the same
  layout, wider — with the sections as a sidebar and room for two panes.

---

# 10. Adoption Path & Recommendations

1. **Ship the shells around existing capabilities first.** Workspace hub +
   Owner Today queue (relocating the `/profile` manager panel) + Master
   Studio shell (relocating profile/certificates editing) deliver the
   platform *feeling* before any new backend work — and immediately exercise
   the USER_MODEL MVP items (RLS scoping, owner role) they depend on.
2. **Build the queue row and happening card as shared components before any
   section.** They appear in every workspace and replace the existing
   copy-paste moderation components (REPOSITORY_AUDIT §8.7).
3. **Order of sections:** Reservations queue → Happenings management →
   Session creation + Share → Team → Reviews → the rest. This matches
   frequency of use, not org-chart importance.
4. **Instrument the two KPIs from day one:** master session-creation time
   (target ≤60s) and manager time-to-clear-morning-queue. These two numbers
   *are* the product quality of the workspaces.
5. **Admin panel shrinks deliberately:** each workspace capability that ships
   should retire (or demote to fallback) the corresponding admin tab
   workflow — track this in FEATURES.md per SP item.
6. **Naming (UI, Polish-first):** "Panel obiektu" (owner/manager workspace)
   and "Studio" (master workspace) — pending i18n strategy (Decision 010);
   route naming should follow the existing English convention and is an
   implementation-time decision.

---

# 11. Open Questions

1. **Support conductors' powers.** May a non-lead conductor confirm
   registrations for the session, or only view them? Default here: view-only;
   lead + facility staff confirm (EVENT_SESSION_MODEL §14.5).
2. **Review responses scope.** Facility responds to facility reviews, master
   to session reviews — who responds to a review of a session at a facility
   (both? organizer only)? Decide with the review-responses feature.
3. **Manager notification load.** Per-facility notification preferences vs
   per-account: chain managers will drown without granular control — decide
   at push-notification time.
4. **Studio for pending masters.** How much of the Studio does an unapproved
   master see? Default: profile + certificates (to complete their
   application), nothing operational.
5. **Where do private hosts onboard** (Phase 8): a separate "list your sauna"
   funnel that lands in this same workspace, or a distinct host flow? Default
   per USER_MODEL §2.8: same workspace, listing-creation entry point.
