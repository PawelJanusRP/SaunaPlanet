# Workspace UX & Navigation Review — SP-035A

Product/UX review of the existing Workspace architecture, conducted before
Sauna Sessions (SP-036). This document proposes **no new features, no schema
changes, no authorization changes, and no architecture redesign**. It evaluates
discoverability, navigation and usability of what already exists, and
prioritizes improvements as **P1** (before SP-036), **P2** (during Master
Studio evolution) and **P3** (future).

Sources: `docs/CURRENT_STATE.md`, `docs/WORKFLOWS.md`,
`docs/PLATFORM_WORKSPACES.md`, `docs/USER_MODEL.md`, `docs/ROADMAP.md`,
`docs/DECISIONS.md`, `docs/FEATURES.md`, and inspection of
`components/workspace/*`, `lib/workspace/*`, and the workspace routes.

The guiding question throughout: **"If I run a real sauna business, can I
immediately understand where to go and what needs my attention?"**

---

## 1. Executive Summary

SaunaPlanet has a genuinely strong architectural foundation: one shared
Workspace Shell, configuration-driven navigation, a presentation-only context
model, and role-driven visibility (no dead buttons). The Personal, Owner and
Master workspaces already run on that single skeleton. This is the right base
to build SP-036 on and should not be redesigned.

However, the current experience answers **"where can I go?"** better than it
answers **"what needs my attention right now?"** Three themes dominate the
findings:

1. **Attention is invisible.** The navigation has a `badgeCount` slot but it is
   populated nowhere. A facility owner with five pending reservations and two
   affiliation requests sees the same neutral menu as an owner with nothing to
   do. The product's own "queues first, pages second" principle
   (`PLATFORM_WORKSPACES` §Design Principles) is not yet visible in the chrome.

2. **Switching between workspaces is hidden.** The workspace hub (Profile /
   Owner / Studio / Admin) lives inside the hamburger drawer, even on desktop.
   There is no persistent indicator of "which workspace am I in" or a one-tap
   way to move between them. A person who is both an owner and a master has no
   obvious signal that two workspaces exist.

3. **Entry into professional roles is under-discoverable.** Becoming a master
   (`BecomeMasterForm` on `/masters`) and becoming a manager ("Zostań
   managerem" on a facility page) are only findable if you happen to be on the
   right public page. Nothing in the Personal Workspace points a normal user
   toward "grow into an owner/master."

None of these require new business logic. They are chrome, labelling,
summarization, and placement — exactly the scope of this sprint. The current
model **will scale to SP-036** (sessions are additive: new queue row types, a
new tab, a new create sheet), but two bottlenecks must be addressed first: the
unused badge system (P1) and the growing per-workspace tab count (P2).

---

## 2. Current Strengths

* **One shell, many workspaces.** `WorkspaceShell` + `WorkspaceNav` +
  `TodayQueue` + `WorkspaceSection` + `WorkspaceEmptyState` are reused
  everywhere. New surfaces cost a config entry, not a layout fork.
* **Configuration-driven navigation.** `lib/workspace/*.ts` defines nav once;
  responsive rendering (mobile chips / desktop sidebar) is automatic.
* **Role-driven visibility, no dead ends.** `destinations.ts` shows only
  workspaces the account actually holds — the "every capability shown is held"
  principle is honored.
* **Honest empty states.** `WorkspaceEmptyState` ("absent is absent") avoids
  fake data and gives a CTA where one exists.
* **Context model is clean and safe.** `WorkspaceContext` is presentation-only;
  single-facility owners get zero switcher friction, multi-facility owners get
  an aggregate + per-facility switch, and context deep-links persist.
* **Two-sided affiliation UX is coherent.** Request/invite/approve/withdraw/end
  is mirrored correctly between Master Studio and Owner → Team.
* **Consistent visual language.** Breadcrumbs, section cards, status chips and
  Polish labelling are uniform across workspaces.

---

## 3. Current Weaknesses

* **`badgeCount` is defined but never populated** (`types.ts` / `WorkspaceNav`
  support it; no page passes it). Pending work is invisible in navigation.
* **Workspace switching is buried** in the hamburger drawer; no persistent
  "you are here" workspace indicator, no cross-workspace switch on desktop.
* **The Today Queue means different things in different workspaces.** In the
  Owner Workspace it is a true action queue (pending reservations); in the
  Personal Workspace it is an informational "events today" list. Same chrome,
  different contract.
* **Dashboards partly duplicate navigation.** Owner and Personal dashboards
  render preview sections plus a "Quick actions" row plus nav — three routes to
  the same place — without a single "what needs me now" focal point.
* **Role-entry funnels are placement-dependent.** Master and manager
  applications live on public pages only; there is no funnel from the Personal
  Workspace ("you could be a master/owner").
* **Owner navigation is thinner than the documented model.** `PLATFORM_WORKSPACES`
  §4 lists Facility Profile, Photos, Reviews, Statistics, Settings; today the
  Owner nav is only Pulpit / Rezerwacje / Wydarzenia / Zespół. Owners still
  depend on admins for facility profile & photo edits.
* **"Studio" is terse.** For a first-time master, "Studio" alone does not
  clearly read as "your professional sauna-master workspace."
* **Admin is off the shell.** `/admin` uses a separate `?tab=` layout, so the
  9-tab panel does not benefit from the shared queue/badge conventions.

---

## 4. UX Pain Points (business-scenario framing)

Framed as "a real operator uses the product":

1. **"Do I have anything to do today?"** — The owner must open the dashboard and
   scan; nothing in the persistent chrome signals pending reservations or
   affiliation requests. On mobile, the queue is below the fold after the
   header and context bar.
2. **"I'm an owner *and* a master — where's my other hat?"** — No visible cue.
   The second workspace is discoverable only by opening the drawer and reading
   the list.
3. **"A master asked to affiliate — where do I respond?"** — Answerable
   (Owner → Zespół, and the request also shows in the Today Queue), but there
   is no badge on "Zespół" to pull the owner there.
4. **"I want to start managing my sauna."** — Only possible by navigating to the
   specific facility's public page and finding "Zostań managerem." Not
   reachable from any workspace.
5. **"I run three saunas."** — The context switcher works, but the aggregate
   dashboard shows combined previews without per-facility attention counts, so
   the owner cannot tell *which* facility needs action without switching.
6. **"Where do reviews of my facility live for me as an owner?"** — Not in the
   Owner Workspace yet; owners see reviews only on the public page.

---

## 5. Navigation Review

### 5.1 Avatar Menu / Workspace Hub

**Today:** the hub (`AvatarMenu` via `destinations.ts`) renders inside the
Navbar's right-hand drawer as a link list: **Mój profil → Panel obiektu →
Studio → Panel admina** (each shown only if held; Admin carries an "Admin"
badge). There is no context switch here and no persistent presence outside the
drawer.

```
 TODAY (hamburger drawer, mobile pattern on all breakpoints)
 ┌───────────────────────────────┐
 │ ✕  SaunaPlanet                 │
 │ user@email        [rola]       │
 │───────────────────────────────│
 │ Mój profil                     │  ← workspace hub
 │ Panel obiektu                  │
 │ Studio                         │
 │ Panel admina           [Admin] │
 │ Zgłoś saunę                    │
 │───────────────────────────────│
 │ Odkrywaj: Wydarzenia · Mistrz. │
 │ Wyloguj                        │
 └───────────────────────────────┘
```

**Findings**
* **Discoverability (P1):** on desktop the only route to another workspace is a
  hamburger — a mobile idiom applied to a wide screen. A person with multiple
  roles gets no signal that multiple workspaces exist.
* **"You are here" is missing (P1):** the hub does not mark the active
  workspace, and once inside a workspace the breadcrumb root "SaunaPlanet"
  jumps to the *map*, not back to a hub.
* **Ordering (OK):** Profile → Owner → Master → Admin is a reasonable
  personal→professional→platform gradient; keep it.
* **Naming (P2):** "Studio" → consider "Studio saunamistrza" (or a subtitle) so
  it self-describes; keep "Panel obiektu"/"Panel admina" (consistent "Panel").
* **Attention (P1):** hub entries should carry the same pending badge as the
  in-workspace nav (e.g. "Panel obiektu ⑤").

**Recommendations**
* Give the hub a **persistent trigger** (avatar/role chip) in the top bar on all
  breakpoints, opening a compact workspace switcher that (a) marks the active
  workspace and (b) shows per-workspace pending counts. (P1)
* Make the breadcrumb root or a "hub" affordance return to the workspace
  switcher, not only to the map. (P2)

### 5.2 Per-Workspace Navigation

| Workspace | Current nav | Reflects real tasks? | Gaps |
|---|---|---|---|
| **Personal** `/profile` | Pulpit · Profil · Ulubione · Recenzje · Wydarzenia · Ustawienia | Yes | No funnel into professional roles; "Profil" (details) vs "Pulpit" naming overlap |
| **Owner** `/workspace` | Pulpit · Rezerwacje · Wydarzenia · Zespół | Partially | Missing Facility Profile, Photos, Reviews, Statistics, Settings (documented in §4 of PLATFORM_WORKSPACES); no badges |
| **Master** `/studio` | Pulpit · Profil · Afiliacje · Ustawienia | Yes for MVP | No Sessions/Schedule/Certifications/Career yet (SP-036+); no badges |
| **Admin** `/admin` | 9 `?tab=` tabs | Yes | Off-shell; no shared queue/badge conventions |

**Cross-cutting findings**
* **No badges anywhere (P1).** Every nav is "flat" regardless of pending work.
* **Hidden important actions (P2).** Owner facility-profile/photo editing is not
  in the nav at all (still admin-only) — a documented capability with no home.
* **Labels (P2).** In Personal, "Pulpit" (dashboard) and "Profil" (public
  identity editor) are easy to confuse; consider "Przegląd" for the dashboard or
  "Dane profilu" for details.
* **Future expansion (P2).** Config-driven nav *can* absorb more tabs, but both
  Owner and Master will approach 8–10 tabs after SP-036 — see §12.

---

## 6. Dashboard Review

For each dashboard: what the operator expects first → what decision they make →
whether the screen supports it.

### 6.1 Personal `/profile`
* **Renders:** Today (events today) · optional "Panel obiektu" link · Nadchodzące
  wydarzenia (3) · Ulubione (4) · Ostatnia aktywność (4).
* **Expectation:** "What's next for me and quick access to my stuff." Met.
* **Decision supported:** low-stakes (browse). Adequate.
* **Improvement (P2):** the "Na dziś" here is informational, not actionable —
  relabel to "Dziś" / "Nadchodzące dziś" to avoid implying an action queue, and
  add a soft funnel card ("Jesteś saunamistrzem? / Zarządzasz obiektem?") that
  routes to the existing application flows. (Discoverability, not new logic.)

### 6.2 Owner `/workspace`
* **Renders:** Today (pending registrations + inline approve) · Moje obiekty ·
  Nadchodzące wydarzenia (5) · Szybkie akcje.
* **Expectation:** "What needs approving, what's happening, at which facility."
  Mostly met — the pending-registration queue is the strongest screen in the
  product.
* **Gaps (P1/P2):**
  * In **aggregate mode** there is no per-facility attention breakdown — the
    owner cannot tell which of three saunas is "hot." Add a compact
    per-facility counts strip. (P2)
  * Affiliation requests are actionable but not summarized on the dashboard
    alongside reservations — the Today Queue should include *all* pending
    decisions, not just reservations. (P1, see §7.)
  * "Szybkie akcje" partly duplicates nav; refocus it on genuinely primary
    actions (see §8).

### 6.3 Master `/studio`
* **Renders:** Today (facility affiliation invitations + inline accept) ·
  Profil · Afiliacje (summary) · Szybkie akcje.
* **Expectation:** "Who wants to work with me, and is my profile ready?" Met for
  MVP.
* **Improvement (P2):** add a profile-completeness nudge (bio/avatar present?) —
  purely presentational, drives quality before sessions ship.

**Common dashboard principle (P2):** dashboards should be **summaries +
decisions**, not a third copy of the navigation. Where a section only links to a
tab, collapse it into a one-line summary with a count, and reserve full cards
for actionable items.

---

## 7. Today Queue Review

**Concept is correct and is the product's best idea.** The problem is
consistency and completeness.

**What belongs in the Today Queue** (actionable, time-sensitive, decidable
inline):
* Owner: pending reservations; inbound affiliation **requests**; (SP-036)
  session proposals to approve; today's happenings needing attention.
* Master: affiliation **invitations**; (SP-036) own-session registrations to
  confirm; event-lineup invitations; expiring-certificate nudges.
* Personal: it is not really a queue — see below.

**What should NOT be there:** passive browsing lists (upcoming events I merely
follow, my favorites) — those are dashboard sections, not queue items.

**Findings & recommendations**
* **Unify the contract (P1).** Define the Today Queue as "decisions awaiting
  me." In the Owner Workspace it already is; extend it to include affiliation
  requests (currently only reservations). In the Personal Workspace, rename the
  block ("Dziś") so it is not mistaken for an action queue. (P1)
* **Prioritize by urgency then age (P1).** Order: overdue/time-critical (today's
  reservations) → pending decisions (requests/invitations) → nudges. Within a
  type, oldest-first.
* **Badges are the queue's shadow (P1).** Each queue item type should increment
  the corresponding nav `badgeCount` (reservations→Rezerwacje, requests→Zespół,
  invitations→Afiliacje) so the operator sees attention without opening the
  dashboard.
* **Design for notifications now (P2).** Today Queue item types are the natural
  seed for future email/push notifications and a global bell. Keep each item
  type a named, countable unit so notifications reuse the same taxonomy.

---

## 8. Quick Actions Review

Quick Actions should be the 2–4 things an operator does most, always one tap
away — not a mirror of the nav.

| Workspace | Recommended always-available primary actions |
|---|---|
| **Owner** | ➕ Stwórz wydarzenie (needs a concrete facility) · 🤝 Zaproś saunamistrza · 🎟️ Rezerwacje (with pending count) |
| **Master** | 🤝 Poproś o afiliację · 📨 Zaproszenia (with count) · 🔥 Stwórz seans *(SP-036, show only when it ships)* |
| **Personal** | ✏️ Edytuj profil · ♥ Ulubione · 🔥 Nadchodzące wydarzenia |

**Findings**
* Owner and Master dashboards already have a "Szybkie akcje" row — **keep the
  pattern, tighten the contents** (drop items that merely duplicate a nav tab
  with no state; keep create/invite/decide actions). (P2)
* Personal has link cards but no explicit quick-action row — add one for
  parity. (P3)
* **Context dependency (P1 clarity):** "Stwórz wydarzenie" / "Zaproś
  saunamistrza" require a concrete facility. Today the UI correctly shows a
  "pick a facility" hint in aggregate mode — keep that, and disable-with-reason
  rather than hide, so the action's existence stays discoverable.

---

## 9. Workspace Context Review

**Model is sound; make it louder.**

* **Visibility (P2):** the context switcher is a native `<select>` shown only
  when `>1` facility. Single-facility owners see the facility name only in the
  header pill. That is fine, but the switcher is visually quiet for chains —
  promote it into the context bar with the active facility name always visible.
* **Wording (P2):** "Wszystkie obiekty" (aggregate) vs a facility name is clear;
  add a count to aggregate ("Wszystkie obiekty · 3") so scope is obvious.
* **Aggregate vs single (P2):** in aggregate mode, surface per-facility
  attention (see §6.2) so "all" is not a black box.
* **Future Master context (P3):** a master has exactly one profile (1:1 link),
  so no profile switcher is needed. The *future* master "context" is **time**
  (schedule) and **affiliation** (which venue a session targets), not a second
  identity. Do not build a master context switcher; instead, when Sessions
  arrive, let the session-create sheet default its venue to the primary
  affiliation. (Consistent with Decision 016; no new context machinery.)

---

## 10. Workflow Discoverability Review

Mapping documented workflows (`docs/WORKFLOWS.md`) to whether a user can reach
them from the UI without typing a URL.

| Workflow | Discoverable today? | Where / gap |
|---|---|---|
| Discover sauna / event / master | ✅ | Map, `/sauny`, `/events`, `/masters` |
| Join event · review · favorite · "Idę" | ✅ | Public detail pages |
| Owner reservation moderation (W-14) | ✅ | Owner dashboard queue + Rezerwacje |
| Owner create event (W-06) | ✅ | Owner → Wydarzenia |
| Affiliations two-way (W-16) | ✅ | Studio → Afiliacje / Owner → Zespół |
| **Become a Sauna Master (W-07)** | ⚠️ | Only via `BecomeMasterForm` on `/masters`; no funnel from Personal Workspace |
| **Become a manager/owner (W-04/W-05)** | ⚠️ | Only via "Zostań managerem" on a facility's public page; unreachable from any workspace |
| **Owner: edit facility profile / photos** | ⚠️ | Documented as owner capability but only in admin panel today |
| **See my facility's reviews as owner** | ⚠️ | Only on the public page; no Owner Workspace surface |
| Session create / master event / apply-to-event / messaging | ⛔ (future) | SP-036 and later — no UI yet, expected |

**Recommendations**
* **Add role-growth funnels (P1, discoverability-only).** From the Personal
  Workspace dashboard, surface "Zostań saunamistrzem" and "Zarządzaj obiektem"
  cards that route to the *existing* flows. No new logic — just placement.
* **Give the manager application a reachable home (P2).** A "Zarządzaj tym
  obiektem" affordance should also be reachable from search/results, not only
  the facility page.

---

## 11. Information Architecture Recommendations

* **Team page: keep as one page for now, structured by sections (P2, not P1).**
  Today "Zespół" already separates *Zgłoszenia* / *Wysłane zaproszenia* /
  *Afiliowani* / *Zaproś*. That is the right granularity for MVP volumes.
  Splitting into Masters / Invitations / Requests / Affiliations pages is
  premature and would fragment a low-frequency area. Revisit only when a
  facility routinely manages many masters + managers together (P3), at which
  point split "people" (managers/owners) from "affiliations" (masters).
* **Sections vs pages (P2).** Low-frequency, read-mostly areas (Settings,
  Facility Profile) are better as pages; high-frequency decision areas
  (Reservations, Team requests) benefit from being reachable in one hop with a
  badge. Keep the current page model; add badges rather than nesting tabs.
* **Dashboards = summary + decisions, not nav duplication (P2).** Convert
  link-only dashboard sections into one-line summaries-with-counts; reserve full
  cards for the Today Queue and genuinely actionable previews.
* **Admin should adopt shared conventions (P3).** Bringing `/admin` onto the
  Workspace Shell (or at least its queue/badge conventions) would unify the
  moderator experience — deferred, since admin is internal-facing.

Proposed Owner Workspace IA (target after SP-036, additive — no redesign):

```
 Panel obiektu  [context: Sauna X ▾]              (avatar hub ▸)
 ├─ Pulpit         summary + Today Queue (all pending decisions, badged)
 ├─ Rezerwacje ⑤   reservations (per event / per session)
 ├─ Wydarzenia     events → sessions timeline (SP-036)
 ├─ Zespół ②       masters (affiliations) + managers + invites/requests
 ├─ Obiekt         facility profile + photos      (surfaces owner capability)
 ├─ Opinie         reviews of my facility          (read + future responses)
 └─ Ustawienia     verification, notifications, (future) payouts
```

---

## 12. Future Scalability

Assessment of the current shell against the roadmap. The shell **survives**;
two bottlenecks need pre-emptive decisions.

| Future capability | Fits current shell? | Bottleneck / action |
|---|---|---|
| **Sauna Sessions (SP-036)** | ✅ additive | New Today-Queue row types (session proposals, session registrations), a "Seanse/Happenings" tab, and a fast session-create sheet. No redesign. Wire badges first (P1). |
| **Notifications** | ⚠️ | No home today. `badgeCount` + Today Queue item types are the natural taxonomy — **build the badge system now (P1)** so notifications later reuse it; add a global bell (P2). |
| **Chat / messaging** | ⚠️ | No surface. Likely a cross-workspace inbox, not a per-workspace tab — needs an IA decision before it is bolted onto one workspace (P3). |
| **Payments / payouts** | ✅ | Owner-only Settings sub-page; fits the page model (P3). |
| **Rankings** | ✅ | Read-mostly section in Master Studio (Career) and public profiles (P3). |
| **Certifications** | ✅ | Already a moderated flow; add a Studio "Certyfikaty" tab (P2). |
| **Marketplace / private saunas** | ⚠️ | A new workspace *type* (host) on the same shell — the config model supports it, but nav tab-count per workspace is the real limit (see below). |

**Bottleneck 1 — the unused badge system (P1).** Nothing signals attention.
Every future queue/notification depends on this. Wire `badgeCount` before
SP-036, or SP-036's new queues will be as invisible as today's.

**Bottleneck 2 — tab-count growth (P2).** After SP-036 + Certifications +
Statistics, both Owner and Master reach ~8–10 tabs. Horizontal chips scroll on
mobile but discoverability drops past ~6. Mitigations (no redesign): group
low-frequency tabs, or introduce a "More" overflow, or promote the most
actionable 4 and demote the rest. Decide the grouping rule during SP-036 (P2).

**Bottleneck 3 — cross-workspace attention (P2).** A user who is owner + master
must currently check two workspaces separately. A global, badged workspace
switcher (P1 in §5.1) plus a future unified bell (P2) prevents this from
becoming untenable as sessions + notifications land.

---

## 13. Prioritized Recommendations

### P1 — before SP-036 (attention & switching foundations)
1. **Populate `badgeCount`** on every workspace nav from real pending counts
   (reservations, affiliation requests, invitations). *Why:* the product's
   "queues first" promise is invisible without it, and every SP-036 queue and
   future notification depends on this taxonomy.
2. **Unify the Today Queue contract** = "decisions awaiting me"; include
   affiliation requests in the Owner queue; relabel the Personal "Na dziś" so it
   is not mistaken for an action queue. *Why:* the dashboard is the operator's
   first screen; it must answer "what needs me now."
3. **Persistent, badged workspace switcher** with active-workspace marker,
   available on desktop (not only in the hamburger). *Why:* multi-role operators
   cannot currently see or reach their other workspace.
4. **Role-growth funnels** from the Personal Workspace to the existing
   master/manager application flows. *Why:* the professional funnels are the
   product's growth engine and are currently placement-hidden.

### P2 — during Master Studio evolution / alongside SP-036
5. Add a per-facility attention breakdown in Owner aggregate mode.
6. Convert link-only dashboard sections into summaries-with-counts (kill nav
   duplication); tighten "Szybkie akcje" to primary actions.
7. Naming pass: "Studio" → self-describing; disambiguate Personal "Pulpit"
   vs "Profil"; add counts to context labels ("Wszystkie obiekty · 3").
8. Expand Owner nav to its documented sections (Obiekt/Opinie/Ustawienia) as the
   underlying capabilities land; decide the tab-grouping rule before tab-count
   grows.
9. Add certifications tab to Master Studio; add a global notification bell seeded
   from Today-Queue item types.

### P3 — future
10. Split Team into people vs affiliations only when volume demands it.
11. Bring Admin onto the shared shell conventions.
12. IA decision for cross-workspace Chat/inbox before implementation.
13. Marketplace/host workspace as a new config-driven workspace type.

---

## 14. Quick Wins (low effort, high clarity — subset of P1/P2)

* Relabel Personal "Na dziś" → "Dziś / Nadchodzące" (contract fix).
* Add pending **counts** to section titles that already compute them
  (e.g. "Rezerwacje ⑤", "Zespół ②") even before full badge wiring.
* Add role-growth cards to the Personal dashboard (link to existing flows).
* Add a count to the aggregate context label.
* Give "Studio" a subtitle in the hub so it self-describes.

---

## 15. Long-Term Recommendations

* Treat **Today-Queue item types as the single attention taxonomy** shared by
  badges, the dashboard, and future notifications/bell — design once, reuse.
* Adopt a **tab-budget rule** per workspace (e.g. ≤6 primary tabs + overflow)
  before SP-036 inflates the nav.
* Plan **cross-workspace surfaces** (notifications, chat) as platform-level, not
  per-workspace, to avoid duplicating them into every workspace.
* Keep the **map primary** (Decision 005): workspaces remain the professional
  back-office; do not migrate discovery into them.

---

## 16. Final Report

**Most important UX problems**
1. Pending work is invisible — `badgeCount` unused; no attention signals.
2. Workspace switching is hidden in a hamburger; no "you are here."
3. Today Queue contract is inconsistent (action queue vs info list).
4. Professional role entry (master/manager) is placement-hidden.
5. Owner Workspace lacks documented sections (facility profile, photos,
   reviews), forcing admin dependence.

**Recommended navigation changes**
* Persistent, badged workspace switcher with active marker (P1).
* Populate nav badges from pending counts across all workspaces (P1).
* Expand Owner nav to documented sections as capabilities land (P2).
* Naming/labelling pass; add counts to context labels (P2).

**Dashboard improvements**
* Make the Today Queue the single "decisions awaiting me" focal point,
  reservations + affiliation requests together (P1).
* Replace link-only sections with summaries-with-counts (P2).
* Per-facility attention breakdown in aggregate mode (P2).

**Menu / hub improvements**
* Bring the hub out of the drawer on desktop; mark active workspace; badge each
  entry (P1).
* Self-describing "Studio" label (P2).

**Discoverability improvements**
* Role-growth funnels from Personal Workspace to existing application flows (P1).
* A reachable "manage this facility" affordance beyond the facility page (P2).

**Which recommendations should become future sprints**
* **Before SP-036 (this or a dedicated small sprint):** P1 items 1–4 — badge
  system, unified Today Queue, workspace switcher, role funnels. These are
  prerequisites for SP-036's queues and notifications being usable.
* **Within SP-036:** P2 items 5–9 — session tabs, dashboard summarization,
  naming, Owner nav expansion, notification bell seed.
* **Dedicated later sprints:** P3 — Chat/inbox IA, Admin-on-shell, marketplace
  workspace type, Team split.

**Scope reminder:** every recommendation above is chrome, labelling,
summarization, placement or configuration. None requires new business logic,
schema changes, authorization changes, or a redesign of the existing Workspace
architecture, consistent with the SP-035A mandate.
