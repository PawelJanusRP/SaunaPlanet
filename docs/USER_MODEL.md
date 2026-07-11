# SaunaPlanet User Model

Status: AUTHORITATIVE product reference.

Scope: every future feature involving authentication, ownership, administration,
reservations, marketplace or payments must be checked against this document.

Created: 2026-07-11 (based on repository state after commit `bf68c5c`,
`docs/REPOSITORY_AUDIT.md` of the same date, and the live feature set through SP-022).

This is a **product architecture document**. It does not prescribe UI and it does
not prescribe SQL. Database observations describe the current state and identify
gaps only.

---

# 1. Product Philosophy

## 1.1 The core relationship

SaunaPlanet is not a directory. The central product relationship is:

**Sauna → Event → Sauna Master**

Users discover *experiences* (an Aufguss ceremony led by a certified master at a
facility), not addresses. Every persona and permission below exists to strengthen
this triangle.

## 1.2 One human, one account, many hats

A single person can simultaneously be:

* a regular sauna-goer,
* a certified sauna master,
* the manager of one facility,
* the owner of a private garden sauna.

Therefore the user model is built on one principle:

> **Identity is singular. Roles are additive capabilities attached to one account.**

There is never a separate "master account" or "owner account". There is one
account that *gains capabilities*: a linked master profile, a management
relationship with a facility, an ownership relationship with a listing.

## 1.3 Global roles vs contextual roles

Two fundamentally different kinds of authority exist and must never be mixed:

| Kind | Examples | Where it lives conceptually | Scope |
|------|----------|------------------------------|-------|
| **Global platform roles** | moderator, administrator | account-level role field | the whole platform |
| **Contextual roles** | owner of sauna X, manager of sauna X, master profile | relationship records (user ↔ object) | one object at a time |

This matches the direction already taken in the implementation
(`profiles.role` for global roles, `sauna_managers` for contextual ones) and it
is the correct long-term shape: a marketplace cannot work with global
"sauna_owner" roles, because ownership is always *of something*.

Rule: **never add a contextual role to the global role enum.** If a capability
is scoped to an object, it is a relationship, not a role.

## 1.4 Trust is earned through workflows

Every elevation of capability passes through an explicit workflow with a
`pending → approved / rejected` lifecycle:

* master self-registration → moderation,
* certificate claims → moderation,
* facility submissions → moderation,
* manager/ownership claims → verification,
* (future) private listings → verification,
* (future) payouts → identity/business verification (KYC/KYB).

This is already the platform's established pattern. All future capabilities
must reuse it rather than invent new ones.

## 1.5 Marketplace-compatibility as a design constraint

Every decision below is tested against the long-term states of the platform:

* paid event reservations with commission,
* private garden sauna rentals,
* business accounts with payouts,
* subscriptions.

If a persona or permission design would block any of these, it is wrong even if
it is convenient today.

## 1.6 Two kinds of happenings: Sessions and Events

> **Refined by `docs/EVENT_SESSION_MODEL.md` (Decision 014, same day):** a
> Session is the *atom* of sauna experience and an Event is a *container*
> that may hold many Sessions (a Session may also be standalone); Events may
> additionally be organized by masters, and registration confirmation follows
> "the organizer of the reserved object confirms". Where that document is
> more specific than this section, it wins. The table below remains correct
> as the summary of the two kinds.

Decided 2026-07-11. What today is a single `sauna_events` concept is, in the
product, **two distinct kinds of happenings sharing one infrastructure**:

| | **Session (seans / rytuał)** | **Event** |
|---|---|---|
| What | a sauna ritual/ceremony led by a master | a larger production: sauna night, festival, competition |
| Organizer | the **sauna master** | the **facility** (owner/manager); performing masters are assigned |
| Ticketing | not separately ticketed — part of normal facility admission; registration manages capacity only | **separately ticketed** — the anchor for paid reservations (J5) |
| Confirms registrations | the organizing master | facility staff (manager/owner) |
| Promotion | master shares a SaunaPlanet link with their own social-media audience | facility/platform promotion |
| Map presence | pulses distinctly (session-style); organizing master visible as a satellite of that sauna | pulses distinctly (event-style — the existing highlight) |
| Money (future) | none for now (§8 Q12) | payee = facility owner |

Strategic weight: sessions turn masters into an **acquisition channel** — a
master inviting their social audience to "my Friday ritual, register here"
brings new users with every session (journey J8). Events remain the
monetization anchor.

Both kinds share registrations, capacity, comments, reviews, the calendar and
master satellites. The split is a *kind* plus an *organizer* on the same
underlying object — not two parallel systems.

---

# 2. Personas

Seven core personas, plus one future variant (Private Sauna Host). A single
account may embody several personas at once (§1.2).

## 2.1 Guest (anonymous visitor)

**Who:** anyone opening the map or a shared link without an account. On a
mobile-first discovery product, guests are the majority of traffic and the top
of every funnel.

**1. Primary goals**

* Find a sauna or an event near a location, right now, on a phone.
* Evaluate quality: photos, ratings, reviews, which master leads the event.
* Decide whether creating an account is worth it.

**2. Typical journey**

Opens map → browses markers and master satellites → opens event popup → reads
event detail, sees "Zapisz się" → hits the registration wall → registers (or
leaves). The event page is the primary conversion surface.

**3. Permissions**

* Read all approved public content: saunas, events, master profiles,
  certificates, reviews, comments, ratings, photos.
* Nothing else. No writes of any kind.

**4. Objects owned/managed:** none.

**5. Typical daily actions:** map browsing, event discovery, reading reviews,
sharing links.

**6. Future capabilities**

* View private sauna listings and availability calendars (read-only).
* View prices for paid events.
* Possibly: begin a reservation flow and authenticate mid-checkout
  (standard marketplace pattern; requires nothing from the data model now).

**Current support:** fully supported. All discovery routes are public.

**Gaps:** none blocking. (SEO/i18n are platform concerns, not user-model concerns.)

---

## 2.2 Registered User (sauna enthusiast)

**Who:** the default persona after signup. The demand side of every future
marketplace transaction.

**1. Primary goals**

* Attend events: register, get confirmed, show up.
* Track a personal sauna life: favourites, "Idę" interests, upcoming
  registrations, past events attended.
* Contribute: reviews of saunas and past events, comments on upcoming events.
* Follow the scene: favourite masters and facilities, get notified.

**2. Typical journey**

Discovers event as guest → registers account → "Zapisz się" on event
(`pending`) → manager confirms (`confirmed`) → attends → leaves post-event
star review → the review feeds sauna/master rankings → discovers the master's
next event → returns. This is the Core Product Loop from PRODUCT_STRATEGY.md.

**3. Permissions**

* Everything a guest can, plus:
* Create/delete own: sauna reviews, event reviews (past events only, one per
  event), event comments (future events), favourites, interests, registrations.
  Decided 2026-07-11: reviews do **not** require a confirmed registration or
  attendance — any logged-in user may review a past happening (§8.0.2).
* Cancel own registration.
* Submit a new sauna (`sauna_submissions` → moderation).
* Apply to become a master (§2.4) or facility manager (§2.5).
* Edit own profile (display name, avatar).

**4. Objects owned/managed**

Own profile, own reviews/comments, own favourites/interests, own registrations,
own submissions. Strictly self-scoped.

**5. Typical daily actions**

Check upcoming registrations on /profile, mark "Idę", register for an event,
rate yesterday's ceremony.

**6. Future capabilities (marketplace/payments-compatible)**

* Pay for a reservation; view receipts and booking history.
* Join waiting lists; receive cancellation-window notifications.
* Book a private garden sauna (calendar-based reservation + payment).
* Follow masters/saunas with push notifications (PWA/native).
* Premium subscription (alerts, advanced search, recommendations).

**Current support and gaps**

| Capability | Status | Classification |
|---|---|---|
| Auth, profile page, favourites, interests, registrations, reviews, comments, submissions | ✅ implemented (SP-011, SP-020, SP-021, SP-022) | — |
| Public display name on reviews/comments | ✅ `profiles.first_name/last_name` (added 2026-06-24), shown on reviews, comments, admin users | — |
| User avatar on profile/reviews | ❌ | Nice to have |
| Registration lifecycle: cancellation deadline, capacity handling on confirm | ⚠ partial (`max_participants` exists; no deadline/waitlist logic) | **Missing but required for MVP** |
| Notifications (email at minimum: registration confirmed/rejected) | ❌ | **Missing but required for MVP** (a reservation system without confirmation messages does not close the loop) |
| Waiting lists | ❌ | Post-MVP |
| Follow masters/saunas (beyond favourites), push notifications | ❌ | Post-MVP |
| Booking history with payments/receipts | ❌ | Post-MVP (with SP-024) |
| Premium subscription | ❌ | Nice to have (Phase 9) |

---

## 2.3 Sauna Owner

**Who:** the person (or company) legally/commercially responsible for a
facility: an aufguss-focused public sauna, a spa, a thermal complex — and in
the future, a private garden sauna host (§2.8). **This persona does not exist
in the current implementation at all** — it is the single largest gap in the
user model.

**1. Primary goals**

* Control the facility's presence: claim the listing (most facilities were
  imported from PTS before the owner ever arrived), fix data, own the brand.
* Delegate day-to-day operations to managers without giving away control.
* Ultimately: receive money — paid events, paid reservations, payouts.
* See performance: views, registrations, reviews, ratings.

**2. Typical journey**

Finds their facility already listed → "Claim this sauna" → provides evidence of
ownership (business email domain, phone verification, document) → admin
verifies → becomes owner → invites two staff members as managers → managers run
events → (future) connects a payout account → publishes paid events.

Alternative journey: submits a new facility → approved → automatically becomes
its owner (submitter-becomes-owner rule).

**3. Permissions**

* Everything a manager of the same sauna can (§2.5 — owner ⊇ manager), plus:
* Appoint and remove managers of the owned sauna.
* Accept/reject manager applications for the owned sauna (replacing
  today's admin-only approval).
* Transfer ownership (with admin confirmation as a safety valve).
* Close/unpublish the listing (soft — content moderation stays with platform).
* (future) Manage billing: payout account, pricing, commission agreements,
  invoices, business account subscription.

**4. Objects owned/managed**

The owned sauna(s) and everything cascading from them: events, photos, manager
relationships, (future) prices, availability calendars, payout configuration.

**5. Typical daily actions**

Weekly rather than daily: review pending registrations count, check new
reviews, approve a manager application, update opening info, (future) check
revenue dashboard.

**6. Future capabilities**

* Payout accounts (Stripe Connect or equivalent) — the owner, never the
  manager, is the payee.
* Business account tier: promotion, featured listings, analytics.
* Multi-facility dashboard (chains, spa groups).
* Private-listing variant (§2.8) with availability calendar and per-hour
  pricing.

**Current support and gaps**

| Capability | Status | Classification |
|---|---|---|
| Ownership concept (owner relationship distinct from manager) | ❌ nothing — no `owner_id`, no role in `sauna_managers` | **Missing but required for MVP** (see §3 — cheap now, very expensive later) |
| Claim flow for imported facilities | ⚠ partial — `requestManagerRole` exists but grants management, not ownership, and admin approves without evidence | **Missing but required for MVP** (in minimal form: claim = manager request flagged as ownership claim) |
| Submitter-becomes-owner on approved submission | ❌ submissions approve into ownerless saunas | **Missing but required for MVP** |
| Owner appoints/removes managers | ❌ admin-only today | Post-MVP (acceptable while facility count is small) |
| Ownership transfer | ❌ | Post-MVP |
| Payouts, pricing, billing | ❌ | Post-MVP (SP-024/SP-025) |
| Business accounts, analytics dashboard | ❌ | Nice to have (Phase 9) |

---

## 2.4 Sauna Master

**Who:** the professional. A first-class entity and the platform's core
differentiator. Important nuance already present in the data: a master
*profile* can exist without an account (admin-created, historical), and an
account can be linked to a master profile (`sauna_masters.user_id`).

**1. Primary goals**

* Own a credible professional identity: bio, avatar, level, certificates,
  competition achievements, event history, rating.
* Be discoverable: satellite avatar on the map, /masters directory,
  event pages.
* **Organize own sessions (seanse/rytuały)** at affiliated saunas and bring
  their own social-media audience to them via SaunaPlanet links (§1.6).
* Get assigned to events (and, long-term, get paid for them).
* Build reputation through post-event reviews → rankings (SP-023).

**2. Typical journey**

Registers as a user → "Zostań saunamistrzem" self-registration → `pending` →
moderator approves → profile is public → adds certificates (each moderated) →
gets assigned to events at facilities → appears as satellite on the map →
publishes own sessions and promotes them on social media with SaunaPlanet
links → confirms session registrations → collects reviews → climbs the
ranking → affiliates with more facilities.

**3. Permissions**

* Everything a registered user can, plus:
* Edit **own** master profile (the one where `user_id` = self): bio, avatar.
  Level changes should require moderation (level implies certification).
* Add certificates to own profile (→ moderation).
* Create/edit/cancel **own sessions** at affiliated saunas (§1.6); at
  non-affiliated facilities only with facility approval (§8 Q11).
* Confirm/reject registrations for own sessions.
* Accept/decline event assignments (`sauna_event_masters` approval should be
  two-sided: facility proposes, master confirms — or vice versa).
* Manage own affiliations: request affiliation with a facility, set primary
  (home) sauna.

**4. Objects owned/managed**

Own master profile, own certificates, own event-assignment responses, own
affiliations.

**5. Typical daily actions**

Confirm next week's event assignment, publish Friday's session and share its
link on social media, confirm session registrations, check new reviews and
rating, add a freshly won competition certificate.

**6. Future capabilities**

* Followers + notifications ("your favourite master has a new event").
* Verified badge (Phase 7) — verification distinct from certification.
* Revenue share / paid guest appearances (marketplace for masters:
  a facility books a touring master).
* Paid sessions and master-organized ticketed events — requires a
  master-payout model (§8 Q12–Q13).

**Current support and gaps**

| Capability | Status | Classification |
|---|---|---|
| Master profiles, levels, certificates, moderation, self-registration | ✅ (SP-004, SP-015, SP-017) | — |
| Master edits **only own** profile | ❌ **inverted**: RLS `USING (true)` lets *any* authenticated user edit *any* master; the UI edit modal is similarly unscoped | **Missing but required for MVP** (also a critical security bug — REPOSITORY_AUDIT §8.1) |
| Enforced 1:1 user ↔ master profile (no duplicate profiles per account) | ❌ `user_id` nullable, not unique | **Missing but required for MVP** |
| Claim flow for pre-existing unlinked master profiles ("this is me") | ❌ | Post-MVP |
| Session organizer capability: create own sessions at affiliated saunas, confirm their registrations (§1.6) | ❌ no kind distinction, no organizer attribution, no master self-service | **Missing but required for MVP** (paired with §6.8 — the J8 acquisition loop depends on it) |
| Distinct map visualization: session pulse vs event pulse + organizer satellite | ❌ | Post-MVP (data model ships first; `SaunaMap.tsx` is a protected area — implement carefully) |
| Master confirms/declines event assignment (two-sided handshake) | ⚠ `sauna_event_masters.status` exists but masters have no self-service action | Post-MVP |
| Multi-facility affiliations (SP-016) | ❌ single `home_sauna_id` | Post-MVP (already correctly specified in FEATURES.md) |
| Rankings from event reviews (SP-023) | ❌ | Post-MVP |
| Followers, verified badge, master marketplace | ❌ | Nice to have |

---

## 2.5 Sauna Manager

**Who:** operational staff of a facility — the person who actually creates
events, uploads photos, and confirms registrations. Distinct from the owner:
a manager runs the facility on the platform but does not control it, its
manager list, or its money.

**1. Primary goals**

* Publish and maintain the facility's events.
* Handle demand: confirm/reject event registrations quickly (mobile!).
* Keep the profile attractive: photos, description, opening info.
* Coordinate masters: propose event assignments.

**2. Typical journey**

Today: user visits sauna page → "requests manager role" → admin approves →
manager panel appears on /profile → confirms registrations.

Target: owner invites them (or approves their application) → they accept →
manager capabilities on that one sauna.

**3. Permissions (per assigned sauna only)**

* Everything a registered user can, plus, **scoped to assigned saunas**:
* Create/edit/cancel events at the sauna.
* Confirm/reject/cancel event registrations.
* Upload/remove facility and event photos.
* Edit facility profile data (description, amenities, hours — not identity
  fields like name/location, which owner or moderation controls).
* Propose/remove master assignments for the sauna's events.
* Respond to reviews (future).

**4. Objects owned/managed**

Nothing owned. Manages: assigned saunas' events, photos, registrations. The
management relationship itself is granted and revocable by owner/admin.

**5. Typical daily actions**

Morning: check pending registrations, confirm until capacity. Publish
Saturday's ceremony. Upload yesterday's photos. This is the most
frequency-intensive persona besides admin — its workflows must be excellent
on mobile.

**6. Future capabilities**

* Reservation dashboard with capacity/waitlist management.
* Check-in at the door (mark attendance; attendance gates review rights).
* (Private listings) calendar management on behalf of a host.
* Never: payouts, pricing contracts, manager appointments — owner-only.

**Current support and gaps**

| Capability | Status | Classification |
|---|---|---|
| Manager relationship (request → admin approval), per-sauna scope | ✅ `sauna_managers` (SP-022) | — |
| Confirm/reject registrations for own sauna | ✅ server action checks approved manager | — |
| Manager scope enforced in RLS (not only server actions) | ❌ unknown/absent — permission logic lives in `app/events/actions.ts` | **Missing but required for MVP** ("frontend is not a security boundary" — RLS.md principle; server actions are better but the DB must enforce too) |
| Manager creates/edits events for own sauna | ❌ event editing is admin/moderator-only (`assertEditor`) | **Missing but required for MVP** — without it, "event platform" doesn't scale beyond admin data entry |
| Manager uploads photos / edits facility profile | ❌ admin-only | Post-MVP (early facilities can go through admin) |
| Manager proposes master assignments | ❌ admin-only | Post-MVP |
| Attendance / check-in | ❌ | Post-MVP |
| Review responses | ❌ | Nice to have |

---

## 2.6 Moderator

**Who:** platform staff (or trusted community member) guarding content quality
and trust. Moderates *content and claims*; does not manage *users, roles or
business relationships* (that is admin).

**1. Primary goals**

* Keep public content trustworthy: approve master registrations, certificates,
  sauna submissions; remove abusive reviews/comments/photos.
* Fast queue turnaround — pending items are people waiting.

**2. Typical journey**

Opens admin panel → works pending queues (submissions, masters, certificates,
manager/ownership claims escalations) → approves/rejects with reason →
occasionally removes reported content.

**3. Permissions**

* Everything a registered user can, plus:
* Approve/reject: sauna submissions, master registrations, certificates.
* Edit/remove any user-generated content (reviews, comments, photos) —
  with audit trail.
* Edit facility/event/master content for quality (typo fixes, categorization).
* **Not**: role management, manager/ownership grants (final say), payments,
  destructive facility deletion, platform settings.

**4. Objects owned/managed:** moderation queues; no business objects.

**5. Typical daily actions:** clear pending queues, handle reports.

**6. Future capabilities**

* Report/flag system (user-submitted reports) — moderation today is
  pull-based (queues) only.
* Verification workflows (Phase 7): facility and master verification badges.
* Audit log of all moderation actions.

**Current support and gaps**

| Capability | Status | Classification |
|---|---|---|
| Moderator role exists, admin-panel access, moderation server actions | ✅ (SP-012, SP-019) | — |
| Consistent moderator boundary in DB (`is_admin()` checks only `admin`, while some policies include moderator) | ⚠ inconsistent | **Missing but required for MVP** (an inconsistent boundary is a latent security bug) |
| Clear separation of moderator vs admin capabilities in the panel | ⚠ partially blurred | Post-MVP |
| Report/flag system | ❌ | Post-MVP |
| Moderation audit log | ❌ | Post-MVP |
| Verification badges (Phase 7) | ❌ | Post-MVP |

---

## 2.7 Administrator

**Who:** platform operator (currently: the founder). Superset of everything.

**1. Primary goals**

* Everything works; anything broken is fixable *without SQL access*
  (ROADMAP Phase 3 success criterion).
* Manage roles and trust: promote moderators, resolve ownership disputes.
* (Future) operate the business: commissions, payouts, refunds, disputes.

**2. Typical journey**

Daily sweep of the 9-tab admin panel: users, submissions, masters,
certificates, managers, facilities, events, reviews, dictionary. Today the
admin also does the work that owners/managers will eventually do themselves —
by design, the admin's journey should *shrink* every phase.

**3. Permissions:** unrestricted, but every privileged action should be audited.

**4. Objects owned/managed:** the platform: all content, all roles, all
relationships, dictionaries (certificate types), (future) platform settings
(SP-027), payments configuration.

**5. Typical daily actions:** queue moderation (as moderator), role changes,
manager approvals, data fixes, imports.

**6. Future capabilities**

* Platform settings panel (SP-027) instead of hardcoded constants.
* Payments operations: refunds, disputes, payout holds, commission config.
* Ownership dispute resolution and forced transfer.
* Impersonation/read-as-user debugging (with strict audit).

**Current support and gaps**

| Capability | Status | Classification |
|---|---|---|
| Full admin panel, role management via SECURITY DEFINER RPCs | ✅ | — |
| Audit log for privileged actions | ❌ | Post-MVP (upgrade to **required** the day payments launch) |
| Platform settings (SP-027) | ❌ | Post-MVP |
| Payment operations | ❌ | Post-MVP (with SP-024) |

---

## 2.8 Private Sauna Host (future persona — variant of Owner)

**Who:** a private person renting out a garden/home sauna (Phase 8, SP-025).
Strategic differentiator. **Deliberately modeled as a variant of Sauna Owner,
not a new persona**, so the marketplace reuses the entire ownership,
reservation and payment machinery.

Differences from a facility owner:

* Creates the listing themselves (no claim flow, no PTS import).
* Is owner and manager in one person (no staff), though the model must allow
  adding a manager (e.g. spouse).
* Sells **time slots** (availability calendar), not event seats.
* Is a consumer-to-consumer counterparty: stronger identity verification,
  platform-mediated payments and cancellation policies are mandatory,
  address privacy matters (approximate map location until booking confirmed).
* Listing visibility likely gated on completed verification, not just
  content moderation.

**Classification of everything in this persona: Post-MVP (Phase 8).**
The MVP-relevant consequence is only this: the ownership model (§3) must be
one that a private host fits into without redesign — one person owning a
listing of a different type, with calendar-based instead of event-based
reservations.

---

# 3. Ownership Model

The single most important structural decision in this document.

## 3.1 The three-layer model

```
LAYER 1: GLOBAL ROLES        profiles.role: user | moderator | admin
         (platform staff)     — never facility-related roles here

LAYER 2: OBJECT MEMBERSHIP   sauna ↔ user relationships with a role:
         (per-sauna)              owner   (exactly one active per sauna)
                                  manager (zero or more)

LAYER 3: LINKED PROFILES     professional identities linked to an account:
         (professional)           master profile (sauna_masters.user_id)
```

Layer 2 is the generalization of today's `sauna_managers` table: the same
relationship record, extended with a `role` distinguishing `owner` from
`manager`. This deliberately evolves the existing structure instead of
replacing it.

## 3.2 Answers to the ownership questions

**Can one owner manage multiple saunas?**
**Yes.** Ownership is a per-sauna relationship record, so one account can hold
the owner role on any number of saunas (spa chains, thermal groups, a host
with two garden saunas). No "one sauna per account" assumption may ever be
introduced. A multi-facility dashboard is a UI concern, not a model concern.

**Can one sauna have multiple managers?**
**Yes, unbounded.** Shift-based staff is the normal case. But **exactly one
active owner per sauna**. Co-ownership is intentionally rejected for now:
payouts need a single payee, disputes need a single accountable party, and
every marketplace that allowed ambiguous ownership regretted it. If genuine
co-ownership demand appears, the future answer is an organization/business
account owning the sauna (one owning *entity*, several people in the entity)
— which slots into Layer 2 without changing its shape.

**Can one sauna master belong to multiple saunas?**
**Yes** — via the affiliations table already specified as SP-016
(master ↔ sauna, `is_primary` flag, per-affiliation status). `home_sauna_id`
is the interim single-value version. Independent of affiliations, a master can
be *assigned to events* at any sauna (`sauna_event_masters`) — affiliation is
"belongs to the house team", assignment is "performs at this event". These are
different relationships and must stay separate.

**How should ownership differ from management?**

| Dimension | Owner | Manager |
|---|---|---|
| Answers for | the facility's presence, legally & commercially | day-to-day operations |
| Facility profile | full control incl. identity fields, closing the listing | operational content (description, photos, hours) |
| Events & registrations | yes (superset) | yes |
| Manager list | appoint, remove, approve applications | no |
| Ownership | transfer (admin-confirmed) | no |
| Money (future) | payout account, pricing, invoices, subscriptions | never |
| Cardinality per sauna | exactly 1 active | 0..n |

The invariant: **owner ⊇ manager**. Every manager capability is also an owner
capability; permission checks should test "is owner or manager" for
operational actions and "is owner" only for control actions. Money and
membership control are the two lines a manager can never cross.

**How should invitations work?**

Two directions, both landing in the same relationship table with a status
lifecycle, consistent with §1.4:

1. **Application (exists today):** user requests management of a sauna →
   `pending` → approved by the sauna's **owner** if one exists, by
   **admin** as fallback for unclaimed saunas. Today's admin-only approval is
   the correct interim behaviour, because no sauna has an owner yet.
2. **Invitation (new):** owner invites a person to become manager — by
   account, or by email for people not yet registered (invite record redeems
   on signup). Invitee must accept; nobody becomes staff of a facility without
   consent. Records should keep `invited_by` / `approved_by` for audit.

**Ownership claims** are a third, heavier workflow: claiming an existing
(imported) listing requires evidence and is always resolved by
admin/moderator, never by another user. Approved submission of a *new* sauna
should automatically make the submitter its owner (with the submission itself
acting as the claim).

**Should managers approve other managers?**
**No.** Membership control is the defining owner capability (see table above).
A manager approving managers collapses the owner/manager distinction and
creates a privilege-escalation path (manager adds accomplice → accomplice
adds more). Admin remains the fallback approver for ownerless saunas and the
override for disputes.

**How do future private garden saunas fit in?**
Unchanged model, different entry path (§2.8): the host creates a listing of a
private type and receives the owner relationship on it at creation. Same
Layer-2 table, same permission checks, same (future) payout attachment point.
What differs is around the model, not in it: verification requirements,
calendar-based reservations, address privacy. **Test for every future
ownership decision: "does this still work when the owner is a private person
with one garden sauna and no staff?"**

## 3.3 Does the current database support this model? (gap identification only)

Verified against `supabase/all_scripts_history.sql`, the SP-022 code paths and
REPOSITORY_AUDIT §5. No redesign here — gaps only.

| # | Gap | Why it matters |
|---|-----|----------------|
| G1 | **No ownership representation at all**: no `owner_id` on `saunas`, no role column on `sauna_managers` | The Owner persona cannot exist; payouts and private listings have no attachment point; audit §9.1 predicts an RLS redesign if postponed |
| G2 | `sauna_managers` has no `role`, `invited_by`, `approved_by`, or invitation semantics — only self-application + admin approval | Blocks owner-driven staffing and audit; only admins scale the manager base |
| G3 | Manager permissions enforced only in server actions; RLS for `event_registrations`/`sauna_managers` unknown (tables absent from repo SQL) — and the general schema source-of-truth problem: **no migrations directory** | DB is not the security boundary; the proposed model can't even be verified against RLS that isn't in version control |
| G4 | `sauna_masters.user_id` nullable **and not unique**; RLS on UPDATE is `USING (true)` | One account can create unlimited master profiles; anyone can edit anyone's master profile — Layer 3 integrity broken (critical, REPOSITORY_AUDIT §8.1) |
| G5 | No `created_by` on `sauna_events` (or on `saunas`) | No creator attribution → no "manager edits own sauna's events" policy possible; no accountability trail |
| G6 | No affiliations table (SP-016 planned); single `home_sauna_id` | Master↔multi-sauna relationship unsupported (known, already specced) |
| G7 | `profiles` carries `first_name/last_name/email` (live DB, 2026-06-24) but no avatar; the columns exist only in the live schema, not in versioned SQL | Identity surface mostly covered; remaining gap is schema provenance (part of G3) and avatars (minor) |
| G8 | No verification fields anywhere (`verified_at/by` on saunas/masters), no evidence storage for claims | Ownership claims (§3.2) and Phase 7 verification have nowhere to record outcomes |
| G9 | No invitations table / no email-redeemable grants | Invitation direction of §3.2 unsupported |
| G10 | Payments-readiness: `sauna_events.price` is free text; `event_registrations` has no price/transaction linkage; no transaction tables | Known (audit §9.3); confirms that ownership (payee!) must precede payments |
| G11 | `profiles.role` CHECK constrained to `user/moderator/admin` | Correct per §1.3 — this is a *feature*; the gap is only that docs (RLS.md) still describe 5 global roles and must be aligned to the contextual model |
| G12 | No audit/log table for privileged or ownership-changing actions | Ownership transfers and role grants are irreversible-ish actions with no trail |
| G13 | `sauna_events` has no kind (session vs event, §1.6), no organizer attribution (organizing master or facility), no ticketing fields | The session/event split is unrepresentable; J8 blocked; Phase 6 ticketing has no anchor |

**Overall verdict:** the current model is *directionally correct* (contextual
`sauna_managers` rather than a global role was the right instinct) and the
proposed ownership model is an **evolution, not a rewrite**: add a role to the
membership relationship, add creator attribution, link and constrain master
profiles, and move enforcement into RLS. Nothing implemented so far
contradicts the target model.

---

# 4. Permission Model

## 4.1 Capability matrix

Capabilities, not endpoints. ✅ allowed · Ⓢ allowed within scope (own object /
assigned sauna) · ⬜ no.

| Capability | Guest | User | Master | Manager | Owner | Moderator | Admin |
|---|---|---|---|---|---|---|---|
| View approved public content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reviews / comments / favourites / interests | ⬜ | Ⓢ own | Ⓢ⁶ | Ⓢ⁶ | Ⓢ⁶ | Ⓢ +remove any | ✅ |
| Register for event / cancel own | ⬜ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit sauna | ⬜ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Apply: master / manager / ownership claim | ⬜ | ✅ | ✅¹ | ✅ | ✅ | — | — |
| Edit master profile | ⬜ | ⬜ | Ⓢ own | ⬜ | ⬜ | ✅ | ✅ |
| Add certificates (→ moderation) | ⬜ | ⬜ | Ⓢ own | ⬜ | ⬜ | ✅² | ✅² |
| Respond to event assignment | ⬜ | ⬜ | Ⓢ own | ⬜ | ⬜ | ✅ | ✅ |
| Create/edit sessions (seanse, §1.6) | ⬜ | ⬜ | Ⓢ own³ | Ⓢ sauna | Ⓢ sauna | ✅ | ✅ |
| Create/edit events (ticketed, §1.6) | ⬜ | ⬜ | ⬜ | Ⓢ sauna | Ⓢ sauna | ✅ | ✅ |
| Confirm/reject registrations | ⬜ | ⬜ | Ⓢ own sessions | Ⓢ sauna | Ⓢ sauna | ✅ | ✅ |
| Facility photos & operational profile | ⬜ | ⬜ | ⬜ | Ⓢ sauna | Ⓢ sauna | ✅ | ✅ |
| Facility identity fields, close listing | ⬜ | ⬜ | ⬜ | ⬜ | Ⓢ sauna | ✅ | ✅ |
| Appoint/remove managers | ⬜ | ⬜ | ⬜ | ⬜ | Ⓢ sauna | ⬜ | ✅ |
| Transfer ownership | ⬜ | ⬜ | ⬜ | ⬜ | Ⓢ⁴ | ⬜ | ✅ |
| (future) Pricing, payout account | ⬜ | ⬜ | ⬜ | ⬜ | Ⓢ sauna | ⬜ | ✅⁵ |
| Moderation queues (submissions/masters/certs) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ✅ | ✅ |
| Resolve ownership claims | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ✅ | ✅ |
| Global roles, dictionaries, settings, deletes | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ✅ |

¹ a master applying for affiliation with a sauna. ² moderator/admin additions
are auto-approved. ³ at affiliated saunas; at other facilities only with
facility approval (§8 Q11). ⁴ initiates; admin confirms. ⁵ admin operates
refunds/disputes, not the owner's account. ⁶ never on their own/managed
facility or on happenings they organize (decided 2026-07-11, §8.0.3); no
attendance requirement otherwise (§8.0.2).

## 4.2 Enforcement principles

1. **The database is the boundary.** Every row in the matrix must ultimately be
   an RLS policy or SECURITY DEFINER function; server actions are the second
   layer, UI the third. (RLS.md principle; currently violated for
   manager-scoped actions.)
2. **Contextual checks are relationship lookups**, not role string comparisons:
   "is owner/manager of sauna X", "is the user linked to master Y". Global role
   checks are reserved for moderator/admin rows.
3. **Additive capabilities** — being a manager must never *reduce* what the
   same person can do as a user (they can still register for events at other
   saunas and review them). One exception, decided 2026-07-11: owners and
   managers must not review their own facility or its happenings, and
   organizers must not review what they organize (conflict of interest).
4. **Every grant has provenance**: who granted, when, and through which
   workflow (application / invitation / claim / submission). Required for
   disputes and for payments-era compliance.
5. **Moderation is content-scoped; administration is trust-scoped.** Moderators
   fix content; only admins change who holds power (roles, ownership,
   final manager say on ownerless saunas).

---

# 5. User Journeys

Canonical journeys the platform must support end-to-end. (Persona-level detail
in §2; these are the cross-persona flows.)

> **Workflow reference:** step-by-step business workflows (actors, triggers,
> main/alternative flows, implementation status) live in `docs/WORKFLOWS.md`
> — the central reference for sprint planning. The journeys below stay as the
> product-model rationale; WORKFLOWS.md is where their operational detail is
> maintained, not here.

**J1 — Discover → attend → review (the Core Loop).**
Guest finds event on map → event page → registers account → "Zapisz się"
(`pending`) → manager confirms (`confirmed`) → *notification* → attends →
post-event review → review feeds sauna & master ratings → follows master →
next event. *Status: works except notifications (gap) and follow (post-MVP).*

**J2 — Facility onboarding (claim).**
Owner finds imported listing → claims ownership with evidence → moderation →
owner → invites managers → managers publish events → registrations flow to
managers, not admins. *Status: only the manager-application fragment exists;
everything owner-related is missing.*

**J3 — Facility onboarding (new submission).**
User submits sauna → moderation approves → submitter becomes owner → J2
continues from "invites managers". *Status: submission→approval works; the
ownership grant at the end is missing.*

**J4 — Master career.**
User self-registers as master → moderation → adds certificates (moderated) →
affiliates with facility → facility assigns them to events → two-sided
confirmation → performs → collects reviews → ranking (SP-023) → verified badge
(Phase 7). *Status: registration/certificates work; own-profile security,
affiliations, assignment handshake, rankings missing.*

**J5 — Reservation with payment (Phase 5–6 target).**
User picks paid event → reserves → pays (held/captured) → confirmation →
attends (check-in) → payout to **owner** minus commission → receipt. Refund
path on cancellation within policy. *Status: unpaid skeleton of steps 1–4
exists (SP-022). Everything monetary depends on the Owner persona existing —
J5 is blocked on §3 G1/G10 by design, not by accident.*

**J6 — Private sauna rental (Phase 8 target).**
Host creates private listing → verification → publishes availability calendar
→ user books slot → pays → attends → mutual review. Reuses J5's payment rail
and §3's ownership; adds calendar inventory and address privacy.

**J8 — Master-organized session (second acquisition loop, §1.6).**
Master creates a session at an affiliated sauna → shares the SaunaPlanet link
with their social-media audience → followers land directly on the session page
→ register (creating accounts — this is master-driven user acquisition) →
master confirms registrations → session pulses on the map with the master's
satellite → attendees review → follow the master → discover the facility and
other happenings. *Status: entirely missing — requires the session/event kind
distinction, organizer attribution and master self-service. Strategically the
cheapest growth channel the platform has: masters bring audiences the platform
does not have to buy.*

**J7 — Moderation & trust (continuous).**
All pending queues → moderator resolves with reason → audit trail; user
reports content → moderator acts. *Status: queues work; reports and audit
trail missing.*

---

# 6. MVP Scope

"MVP" = what the user model needs before the platform can call itself a public
event-reservation platform (end of Phase 4 / Phase 5), with real facilities
operating self-service. Consolidated from the persona tables:

**Security & integrity (blocking public launch):**

1. Fix `sauna_masters` RLS: only linked master (own profile), moderator, admin
   may update; enforce unique `user_id` per master profile. (G4)
2. Make manager-scoped permissions real in the database, and get the schema
   (all SP-021/022 tables + policies) into version-controlled migrations. (G3)
3. Resolve the `is_admin()` vs moderator inconsistency — one deliberate
   moderator boundary. (§2.6)

**Ownership foundation (cheap now, expensive later):**

4. Introduce the owner/manager distinction in the membership relationship
   (G1/G2, minimal form: role column + "exactly one active owner" rule).
5. Ownership claim flow, even if operationally manual (claim = flagged
   application resolved by admin with evidence in notes). (§3.2)
6. Submitter-becomes-owner on approved sauna submissions. (J3)
7. Creator attribution (`created_by`) on events and saunas going forward. (G5)

**Closing the reservation loop:**

8. Self-service happenings: managers/owners create and edit events for their
   own saunas, and masters create own sessions at affiliated saunas — which
   requires the session/event kind distinction and organizer attribution on
   the data model (§1.6, G13). The platform must not require admin data
   entry. (§2.5, §2.4, J8)
9. Email notifications for registration outcomes (confirmed/rejected) and
   cancellations. (§2.2)
10. Registration lifecycle minimum: cancellation deadline; capacity respected
    on confirmation. (§2.2)
11. Block owners/managers from reviewing their own facility and organizers
    from reviewing their own happenings. (§8.0.3)

Explicitly **not** MVP: payments, waiting lists, invitations-by-email, owner
self-service manager approval, affiliations, rankings, verification badges,
private listings, business accounts, audit log, report system. Also not MVP:
the distinct **map visualization** for sessions vs events — the kind
distinction ships in the data model (item 8); the SaunaMap visual layer
(session pulse + organizer satellite) follows as Phase 4 completion (§7),
since `SaunaMap.tsx` is a protected high-risk area.

---

# 7. Post-MVP Roadmap

Sequenced to match ROADMAP.md phases; each item names its persona/§3 driver.

**Phase 4 completion — Sessions on the map (§1.6, J8)**

* Distinct map presence: session pulse (different from event pulse) +
  organizing-master satellite. Touches `SaunaMap.tsx` (protected area,
  CLAUDE.md) — plan and review with extra care.
* Share-optimized session pages: social preview cards (OG metadata) — the J8
  loop is link-driven, the link must look good on social media.
* Mobile-first session management for masters: create session, confirm
  registrations from the phone.

**Phase 5–6 — Reservations & Payments**

* Waiting lists, attendance/check-in (Manager J1/J5).
* Notification expansion: reminders, waitlist promotion, push (PWA).
* Priced events (structured price replacing free text), transactions,
  receipts; payout account on the **owner** (G10 → J5).
* Owner billing surface; admin payment operations (refunds/disputes).
* Audit log becomes mandatory with the first real transaction. (G12)

**Phase 7 — Verification & Authority**

* Facility and master verification workflows + badges (G8).
* Ownership claim hardening: evidence upload, verification levels.
* Report/flag system; moderation audit trail (J7).
* Rankings SP-023 + settings panel SP-027.

**Phase 8 — Private Sauna Ecosystem**

* Private listing type with host-as-owner at creation (§2.8, reuses §3).
* Availability calendars, slot reservations on the J5 payment rail.
* Host identity verification (C2C trust), address privacy.

**Phase 9 — Premium & Business**

* Business accounts (analytics, promotion) attached to owners.
* Organization accounts if co-ownership/chains demand it (§3.2).
* Premium user subscriptions; follows + alerts for masters/saunas.

**Continuous**

* Invitations (owner → manager; facility → master affiliation) with
  email-redeemable grants (G9).
* Two-sided event-assignment handshake for masters (§2.4).
* Master profile claim flow for unlinked legacy profiles.

---

# 8. Open Questions

## 8.0 Resolved (2026-07-11)

1. **Master as organizer → the session/event split.** Yes, a master can
   organize happenings — but as **sessions (seanse/rytuały)**, a distinct kind
   from **events**. Sessions: master-organized, promoted by the master via
   SaunaPlanet links on social media, master visible as satellite of the
   sauna, distinct pulsing on the map. Events: larger productions, separately
   ticketed, facility-organized. Full model in §1.6.
2. **Review eligibility.** Reviews do **not** require a confirmed registration
   or attendance — open to all logged-in users. Revisit only if review abuse
   appears (attendance-gating is the ready remedy once reservations are
   universal).
3. **Self-reviews.** Owners and managers must **not** review their own
   facility (decided). This document adopts the natural corollary: organizers
   (masters for their sessions, facilities for their events) must not review
   their own happenings — flag at implementation time if this extension
   should be narrowed.

## 8.1 Open

4. **Moderator scope.** Community moderators (content-only, no admin panel
   tabs beyond queues) vs staff moderators? Determines how strictly the
   §2.6 boundary must be enforced in DB vs convention.
5. **Ownership evidence standard.** What proves ownership of an imported PTS
   facility — business email domain, phone on listing, document? Needed before
   the claim flow can be trusted; interim manual admin judgment is acceptable.
6. **One person, conflicting hats.** A manager of sauna A who is also a master
   performing at sauna B is fine; a *moderator* who owns a sauna is a conflict
   — recuse from own-facility moderation? Policy needed before recruiting
   moderators.
7. **Organization accounts timing.** Chains exist in Poland (thermal groups).
   When the first multi-facility owner arrives, is person-owns-N-saunas enough
   (yes, per §3.2), and what is the trigger for building org accounts?
8. **Deployment/traffic reality** (REPOSITORY_AUDIT §11.1). If real users are
   already active, §6 items 1–3 stop being "MVP scope" and become immediate
   security remediation.
9. **Guest checkout** (Phase 6): can a guest pay for a reservation with only an
   email, account created implicitly? Standard conversion booster; affects
   auth flow design later.
10. **PTS relationship.** If a partnership with Polskie Towarzystwo Saunowe
    materializes, does PTS get a persona (bulk-verified facilities, certificate
    authority for §2.4 certifications)?
11. **Sessions at non-affiliated saunas.** Default in this document: an
    approved affiliation (home sauna today, SP-016 later) lets a master
    publish sessions without per-session approval; at any other facility the
    facility must approve the session. Confirm this consent mechanism before
    implementing master self-service.
12. **Paid sessions.** Sessions are not separately ticketed today (§1.6). If
    paid master-led sessions ever appear, the master becomes a payee —
    requiring master payout accounts and a facility/master/platform revenue
    split. Decide only when demand appears; until then no money attaches to
    sessions.
13. **Master-organized ticketed events.** Can a master organize a full
    *event* (touring Aufguss show sold by the master)? Currently no — events
    are facility-organized (§1.6) and the owner is the sole payee (J5).
    Reopening this requires the Q12 payout model first.

---

# 9. Recommendations

1. **Adopt the three-layer model (§3.1) as final now.** It is compatible with
   everything implemented and everything planned. Specifically: freeze
   `profiles.role` at `user/moderator/admin` forever; all facility power flows
   through membership relationships; all professional identity through linked
   profiles. Update RLS.md's aspirational 5-role list to reference this
   document.
2. **Fix the two integrity holes before anything else** — `sauna_masters`
   open UPDATE policy and the missing user↔master uniqueness. They undermine
   the platform's core differentiator (trustworthy masters).
3. **Introduce the owner concept in its minimal form immediately** (role on
   the membership relationship + submitter-becomes-owner + claim-flagged
   applications). The longer saunas remain ownerless, the more painful the
   retrofit — every new feature (photos, events, reservations) is currently
   being wired to *admin* instead of to *owner/manager*, and each one adds to
   the migration bill. This is the cheapest expensive-later decision in the
   backlog.
4. **Move manager/owner enforcement into RLS and put the schema into
   migrations.** The proposed permission model cannot be reviewed, tested or
   trusted while policies live only in the live database (G3). This also
   unblocks every future RLS-dependent feature.
5. **Prioritize manager self-service for events (§6.8) over any new
   user-facing feature.** It converts the platform from admin-operated to
   facility-operated — the single biggest scalability unlock in the current
   phase, and it exercises the new ownership model end-to-end.
6. **Close the reservation loop with notifications (§6.9) before promoting
   reservations publicly.** A pending registration that resolves silently
   breaks J1, the loop the whole product is built on.
7. **Design every reservation/payment feature against J5 with the owner as
   payee**, even while payments are unbuilt. Concretely: structured price on
   events, transaction-linkable registrations, and no flow where money-like
   state attaches to a manager or to the platform role model.
8. **Keep the private-host test (§3.2) in every design review**: "does this
   still work for one person with a garden sauna and no staff?" It is the
   cheapest way to keep Phase 8 open.
9. **Questions 1–3 are decided (§8.0) — treat them as binding.** Implement
   the session/event split as part of MVP item §6.8 and the self-review block
   as §6.11; decide Q11 before master self-service ships, and Q12–Q13 before
   Phase 6 payments.
10. **Start an audit trail no later than the first ownership transfer or the
    first payment**, whichever comes first (G12). Provenance (§4.2.4) can be
    added to new grants immediately at near-zero cost (`approved_by`,
    `invited_by` columns on new workflow records).
