# Workspace Product Specification — SP-035B

This is the **product specification** for the SaunaPlanet Workspace experiences.
It turns the accepted UX review (`docs/WORKSPACE_UX_REVIEW.md`, SP-035A) into a
concrete description of **how the product should behave for a real user**.

It describes the product, not the implementation. It contains **no code, no
schema, no migrations, no authorization changes, and no redesign** of the
existing Workspace architecture (shared shell, configuration-driven navigation,
presentation-only context, role-driven visibility). Where a future capability is
referenced, only its **placement** in the product is specified — not its design.

Sources: `docs/CURRENT_STATE.md`, `docs/WORKSPACE_UX_REVIEW.md`,
`docs/WORKFLOWS.md`, `docs/PLATFORM_WORKSPACES.md`, `docs/USER_MODEL.md`,
`docs/ROADMAP.md`, `docs/DECISIONS.md`.

Guiding question: **"How should SaunaPlanet work for a real user?"**

---

## 1. Workspace Philosophy

SaunaPlanet is one account with many hats (`USER_MODEL` — one human, one
account, additive roles). A **Workspace** is a place that answers *one*
responsibility for the person wearing *one* hat. Every workspace runs on the
same shell and shares the same mental model: **context bar → what needs me now →
sections**.

| Workspace | Route | "What is this place for?" | Primary persona |
|---|---|---|---|
| **Personal Workspace** (Mój profil) | `/profile` | *"Everything I do as a visitor and member."* My participation: my events, favorites, reviews, identity and account. | Registered User |
| **Owner Workspace** (Panel obiektu) | `/workspace` | *"Where I operate my sauna(s)."* Run a facility's presence and day-to-day operations: reservations, events, team. | Owner / approved Manager |
| **Master Studio** (Studio) | `/studio` | *"Where I manage my craft as a sauna master."* My professional identity, affiliations, and (future) sessions and reputation. | Sauna Master |
| **Administration** (Panel admina) | `/admin` | *"Where the platform is kept trustworthy."* Moderation and platform integrity. | Moderator / Admin |

**Principle:** a workspace is a *responsibility*, not a *feature set*. If a new
feature belongs to an existing responsibility, it becomes a section inside that
workspace; it does not spawn a new workspace. New workspaces appear only when a
genuinely new responsibility appears (e.g. a future private-sauna **Host**).

The public platform (map, `/sauny`, `/events`, `/masters`) is **not** a
workspace. Discovery stays on the map (Decision 005); workspaces are the
professional/personal back-office reached from the account hub.

---

## 2. Dashboard Specification

Every dashboard follows the same contract: **the first screen answers "what
needs me now?", then "what's coming", then "what I have."** Never open with a
copy of the navigation.

### 2.1 Universal dashboard layout (all workspaces)

```
 [ breadcrumb ]                                    [ hub ▸ ]
 Workspace title        [context pill]            [context switch ▾]
 subtitle
 ┌──────────────────────────────────────────────────────┐
 │ NA DZIŚ — decisions awaiting me (Today Queue)          │  ← attention
 ├──────────────────────────────────────────────────────┤
 │ ⚡ Szybkie akcje — 2–4 primary actions                  │  ← action
 ├──────────────────────────────────────────────────────┤
 │ Summaries: what's coming · what I have (counts)         │  ← information
 └──────────────────────────────────────────────────────┘
```

Order is fixed: **attention → action → information** (see §10).

### 2.2 Personal Workspace `/profile`
* **Primary purpose:** orient the member to their own upcoming participation and
  give one-hop access to their stuff.
* **First screen:** today's/upcoming attendance, then favorites and recent
  activity as summaries.
* **Information hierarchy:** (1) upcoming events I'm attending, (2) role-growth
  invitations (see below), (3) favorites summary, (4) recent reviews summary.
* **Today Queue:** the Personal Workspace has **few true decisions**; its "Na
  dziś" is informational and must be **relabelled "Dziś / Nadchodzące"** so it is
  not read as an action queue. Genuine personal decisions (e.g. a reservation
  awaiting *my* action) may appear as queue items when they exist.
* **Quick Actions:** Edytuj profil · Ulubione · Nadchodzące wydarzenia.
* **Summaries:** favorites (count), reviews (count), attendance.
* **Role-growth cards:** if the account is *not yet* a master/owner, show
  discoverable entry cards ("Jesteś saunamistrzem?", "Zarządzasz obiektem?")
  linking to the **existing** application flows (see US-5). These are the
  product's growth funnel and belong on the first personal screen.
* **Empty states:** honest ("Nie masz jeszcze rezerwacji") with a CTA to
  discovery (map/events).

### 2.3 Owner Workspace `/workspace`
* **Primary purpose:** run the facility — approve, schedule, staff.
* **First screen:** the Today Queue (pending reservations **and** pending
  affiliation requests) — the strongest, most-used screen in the product.
* **Information hierarchy:** (1) decisions awaiting me, (2) my facilities with
  per-facility attention, (3) upcoming happenings summary, (4) quick actions.
* **Today Queue:** all pending decisions for the active context — reservations to
  confirm, affiliation requests to answer, (future) session proposals.
* **Quick Actions:** Stwórz wydarzenie · Zaproś saunamistrza · Rezerwacje (with
  pending count).
* **Summaries:** "Moje obiekty" with per-facility pending counts; upcoming
  happenings count.
* **Empty states:** if no facilities managed → a single clear card explaining how
  to become an owner/manager (route to existing flow), not a blank workspace.

### 2.4 Master Studio `/studio`
* **Primary purpose:** present and grow my professional identity; manage
  relationships (affiliations) and (future) my sessions.
* **First screen:** the Today Queue (affiliation invitations to accept/decline;
  future: own-session registrations, event-lineup invitations).
* **Information hierarchy:** (1) decisions awaiting me, (2) profile readiness,
  (3) affiliations summary, (4) quick actions.
* **Today Queue:** invitations and (future) session registrations.
* **Quick Actions:** Poproś o afiliację · Zaproszenia (count) · *(future)* Stwórz
  seans — shown only when Sessions ship.
* **Summaries:** profile-completeness nudge; active affiliations count; primary
  affiliation.
* **Empty states:** pending/rejected profiles see the access notice; approved
  masters with no affiliations see a CTA to request one.

### 2.5 Administration `/admin`
* **Primary purpose:** keep the platform trustworthy.
* **First screen:** the moderation queues with pending totals.
* **Today Queue equivalent:** the pending-count badges across submission,
  master, certificate and manager queues *are* the admin's attention list; the
  spec recommends these adopt the same Today-Queue/badge taxonomy over time
  (P3). Admin is internal-facing; it is specified for consistency, not priority.

---

## 3. Navigation Specification

Navigation is **configuration-driven** and role-gated (no dead buttons). The
spec lists current items and **reserves** logical slots for future
responsibilities without designing those pages.

Notation: `●` = exists today · `◇` = reserved location (future; do not build now).

### 3.1 Personal Workspace
| Order | Item | Status | Notes |
|---|---|---|---|
| 1 | Pulpit (dashboard) | ● | Consider "Przegląd" to disambiguate from "Profil" |
| 2 | Profil (public identity) | ● | Editing my public identity |
| 3 | Ulubione | ● | |
| 4 | Recenzje | ● | |
| 5 | Wydarzenia | ● | My reservations + "Idę" |
| 6 | Ustawienia | ● | Account, password, notifications |

### 3.2 Owner Workspace
| Order | Item | Status | Notes |
|---|---|---|---|
| 1 | Pulpit | ● | |
| 2 | Rezerwacje | ● | **badge = pending count** |
| 3 | Wydarzenia | ● | Becomes "Wydarzenia i seanse" when Sessions ship (SP-036 owns that) |
| 4 | Zespół | ● | **badge = pending requests**; masters (affiliations) + managers |
| 5 | Obiekt (facility profile + photos) | ◇ | Reserve; surfaces the documented owner capability when it lands |
| 6 | Opinie (facility reviews) | ◇ | Reserve; owner-side view of reviews |
| 7 | Statystyki | ◇ | Reserve |
| 8 | Ustawienia | ◇ | Reserve; verification, notifications, (future) payouts |

### 3.3 Master Studio
| Order | Item | Status | Notes |
|---|---|---|---|
| 1 | Pulpit | ● | |
| 2 | Profil | ● | |
| 3 | Afiliacje | ● | **badge = pending invitations** |
| 4 | Seanse i grafik | ◇ | Reserve (SP-036 owns Sessions) |
| 5 | Certyfikaty | ◇ | Reserve |
| 6 | Kariera (historia, rankingi) | ◇ | Reserve |
| 7 | Statystyki | ◇ | Reserve |
| 8 | Ustawienia | ● | |

### 3.4 Naming & ordering rules
* Ordering: **most-actionable first**, settings last.
* "Studio" self-describes via a hub subtitle ("Studio saunamistrza").
* Keep "Panel obiektu"/"Panel admina" (consistent "Panel").
* **Tab budget:** ≤6 primary tabs visible; beyond that, group low-frequency tabs
  under an overflow ("Więcej") rather than fork the shell. This rule must be
  applied when Sessions/Certifications land (see §8, §11).

---

## 4. Today Queue Specification (unified concept)

**Definition (all workspaces):** the Today Queue is the list of **decisions
awaiting me** — items I can act on *now*, inline, that will not resolve
themselves. It is not a feed, not a calendar, not a browse list.

### 4.1 What belongs
An item qualifies only if it is **actionable, time-relevant, and mine to
decide**:
* Owner: reservations to confirm/reject; affiliation **requests** to answer;
  (future) session proposals to approve; today's happenings needing attention.
* Master: affiliation **invitations** to accept/decline; (future) own-session
  registrations to confirm; (future) event-lineup invitations.
* Personal: only genuine personal decisions (e.g. an action the member must take
  on their own reservation). Passive "events today" is a **summary**, not a
  queue item.
* Admin: pending moderation items (same taxonomy, P3).

### 4.2 What does NOT belong
Browsing lists (upcoming events I merely follow, my favorites, past history),
navigation shortcuts, and purely informational counts. Those live in summaries.

### 4.3 Item taxonomy (shared vocabulary)
Every queue item is one **named, countable type**. This taxonomy is the single
source of truth reused by badges (§4.5) and future notifications (§4.7):

```
 reservation.pending        → Owner  → badge: Rezerwacje
 affiliation.request        → Owner  → badge: Zespół
 affiliation.invitation     → Master → badge: Afiliacje
 session.proposal           → Owner  → badge: Wydarzenia/Seanse   (future)
 session.registration       → Master → badge: Seanse             (future)
 lineup.invitation          → Master → badge: Seanse             (future)
 certificate.expiring       → Master → nudge                     (future)
 moderation.*               → Admin  → badge: (per queue)        (P3)
```

### 4.4 Priority & ordering
Within a workspace, order by **urgency class**, then **age (oldest first)**:
1. **Time-critical** — happenings today/imminent (e.g. today's reservations).
2. **Pending decisions** — requests/invitations/proposals.
3. **Nudges** — soft prompts (profile completeness, expiring certs).

### 4.5 Badge behavior
* Each queue item type increments the **badge** on its corresponding navigation
  tab and on the workspace's entry in the account hub (§7).
* Badges show a **count**; a workspace with zero decisions shows no badge.
* Badges reflect the **active context** in the Owner Workspace (per-facility in
  single mode; aggregate total in "Wszystkie obiekty", with a per-facility
  breakdown available — §6).
* Badges are the "shadow" of the Today Queue: what is in the queue is what is
  counted.

### 4.6 Completed / resolved items
* When a decision is made, the item **leaves the queue immediately** and the
  badge decrements.
* Resolved items are not shown in the queue; they move to the relevant section's
  history (e.g. "Rozstrzygnięte" in Reservations). The queue is always "what's
  left", never a log.
* No "done" checkmarks accumulate in the queue — an empty queue is the goal
  state and shows the honest empty message.

### 4.7 Future notification integration
* The queue item taxonomy (§4.3) is the **same taxonomy** future
  email/push/in-app notifications and a global bell will use. A notification is
  "a queue item happened while you were away."
* Notifications must never introduce a *parallel* attention model — they mirror
  the Today Queue. The bell aggregates unresolved items **across** workspaces
  (§7); each workspace's Today Queue shows its own slice.

---

## 5. Quick Actions Specification

**Purpose:** put the 2–4 most frequent *actions* (not navigation) one tap away.
Quick Actions are for **doing**, the Today Queue is for **deciding**, navigation
is for **going**.

| Workspace | Quick Actions | When shown / hidden | Extensibility |
|---|---|---|---|
| **Personal** | Edytuj profil · Ulubione · Nadchodzące | Always for a logged-in member | Add "Idę" shortcuts later |
| **Owner** | Stwórz wydarzenie · Zaproś saunamistrza · Rezerwacje (count) | "Stwórz/Zaproś" require a **concrete facility**: shown enabled in single-facility mode; in aggregate with >1 facility they appear **disabled with a reason** ("Wybierz obiekt"), never hidden | Add "Stwórz seans" when Sessions ship |
| **Master** | Poproś o afiliację · Zaproszenia (count) · *(future)* Stwórz seans | Affiliation actions require an **approved** master profile; "Stwórz seans" appears only when Sessions ship | Add "Udostępnij profil" later |

**Rules**
* A Quick Action that merely duplicates a navigation tab with no state is not a
  Quick Action — remove it.
* Actions that depend on context (facility) **disable-with-reason** rather than
  disappear, so the capability stays discoverable ("every capability shown is
  held" — see §10).
* New Quick Actions are added by the sprint that ships the underlying capability;
  the spec reserves the slot, not the design.

---

## 6. Workspace Context Specification

Context is **presentation only** (never an authorization source) and exists to
answer "which facility am I operating on?".

* **Aggregate mode ("Wszystkie obiekty"):** default for multi-facility owners.
  Shows combined summaries **and a per-facility attention breakdown** so "all"
  is never a black box. Label shows the count: "Wszystkie obiekty · 3".
* **Single-facility mode:** the workspace *is* that facility; the facility name
  is always visible in the context bar; no switcher friction for
  single-facility owners.
* **Switching:** a clearly visible control in the context bar (not buried);
  switching preserves the current page and deep-links the context.
* **Wording:** "Wszystkie obiekty · N" vs the facility name; the active context
  is always shown as a pill next to the workspace title.
* **Visibility:** the switcher appears whenever the account holds >1 facility;
  single-facility owners see the name only.
* **Future Master context:** a master has exactly one profile (1:1 link,
  Decision 016) — there is **no master profile switcher**. The master's "context"
  is **time** (their schedule) and **affiliation** (which venue a future session
  targets), not a second identity. When Sessions ship, the session-create flow
  defaults its venue to the master's **primary affiliation**. No new context
  machinery is introduced.

---

## 7. Multi-role Experience

A single person may be simultaneously User, Owner, Master and Admin. The product
must make this effortless.

### 7.1 The account hub (workspace switcher)
A **persistent, badged workspace switcher** available on **all breakpoints**
(not only inside the hamburger). It:
* lists only the workspaces the account holds (role-driven visibility),
* **marks the active workspace**,
* shows a **pending-count badge** per workspace (aggregated from each
  workspace's Today Queue),
* is reachable from a stable trigger in the top bar (account/role chip).

```
 [ account ▾ ]
 ┌─────────────────────────────┐
 │ ● Mój profil                 │   ● = active
 │   Panel obiektu        ⑤     │   ⑤ = pending decisions
 │   Studio               ②     │
 │   Panel admina  [Admin] ⑦    │
 └─────────────────────────────┘
```

### 7.2 Orientation & switching
* **Active workspace** is always identifiable (marked in the hub; shown in the
  workspace title/breadcrumb).
* **Switching** is one tap from anywhere via the hub; it lands on the target
  workspace's dashboard (its Today Queue first).
* **Discoverability:** a multi-role user can see, at a glance, that other
  workspaces exist and whether they need attention — without opening any
  workspace.
* **No cross-contamination:** each workspace shows only its own responsibility;
  the hub is the only cross-workspace surface (plus a future global bell, §8).

### 7.3 Default landing
On login, land on the **Personal Workspace** (every account holds it). The hub
badges immediately reveal whether the Owner/Master/Admin workspaces need
attention, so the user self-routes.

---

## 8. Future Integration (placement only)

How future capabilities attach to the existing model — **placement, not design**.
Sessions are owned by SP-036; only their placement is noted here.

| Capability | Where it lives | Attention surface |
|---|---|---|
| **Sessions** (SP-036) | Master Studio "Seanse i grafik" tab; Owner "Wydarzenia i seanse" (event→session timeline) | New Today-Queue types: `session.proposal` (Owner), `session.registration`/`lineup.invitation` (Master) → badges on their tabs |
| **Notifications** | Platform-level global **bell** in the top bar; mirrors the Today-Queue taxonomy (§4.7) | Aggregated unresolved count across workspaces; each workspace keeps its own queue |
| **Chat / messaging** | Platform-level **inbox** (cross-workspace), not a per-workspace tab | Unread count on the inbox; not a workspace badge |
| **Payments / payouts** | Owner "Ustawienia" sub-area (owner-only) | None (configuration) |
| **Certifications** | Master Studio "Certyfikaty" tab | `certificate.expiring` nudge in the Today Queue |
| **Rankings** | Master Studio "Kariera" tab + public master profile | None (read-mostly) |
| **Marketplace / private saunas** | A **new workspace type** (Host) on the same shell — a new *responsibility*, not a tab on an existing workspace | Its own Today Queue types |

**Rule:** cross-cutting capabilities (notifications, chat) are **platform-level**,
reached from the top bar — never duplicated into each workspace. Capabilities
that belong to one responsibility become a **section** in that workspace.

---

## 9. User Stories (from accepted P1 recommendations)

INVEST stories for the four accepted P1 recommendations from SP-035A. Acceptance
criteria are product-level and testable; no implementation is prescribed.

### US-1 — Attention badges on workspace navigation
* **Title:** Show pending-decision counts on workspace navigation.
* **Description:** As an operator, I want each workspace tab to show how many
  decisions await me, so I know where to go without opening every screen.
* **User value:** Attention is visible at a glance; no hunting.
* **Acceptance criteria:**
  * Each nav tab whose responsibility has pending Today-Queue items shows a
    numeric badge equal to that count.
  * A tab with zero pending items shows no badge.
  * Counts match the Today Queue exactly (badge is the queue's shadow).
  * In the Owner Workspace, counts respect the active context (single facility)
    and show the aggregate total in "Wszystkie obiekty".
  * Resolving an item decrements the badge without a manual refresh.
* **INVEST notes:** independent of US-2's relabelling; small; testable by count
  comparison.

### US-2 — Unified Today Queue = "decisions awaiting me"
* **Title:** Make the Today Queue a consistent decision queue in every workspace.
* **Description:** As an operator, I want the "Na dziś" area to contain only
  decisions I can act on now, consistently across workspaces, so I trust it.
* **User value:** One reliable place for "what needs me now".
* **Acceptance criteria:**
  * The Owner Today Queue includes **both** pending reservations **and** pending
    affiliation requests (and reserves slots for future session proposals).
  * Each queue item is actionable inline (confirm/reject/accept/decline).
  * Items are ordered urgency-class first, then oldest-first (§4.4).
  * Resolved items leave the queue immediately and appear in the relevant
    section's history, not in the queue.
  * The Personal "Na dziś" is relabelled to "Dziś / Nadchodzące" and is treated
    as a summary, not an action queue.
* **INVEST notes:** valuable alone; negotiable on exact ordering; testable per
  item type.

### US-3 — Persistent, badged workspace switcher
* **Title:** Provide an always-available workspace switcher with active marker
  and badges.
* **Description:** As a multi-role user, I want to see and reach all my
  workspaces from anywhere, with the active one marked and pending counts shown,
  so I never lose track of my other hats.
* **User value:** Effortless multi-role orientation and switching.
* **Acceptance criteria:**
  * The switcher is reachable from a stable top-bar trigger on all breakpoints
    (not only inside the hamburger).
  * It lists only workspaces the account holds; the active workspace is clearly
    marked.
  * Each entry shows a pending-count badge aggregated from that workspace's
    Today Queue.
  * Selecting a workspace lands on its dashboard.
* **INVEST notes:** independent; testable via role/count fixtures.

### US-4 — Role-growth funnels from the Personal Workspace
* **Title:** Surface "become a master / manage a facility" from the Personal
  Workspace.
* **Description:** As a member who could become a master or owner, I want to
  discover how, from my own workspace, so I don't have to stumble onto the right
  public page.
* **User value:** The professional funnels — the platform's growth engine —
  become discoverable.
* **Acceptance criteria:**
  * The Personal dashboard shows entry cards for the professional roles the
    account does **not** yet hold (master and/or manager).
  * Each card routes to the **existing** application flow (no new logic).
  * Cards disappear once the account holds the corresponding role.
  * No change to who may apply or how approval works.
* **INVEST notes:** small; independent; testable by role state.

### US-5 — (supporting) Context clarity in aggregate mode
* **Title:** Show per-facility attention in Owner aggregate mode.
* **Description:** As a multi-facility owner, I want "Wszystkie obiekty" to show
  which facility needs action, so aggregate mode is not a black box.
* **User value:** Faster triage across a chain.
* **Acceptance criteria:**
  * The aggregate context label shows the facility count ("Wszystkie obiekty · N").
  * The dashboard shows a per-facility pending-count breakdown.
  * Selecting a facility from the breakdown switches context to it.
* **INVEST notes:** derives from US-1/US-2; can ship together.

> These five stories fully cover the accepted P1 set (badges, unified Today
> Queue incl. affiliation requests + Personal relabel, workspace switcher,
> role-growth funnels), plus the closely-coupled aggregate-context clarity.

---

## 10. Workspace UX Principles

A short, enforceable set. Every future workspace change is checked against these.

1. **Attention before navigation.** The first thing shown is what needs the user
   now, not a menu.
2. **Actions before information.** Decisions and primary actions precede
   browse/summary content.
3. **One place for one responsibility.** A capability lives in exactly one
   workspace/section; cross-cutting concerns are platform-level.
4. **Context is always visible.** The user always knows which workspace and which
   facility they are operating on.
5. **No hidden workflows.** Every documented workflow has a discoverable entry
   point; nothing requires typing a URL.
6. **Every capability shown is held.** No dead buttons; unavailable-by-context
   actions disable-with-reason rather than deceive or vanish.
7. **Queues first, pages second.** Recurring work is a queue with a badge, not a
   page the user must remember to check.
8. **One attention taxonomy.** Today Queue, badges and future notifications share
   a single vocabulary of item types.
9. **Mobile-first, one skeleton.** Every workspace is the same shell, designed
   for the phone first.
10. **Map stays primary (Decision 005).** Discovery is not migrated into
    workspaces.

---

## 11. Future Sprint Mapping

Stories grouped into implementation batches. **Sessions work is owned by SP-036
and is not assigned here** — this spec only reserves placement for it.

| Batch | Contents | Rationale |
|---|---|---|
| **SP-035C — Workspace attention & orientation** | US-1 (badges), US-2 (unified Today Queue + Personal relabel), US-3 (workspace switcher), US-4 (role funnels), US-5 (aggregate clarity) | The accepted P1 set. These are prerequisites: SP-036's session queues and any future notifications are invisible without the badge/queue/taxonomy foundation. Pure chrome/placement — safe before Sessions. |
| **SP-036 — Sauna Sessions** (owned elsewhere) | Sessions tab (Master), event→session composition (Owner), new Today-Queue types (`session.proposal`, `session.registration`, `lineup.invitation`) consuming the US-1/US-2 taxonomy | Placement reserved by this spec; **do not re-scope Session work here**. SP-035C must land first so session attention is visible. |
| **SP-037 — Owner workspace depth & polish** (P2) | Owner nav expansion (Obiekt/Opinie/Ustawienia as capabilities land), dashboard summaries replacing nav duplication, naming pass, Certifications tab (Master), notification-bell **seed** from the shared taxonomy | Depth once the attention foundation exists. |
| **Later** (P3) | Global notification bell (full), cross-workspace Chat/inbox IA, Admin-on-shell conventions, Team split (people vs affiliations) only if volume demands, Marketplace/Host workspace type | Larger IA decisions; deferred until earlier batches validate the model. |

---

## 12. Final Report

### Most important product decisions
1. **A workspace is a responsibility, not a feature set.** New features become
   sections; new workspaces appear only for genuinely new responsibilities
   (e.g. future Host).
2. **The Today Queue is defined once, product-wide, as "decisions awaiting me".**
   Its item types are the single attention taxonomy reused by badges and future
   notifications.
3. **Attention is first-class.** Dashboards and navigation lead with what needs
   the user now (attention → action → information).
4. **Multi-role users get a persistent, badged, active-marked account hub** as
   the single cross-workspace surface; notifications and chat are platform-level,
   never per-workspace silos.
5. **No new context machinery for masters** — one profile (Decision 016);
   session venue defaults to the primary affiliation when Sessions ship.

### Changes compared to SP-035A
* SP-035A **diagnosed**; SP-035B **prescribes**. The review's findings are now
  concrete specifications (dashboard contracts, nav tables with reserved slots,
  a unified Today-Queue definition with an item taxonomy, a multi-role hub spec).
* The four accepted P1 recommendations are now **INVEST user stories** (US-1..4,
  plus supporting US-5) ready to be sprinted.
* P2/P3 review items are mapped to **SP-035C / SP-036 (placement only) / SP-037 /
  later** with rationale.

### Implementation priorities
* **First:** SP-035C (US-1..5) — the attention/orientation foundation, before
  SP-036, because Sessions and notifications are unusable without it.
* **Then:** SP-036 Sessions consume this foundation (owned elsewhere).
* **Then:** SP-037 depth (Owner nav, summaries, certifications, bell seed).

### Recommendations that should NEVER be implemented
* **A master profile switcher.** Masters have exactly one profile (Decision 016);
  a switcher would imply multiple identities.
* **Migrating discovery into workspaces.** The map stays primary (Decision 005);
  do not rebuild search/browse inside a workspace.
* **Per-workspace notification or chat silos.** These are platform-level; a
  duplicate inbox/bell inside each workspace fragments attention.
* **A parallel attention model.** Do not let notifications, badges and the Today
  Queue diverge — one taxonomy only.
* **Disabled dead buttons for unheld capabilities.** Hide unheld capabilities;
  only disable-with-reason for context-dependent (held) actions.
* **Forking the shell per workspace** or splitting Team prematurely — both add
  maintenance and cognitive cost with no user gain at current volumes.
* **Free-text where a dictionary belongs** (e.g. future session themes) — out of
  UX scope, but noted so the spec's placement choices are not misread as
  endorsing ad-hoc data entry.

**Scope reminder:** everything above specifies product behaviour — dashboards,
navigation, queues, actions, context, placement and principles. It introduces no
code, schema, migration, authorization change, or architecture redesign,
consistent with the SP-035B mandate.
