# SaunaPlanet Roadmap

This document describes the planned evolution of SaunaPlanet.

The roadmap reflects current priorities and may evolve over time.

---

# Phase 1 - Foundation

Status: COMPLETED

Goal:

Create the core SaunaPlanet platform.

Delivered:

* Sauna map
* Sauna details page
* Events
* Reviews
* Rankings
* Sauna masters
* Certifications
* Satellite avatars
* Project documentation

Milestones:

* SP-001
* SP-002
* SP-003
* SP-004
* SP-005
* SP-006

---

# Phase 2 - Accounts and Security

Status: COMPLETED

Goal:

Introduce authenticated users and secure access control.

Features:

* registration
* login
* password reset
* user profiles
* Supabase Auth
* RLS redesign
* role management

Expected roles:

* user
* sauna manager
* sauna master
* moderator
* administrator

Success criteria:

Users can create accounts and securely interact with platform content.

---

# Phase 3 - Administration

Status: COMPLETED

Goal:

Provide management tools.

Delivered:

* admin dashboard (SP-012, SP-015, SP-017)
* sauna submission workflow
* sauna master moderation (pending / approved / rejected)
* certificate moderation and dictionary management (SP-017)
* event detail page with inline admin editing (SP-018)
* event photos management (SP-018)
* sauna list page with thumbnails, ratings, city filter (SP-019)
* admin users tab: name/email display, role assignment (SP-012 enhancement)
* facility management (edit/delete from admin panel) — SP-019
* event moderation (approve/reject events) — SP-019
* review moderation — SP-019

Success criteria:

Most content can be managed without direct database access.

---

# Phase 4 - Event Platform

Status: IN PROGRESS

Goal:

Transform events into first-class platform objects.

Delivered:

* user event interests — "Idę" toggle with going count (SP-020)
* post-event star ratings + pre-event comments (SP-021)
* historical sauna rating from past events shown on event page (SP-021)
* sauna event reviews listing page /sauna/[id]/reviews (SP-021)

Delivered (Workspace track, 2026-07):

* shared Workspace infrastructure — shell, hub, navigation (SP-031)
* Personal Workspace at /profile (SP-032)
* Owner Workspace at /workspace with active facility context (SP-033)
* owner event management from the Owner Workspace (SP-034)

Completed in this phase:

* **Master Studio Foundation (SP-035)** — Master Workspace on the shared
  shell; Sauna Master profile; profile integrity fixes (own-profile-only
  editing, unique user↔profile link); the **affiliation model** (formerly
  SP-016, Decision 016) replacing the home-sauna concept as the primary
  model
* **Master-Contributed Facilities & Events (SP-036)** — community facility
  submissions with moderation, duplicate detection, RLS hardening
  (docs/SP036_ARCHITECTURE.md); completed 2026-07-19
* **Master Event Participation (SP-037)** — verified masters request event
  participation, facility staff moderate, approved masters appear in
  lineups and on the map (W-11); completed 2026-07-19
* **Master Events & Invitations (SP-037B)** — master-created events with
  managed/unmanaged routing and atomic proposal resolution (W-09), atomic
  bundled facility+event submission, facility→master invitations with
  master consent (W-10); completed 2026-07-20
  (docs/SP037_MASTER_EVENTS_ARCHITECTURE.md)

Delivered (2026-07):

* **Smart Facility Import (SP-038)** — universal provider-based import
  engine (website provider live: Open Graph / metadata / JSON-LD with a
  deterministic per-field merge; SSRF-safe fetch; duplicate detection;
  editable preview on `/submit`; import→submission linking; social links;
  controlled image import with consent; Storage authorization hardening;
  moderation provenance panel). **CLOSED — deployed to production**
  2026-07-27 (docs/SP038_SMART_IMPORT_ARCHITECTURE.md). Facebook
  best-effort and paste-text fallback remain as backlog slices.
* **Saunamaster Pilot Foundation (SP-039) — Slice 1** — expanded master
  profile (slug + UUID/slug dual lookup, city, specialties, languages,
  experience year, social links, website, cover image, Founding Partner
  badge), public profile redesign with approved-affiliation display and
  hide-empty behavior, completeness library, Studio profile editor for
  approved masters, avatar/cover upload, privileged-field guard hardening,
  Storage policy hardening, restored `masters_select` own-row visibility.
  **CLOSED — deployed to production** 2026-07-27
  (production SHA `e3b037c3da880a1f5f22d5391cc517a1c43e09ca`). SP-039
  continues with the profile-claim pilot (Slices 2–6, below).

Remaining:

* **Saunamaster Pilot Foundation (SP-039)** — Slices 2–6: the profile-claim
  and onboarding workflow for a controlled private pilot with the first
  10 sauna masters (see the dedicated **SP-039** section below).
* **Recurring Sauna Sessions (SP-041)** — recurrence engine relocated out
  of SP-039 (see the **SP-041** section below and docs/BACKLOG.md).
* advanced calendar
* waiting lists and reservation lifecycle completion (cancellation
  deadlines, notifications)
* event categories and filtering
* sauna and master rankings derived from event reviews (SP-023)

Success criteria:

Users can discover and manage events efficiently; facilities and masters
operate self-service through their workspaces.

---

# SP-039 — Saunamaster Pilot Foundation

Status: ACTIVE PRODUCT SPRINT.

The highest current product priority is a controlled private pilot with the
first 10 sauna masters. SP-039 delivers the master profile plus the
**profile-claim onboarding workflow** that makes that pilot possible. The
sprint closes only when the claim and onboarding workflow is ready for the
controlled pilot.

Intended onboarding flow: SaunaPlanet administration prepares a master
profile in advance → generates a secure claim link → the invited master
opens the link and sees the prepared profile → signs in or creates their
own account → after authentication and email confirmation returns to the
claim flow → confirms the profile is theirs → the profile is atomically
assigned to the authenticated account → the master receives a prefilled
Studio form → edits, completes, previews, and publishes/submits → the pilot
launches in waves of 2, then 3, then 5.

**Administration must never create passwords or transferable login
credentials on behalf of sauna masters.** The master always authenticates
with their own account; administration only prepares data and issues a
claim token.

These concepts are **independent states** and must never be collapsed into
one boolean or one ambiguous status:

* profile **prepared** by SaunaPlanet;
* profile **claimed** by an authenticated owner;
* **identity verified**;
* **qualifications verified**;
* **Founding Partner** status;
* profile **approved / published**.

## Slice 1 — Expanded Master Profile Foundation

Status: **CLOSED — MERGED — DEPLOYED — PRODUCTION VERIFIED**
(production SHA `e3b037c3da880a1f5f22d5391cc517a1c43e09ca`, 2026-07-27).

Delivered: expanded sauna master profile model; UUID/slug dual lookup;
public master profile redesign; city; specialties; languages; experience
year; social links; website; cover image; Founding Partner badge; approved
affiliations; hide-empty behavior; rating hidden when `review_count = 0`;
profile completeness library; Studio profile editor for approved masters;
avatar and cover upload; privileged-field guard hardening; Storage policy
hardening; production-safe Server Action error handling; restored
`masters_select` own-row visibility; pending-owner RLS and Storage
capability restored. Applied migrations:
`supabase/2026-07-27_sp039_master_profile.sql`,
`supabase/2026-07-27_sp039_masters_select_fix.sql`.

Deferred to Slice 5: `StudioAccessNotice` still hides the profile editor
for pending masters; pending owners can read their own row and are
authorized by RLS/Storage, but the pending onboarding editor is exposed
only in Slice 5.

## Slice 2 — Claim Architecture and Security Review (NEXT)

Architecture and security review **only** — no claim functionality is
implemented in this slice. It must define: prepared-profile lifecycle;
claim-invitation lifecycle; profile-ownership lifecycle; claim-token model
(random high-entropy generation, hashing at rest, expiry, revocation,
one-time use, replay protection, rate limiting); claim audit trail;
sign-in / registration / email-confirmation return flows and preservation
of the claim context across authentication; atomic ownership assignment;
conflict handling (duplicate account, duplicate master profile, concurrent
claim); manual moderator recovery; publication and moderation states; RLS
boundaries; `SECURITY DEFINER` RPC boundaries; public preview data
boundaries; privacy implications; pending-master Studio access; image
upload behavior before and after claim; failure and rollback behavior.

The six independent states above must be modelled explicitly, not
collapsed. Slice 2 stops after architecture, SQL/RLS design, threat
analysis, and implementation plan. **Design delivered & owner decisions
approved (2026-07-27):** `docs/SP039_CLAIM_ARCHITECTURE.md` (data model,
invitation state machine, token security, atomic claim RPC, RLS matrix,
threat model, migration sequence; §22.1 approved decisions, §22.2
remaining build-time implementation details).

## Slice 3 — Admin-Prepared Profiles and Claim Invitations

Admin draft creation and editing of all pilot fields; readiness status;
invitation creation with secure token generation and token-hash
persistence; expiry, revoke, regenerate; sent/opened/claimed timestamps;
invitation status management; a pilot-candidate table; a copyable
invitation message for manual sending via email / Messenger / WhatsApp —
**no mandatory automated email delivery in the MVP**. Invitation states:
`created`, `ready`, `sent`, `opened`, `claimed`, `expired`, `revoked` (Slice 3
emits `ready`→`sent`→`revoked`/`expired`; `opened`/`claimed` are Slice 4).
**Slice 3A implementation design (reviewed):**
`docs/SP039_SLICE3_ADMIN_INVITATIONS.md`.

## Slice 4 — Authentication Return and Atomic Claim

Invitation preview; sign-in; account registration; email confirmation;
return to claim after authentication; explicit **"This is my profile"**
confirmation; atomic claim RPC; ownership assignment; invitation
consumption; audit entry; redirect to the prefilled Studio editor. The
atomic operation revalidates server-side: authenticated user; valid token;
correct token hash; not expired; not revoked; not already used; target
profile not already claimed; account not already attached to another
master profile; no conflicting concurrent claim succeeded. Negative and
concurrency tests documented.

## Slice 5 — Pilot Onboarding Experience

"We prepared your profile" screen; prefilled profile editor; pending-master
Studio mode (**resolves the Slice 1 deferred `StudioAccessNotice`
behavior**); profile completeness checklist; useful empty states; preview
before publication; incorrect-data and incorrect-affiliation reporting;
verification labels; moderator-only Founding Partner assignment; pilot
instructions; an admin onboarding-status view for the 10 participants.

## Slice 6 — Pilot E2E and Production Readiness

Authorization matrix; RLS tests; RPC tests; token expiry / revocation /
replay; claim concurrency; new-account path; existing-account path;
email-confirmation return path; mobile flow; moderator recovery; rollback;
Preview E2E; Production migration; Production verification; launch
readiness for the first two participants.

Each slice keeps the decision checkpoints used since SP-036 (design review,
SQL review, implementation, migration application, Preview/E2E,
merge/deploy) — schema application, implementation and production
deployment are never combined into one uncontrolled step.

---

# SP-039P — Controlled Sauna Master Pilot

Status: PRODUCT / OPERATIONAL PHASE (not a large implementation sprint).

Runs after SP-039 delivers the claim and onboarding workflow, gated by
**SP-040** (free-tier guardrails must be in place before invitations go to
all 10 participants).

## Waves

* **Wave 1** — 2 sauna masters; stop after onboarding; collect feedback;
  fix blockers.
* **Wave 2** — 3 sauna masters; validate more account and profile variants;
  stop and review.
* **Wave 3** — the remaining 5 sauna masters.

## Pilot metrics

profiles prepared; invitations generated; invitations sent; links opened;
registration started; email confirmed; claim completed; profile
completeness; profile published; time to claim; time to publication;
administrator interventions; duplicate/conflict cases; corrected prepared
data; rejected prepared data; qualitative feedback; whether the master
shares the profile publicly.

## Entry criteria

* SP-039 Slices 2–6 closed and deployed; claim + onboarding E2E green.
* **SP-040 free-tier guardrails live** — capacity/usage dashboard with
  configurable thresholds before broad invitations.
* At least 2 admin-prepared profiles marked `ready` with valid,
  reviewed data.
* Moderator recovery path verified (a stuck/incorrect claim can be
  resolved without direct database surgery).

## Exit criteria

* All 10 participants onboarded (or explicitly deferred) across the three
  waves; no unresolved claim-flow blocker.
* Every participant reached a published or submitted-for-moderation
  profile, or a recorded reason otherwise.
* Feedback captured and triaged into backlog; no free-tier threshold in
  Critical (90%).
* Go/no-go decision recorded for opening self-service master registration
  beyond the pilot.

---

# Phase 5 - Bookings

Status: PLANNED

Goal:

Allow reservations through SaunaPlanet.

Features:

* event reservations
* booking confirmations
* cancellation support
* booking history

Success criteria:

Users can reserve participation without contacting facilities directly.

---

# Phase 6 - Payments

Status: PLANNED

Goal:

Support financial transactions.

Features:

* event payments
* booking payments
* subscription payments

Potential integrations:

* Stripe
* PayU
* Przelewy24

Success criteria:

Users can complete transactions entirely within SaunaPlanet.

---

# Phase 7 - Verification and Authority

Status: PLANNED

Goal:

Increase trust and quality.

Features:

* sauna master verification
* facility verification
* certification validation
* authority system
* trust badges

Success criteria:

Users can easily identify trusted facilities and professionals.

---

# Phase 8 - Private Sauna Ecosystem

Status: PLANNED

Goal:

Open the platform to private sauna owners.

Features:

* private garden saunas
* home saunas
* reservations
* availability calendars
* payments
* reviews

Strategic value:

Major differentiator compared to traditional sauna directories.

---

# Phase 9 - Premium Platform

Status: PLANNED

Goal:

Introduce monetization.

Features:

* subscriptions
* premium search
* advanced filters
* event alerts
* favorite master tracking

Success criteria:

Platform generates recurring revenue.

---

# Phase 10 - International Expansion

Status: FUTURE

Target countries:

* Germany
* Czech Republic
* Slovakia
* Finland
* Sweden
* Norway
* Estonia
* Latvia
* Lithuania

Goal:

Become the leading sauna platform in Europe.

---

# Product Priorities

Highest priority:

1. Authentication
2. Roles and permissions
3. Admin panel
4. Event management improvements

Medium priority:

5. Bookings
6. Payments
7. Verification

Long-term priority:

8. Private sauna ecosystem
9. International expansion

---

# Platform Operations and product sprints (planned)

> **Renumbering note (2026-07-27).** The private-master-pilot reprioritization
> reorganized three planned (not-yet-started) sprint identifiers. Per
> `docs/SPRINT_HISTORY.md` this is allowed only because none had started
> implementation:
> * **SP-040** is now **Platform Operations and Free-Tier Guardrails** — it
>   supersedes and absorbs the earlier "Platform Capacity & System Health
>   Dashboard" (same theme, sharpened around free-tier limits and pilot
>   gating).
> * **SP-041** is now **Recurring Sauna Sessions** — the recurrence work
>   relocated out of the SP-039 architecture.
> * The earlier "Architecture, Performance & Scalability Review" moves to
>   **SP-043** (its full scope is preserved in `docs/BACKLOG.md`).

**SP-040 — Platform Operations and Free-Tier Guardrails** (full scope:
docs/BACKLOG.md) — an internal `/admin/system` dashboard showing whether
Supabase and Vercel usage is approaching free-tier capacity, reliability,
performance or cost limits, so the platform never silently exceeds a
provider limit. **Must be completed before invitations go to all 10
SP-039P pilot participants.** Principles: never hardcode provider limits
without verification (limits can change); limit values and thresholds are
configurable; every metric identifies its source and last-refresh time;
metrics that cannot be obtained reliably are not displayed; the sprint
begins with an API/observability feasibility review. Slices: (1)
Observability & Provider Capability Review; (2) Internal Application
Metrics; (3) Provider Usage Dashboard; (4) Guardrails & Alerts
(configurable 60% Information / 75% Warning / 90% Critical, anomaly
detection, time-to-limit prediction). Data flows through a scheduled
collector into a snapshot table — never direct browser calls to
infrastructure providers.

**SP-041 — Recurring Sauna Sessions** (full scope: docs/BACKLOG.md) — the
recurrence engine relocated out of SP-039. Approved decisions preserved:
weekly / biweekly / up to 3 selected weekdays; maximum 3 months; maximum
40 generated occurrences; no infinite recurrence; deterministic date
preview; atomic generation; managed/unmanaged facility routing;
whole-series manager acceptance; individual occurrence editing;
"this and future" split semantics; extension; **non-destructive
cancellation metadata** (event history preserved); Today-Queue reminders
before a series ends. Important but must **not** block the claim pilot.

**SP-042 — Facility Data Improvement Proposals** (unchanged; full scope:
docs/BACKLOG.md) — controlled, moderated "suggest an update" workflow for
existing facilities (field-level diffs, per-value provenance, partial
acceptance, manager review, moderator override, full audit, no automatic
management-right assignment).

**SP-043 — Architecture, Performance & Scalability Review** (renumbered
from the earlier SP-040; full scope: docs/BACKLOG.md) — a comprehensive,
evidence-based technical review (database, map at 10x/100x datasets,
images, frontend, Next.js architecture, network, realtime, mobile
readiness, cost modeling at 100→100k users, security, SEO, accessibility)
to run **before significant user growth and before the native mobile app
(SP-030)**. Review only — the deliverable is a P1–P4 optimization roadmap,
with nothing implemented during the sprint itself.

---

# Mobile Roadmap

SaunaPlanet is a mobile-first product. The mobile strategy runs in parallel with the main platform phases.

## Short-term (PWA / Responsive)

* improve responsive web experience on mobile
* optimize map interaction on mobile
* support camera-based photo uploads
* support location-based sauna discovery

## Medium-term (PWA+)

* make SaunaPlanet installable as a PWA
* improve offline / poor-network behavior
* add push notifications for events and favourite sauna masters

## Long-term (Native App)

* build native mobile app using React Native / Expo
* reuse Supabase backend
* reuse product model: Sauna → Event → Sauna Master

---

# Guiding Principle

SaunaPlanet should evolve from:

Sauna Directory

into

Sauna Ecosystem

connecting:

Facilities
→ Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings
→ Community
