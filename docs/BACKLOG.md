satelity wielu saunamistrzów
klikane satelity
profile saunamistrzów
certyfikacja
logowanie
role i uprawnienia
panel administracyjny
płatności
rezerwacje
sauny prywatne
ranking saun
ranking saunamistrzów
system ocen (gwiazdki dla saun, saunamistrzów, eventów)

# formularz zgłaszania sauny - ulepszenia
- kliknięcie na mapę otwiera formularz zgłoszenia z automatycznie ustawioną lokalizacją
- możliwość dodania zdjęć w formularzu zgłoszenia

# workspace — small improvements

- **ParticipationModerationActions should refresh the current route after
  resolution**, matching the SP-037B proposal-queue freshness pattern
  (`EventProposalActions` calls `router.refresh()` on success and on
  stale-error; the older SP-037 request queue still relies on
  `revalidatePath` alone, which does not repaint the open route — same
  staleness class as the R1 defect). One-line follow-up, recorded
  2026-07-19.

# map — small improvements

- **Map satellite fallback for approved event masters without an avatar**
  (recorded 2026-07-19, SP-037B E2E): today satellites render only masters
  with `avatar_url` set (documented rule — KNOWN_ISSUES "Sauna Master
  Satellite System"; `SaunaMap.tsx` filters on it, while the map RPC and
  the public lineup already include avatar-less masters). Intended future
  behavior: render a neutral fallback satellite (placeholder circle)
  instead of hiding the master entirely. Not implemented — SaunaMap is a
  protected area; do it as a deliberate small change with visual review.

# kalendarz eventów użytkownika
- użytkownik może dodać event do swojego kalendarza
- widok "moje eventy" z listą nadchodzących eventów
- powiadomienia o nadchodzących eventach

---

# SP-019 Ulepszone zarządzanie sauną w panelu admin

Status: IN PROGRESS

Zakres:

* Tab "Sauny" — lista wszystkich saun z inline edycją (nazwa, miasto, opis, strona, kategoria, status) i usuwaniem
* Tab "Eventy" — lista wszystkich eventów z możliwością zmiany statusu (approve/reject) i usuwania
* Tab "Recenzje" — lista wszystkich recenzji z możliwością usuwania przez admina

Komponenty:
* EditSaunaAdminForm.tsx — inline formularz edycji sauny
* EventModerationActions.tsx — przyciski approve/reject/delete dla eventów
* DeleteReviewButton.tsx — usuwanie recenzji

Actions (app/(main)/admin/actions.ts):
* updateSaunaAdmin(id, data)
* deleteSaunaAdmin(id)
* updateEventStatusAdmin(id, status)
* deleteEventAdmin(id)
* deleteReviewAdmin(id)

---

# SP-020 Mój profil i ulubione

Status: DONE

Zakres:

* zalogowany użytkownik może oznaczyć saunę jako ulubioną (toggle)
* zalogowany użytkownik może oznaczyć event jako "idę" (toggle)
* strona /profile pokazuje: ulubione sauny, nadchodzące eventy użytkownika
* schema kompatybilna z przyszłymi rezerwacjami

Proponowane tabele:
* user_favorites (user_id, sauna_id, created_at)
* user_event_interests (user_id, event_id, status: 'going'/'interested', created_at)

---

# SP-021 Recenzje i komentarze eventów

Status: DONE

Zakres:

**Recenzje eventów (po wydarzeniu):**
* zalogowany użytkownik może wystawić ocenę (1-5 gwiazdek) + opcjonalny tekst po zakończeniu eventu
* event_date < today → formularz recenzji widoczny
* jeden użytkownik = jedna recenzja eventu
* overall rating eventu (średnia z recenzji) widoczny na stronie /events/[id]

**Komentarze do przyszłych eventów:**
* zalogowany użytkownik może dodać komentarz (tekst, bez gwiazdek) do eventu który jeszcze się nie odbył
* event_date >= today → formularz komentarza widoczny
* lista komentarzy widoczna dla wszystkich

**Overall rating sauny z eventów:**
* na stronie przyszłego eventu (/events/[id]) wyświetlany jest zagregowany rating poprzednich eventów TEJ sauny
* "Poprzednie eventy w tej saunie: 4.2 ★ (12 ocen)" — umożliwia ocenę jakości organizatora

Proponowane tabele:
* event_reviews (id, event_id, user_id, rating INT 1-5, comment TEXT, created_at) — recenzje po evencie
* event_comments (id, event_id, user_id, comment TEXT, created_at) — komentarze przed eventem

RLS:
* event_reviews INSERT: auth.uid() IS NOT NULL AND event już się odbył
* event_comments INSERT: auth.uid() IS NOT NULL AND event jeszcze się nie odbył
* SELECT: publiczne dla wszystkich
* DELETE: własne lub admin/moderator

---

# SP-022 Rezerwacje eventów

Status: PLANNED

Zakres:

* przycisk "Zapisz się" na stronie /events/[id]
* tabela event_registrations (id, event_id, user_id, status: pending/confirmed/cancelled, created_at)
* admin/moderator potwierdza lub odrzuca zapisy
* limit miejsc (max_participants na sauna_events)
* bez płatności — placeholder na przyszłość

---

# SP-023 Ranking saun i saunamistrzów

Status: PLANNED

Zakres:

* ranking saun na podstawie średniej ocen (sauna_reviews + event_reviews)
* ranking saunamistrzów na podstawie ocen eventów, w których brali udział
* strona /ranking lub sekcja na mapie
* odznaki: Top 10, Najlepszy Mistrz miesiąca

---

# SP-024 Płatności za eventy

Status: PLANNED

Zakres:

* integracja z operatorem płatności (Stripe lub Przelewy24)
* płatność przy rejestracji na event
* webhook potwierdzający płatność → zmiana statusu rejestracji
* zwroty przy anulowaniu

---

# SP-026 Przypisywanie saunamistrzów do saun (wiele do wielu, role)

Status: PLANNED — **część afiliacyjna wchłonięta przez SP-035 Master Studio
Foundation (Decision 016)**; aktualny model produktowy afiliacji:
PLATFORM_WORKSPACES §5.2 (bez definiowania kolumn — poniższy szkic tabeli
jest historyczny i zostanie zaprojektowany na nowo przy implementacji).
Uwaga: rola `owner` w szkicu poniżej jest nieaktualna — własność obiektu
żyje w relacji membership (USER_MODEL §3), nigdy w afiliacji mistrza.

Zakres:

* saunamistrz może być przypisany do wielu saun z określoną rolą per sauna
* zastępuje obecne podejście `home_sauna_id` (jeden rekord)
* role w relacji: `resident` (stały), `guest` (gościnny), `owner` (właściciel)
* status per relacja: `pending / approved / rejected`
* admin/moderator zarządza przypisaniami z panelu admina

Proponowana tabela:

```sql
CREATE TABLE sauna_master_affiliations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   UUID NOT NULL REFERENCES sauna_masters(id) ON DELETE CASCADE,
  sauna_id    UUID NOT NULL REFERENCES saunas(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'resident',  -- resident | guest | owner
  is_primary  BOOLEAN DEFAULT false,             -- główna sauna mistrza
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (master_id, sauna_id)
);
```

Migracja:

* istniejące wartości `sauna_masters.home_sauna_id` → wiersze w tej tabeli z `role='resident', is_primary=true, status='approved'`
* `home_sauna_id` można zachować tymczasowo dla backward compat, potem usunąć

RLS:

* INSERT: admin/moderator lub sam saunamistrz (własne przypisania → pending)
* UPDATE/DELETE: admin/moderator
* SELECT: publiczne dla approved

UI:

* profil saunamistrza → lista saun z rolą i statusem
* strona sauny → lista saunamistrzów z rolą
* panel admina → zakładka "Przypisania" z moderacją pending

Zobacz też: FEATURES.md SP-016

---

# SP-030 Native Mobile App (Expo)

Status: PLANNED

Goal:

Build a native mobile app reusing the SaunaPlanet Supabase backend and product model.

## Phase 1 — Architecture and Foundation

* Expo project setup (monorepo or separate repo)
* shared API layer — Supabase client reused from web
* shared authentication — Supabase Auth with Expo SecureStore
* navigation structure (Expo Router)
* design tokens / shared styles

## Phase 2 — Android

* Android release build
* Google Play Store submission
* core screens: map, sauna detail, events, profile
* push notifications (Expo Notifications)

## Phase 3 — iOS

* iOS release build
* Apple App Store submission
* feature parity with Android

Dependencies:

* SP-029 (PWA installability — baseline UX patterns before native)
* Supabase backend (shared across web and native)

See also: Mobile Roadmap in docs/ROADMAP.md

---

# SP-025 Sauny prywatne (marketplace)

Status: PLANNED

Zakres:

* prywatni właściciele mogą dodać swoją saunę
* dostępność kalendarza
* rezerwacje z płatnością
* recenzje
* oddzielna kategoria na mapie

---

# SP-038 Smart Facility Import (Universal Import Engine)

Status: **CLOSED — deployed to production 2026-07-27**
(docs/SP038_SMART_IMPORT_ARCHITECTURE.md). Slices 1–3C delivered: website
provider (Open Graph / metadata / JSON-LD with deterministic per-field
merge), SSRF-safe fetch, duplicate detection, editable preview on
`/submit`, import→submission linking, social links, controlled image
import with explicit consent, Storage authorization hardening, moderation
provenance panel. **Deferred to backlog slices** (not blocking): Facebook
best-effort extraction, paste-text fallback, AI-assisted extraction, and
the SP-038 operational items now tracked under "Security and operations
backlog" below (HTML-entity decoding of extracted text, supported-API
Storage cleanup for orphaned blobs, import_log retention). The original
scope below is preserved for reference.

**Supersedes the "URL-assisted submission" phase originally sketched as
SP-036 slice 4** (docs/SP036_ARCHITECTURE.md §1.3, §9.4 phase 4 —
deliberately detachable there; the honest-constraints analysis of FB/IG
extraction in §1.3 remains the reference).

## Goal

Reduce the effort required to contribute new sauna facilities: paste a
link → receive a pre-filled submission form. Extends the moderated SP-036
submission workflow — **every imported facility goes through the existing
moderation process; nothing becomes public without approval.**

## Initial supported sources (priority order)

1. Official website
2. Facebook page
3. Google Maps place
4. Instagram profile (where feasible)

The architecture must make adding future providers easy without
redesigning the system.

## Import workflow

```
"Import facility" → paste URL → automatic provider detection
  → fetch publicly available metadata → extract available information
  → duplicate detection → editable preview → user reviews/edits
  → submit → existing SP-036 moderation workflow
```

## Candidate fields

facility name, short description, address, city, coordinates (when
available), website, Facebook URL, Instagram URL, phone, email, opening
hours, profile image, gallery candidates, categories, tags. Only import
information that is publicly available and legally usable.

## Duplicate detection

Execute the existing detection (find_similar_saunas) before submission;
show possible duplicates; allow the user to continue; the final decision
remains with moderators.

## Architecture — provider-based import pipeline

```
Import Provider → Normalize → Validation → Duplicate Detection
  → Editable Preview → Existing Submission Pipeline
```

Each provider implements the same interface. Future extensions the design
must not preclude: Booking, TripAdvisor, Yelp (where applicable),
OpenStreetMap, structured metadata (schema.org / JSON-LD), AI-assisted
extraction from arbitrary websites.

## UX

Never present raw imported data — always an editable review step before
submission; clearly indicate which fields were automatically imported.

## Security

Do not bypass moderation or validation; do not create facilities
automatically; do not grant ownership or management rights. (Carry over
the SP-036 §1.3/§4.4 requirements: SSRF guard, timeouts, size caps,
decoded-image validation and re-encode, rate limiting, import_log audit —
the import_log table from the SP-036 migration is the intended audit
sink.)

## Deliverables

Provider-based import architecture, reusable import engine, initial
provider implementations, documentation for adding future providers,
complete integration with the SP-036 submission workflow.

---

# SP-039 Saunamaster Pilot Foundation

Status: **ACTIVE PRODUCT SPRINT** (Slice 1 CLOSED/deployed 2026-07-27;
Slices 2–6 planned). Full slice structure and pilot phase:
docs/ROADMAP.md §SP-039 / §SP-039P.

Highest current product priority: a controlled private pilot with the first
10 sauna masters. The sprint delivers the master profile plus a
**profile-claim onboarding workflow** — administration prepares a profile
and issues a secure claim link; the invited master authenticates with
**their own account** (administration never creates passwords or
transferable credentials) and atomically claims the prepared profile.

**Six independent states — never collapse into one boolean/status:**
profile *prepared* by SaunaPlanet · profile *claimed* by an authenticated
owner · *identity verified* · *qualifications verified* · *Founding
Partner* · profile *approved / published*.

## Slice 1 — Expanded Master Profile Foundation — CLOSED

Merged + deployed to production 2026-07-27
(SHA `e3b037c3da880a1f5f22d5391cc517a1c43e09ca`). Delivered: expanded
profile model (slug + UUID/slug dual lookup, city, specialties, languages,
experience year, social links, website, cover image, Founding Partner
badge, approved affiliations, hide-empty, rating hidden when
`review_count = 0`), completeness library, Studio editor for approved
masters, avatar/cover upload, privileged-field guard + Storage hardening,
production-safe Server Action error handling, restored `masters_select`
own-row visibility. Migrations:
`supabase/2026-07-27_sp039_master_profile.sql`,
`supabase/2026-07-27_sp039_masters_select_fix.sql`. Deferred to Slice 5:
pending-master profile editor (currently hidden by `StudioAccessNotice`).

## Slice 2 — Claim Architecture and Security Review (NEXT)

Architecture/security review only — **no implementation**. Must define:
prepared-profile lifecycle; claim-invitation lifecycle; profile-ownership
lifecycle; claim-token model (high-entropy random generation, hashed at
rest, expiry, revocation, one-time use, replay protection, rate limiting);
claim audit trail; sign-in / registration / email-confirmation return
flows with claim-context preservation across authentication; atomic
ownership assignment; conflict handling (duplicate account, duplicate
master profile, concurrent claim); manual moderator recovery; publication
and moderation states; RLS boundaries; `SECURITY DEFINER` RPC boundaries;
public preview data boundaries; privacy implications; pending-master Studio
access; image upload before/after claim; failure and rollback behavior.
Stops after architecture, SQL/RLS design, threat analysis and
implementation plan.

Unresolved architectural decisions to settle in Slice 2 (for review):

* **Where the prepared-profile state lives** — reuse `sauna_masters` with
  an `unclaimed`/prepared marker and a null `user_id`, or a separate
  `prepared_master_profiles` staging table promoted on claim. Trade-off:
  reusing `sauna_masters` keeps one profile identity and existing public
  rendering, but requires new RLS to keep unclaimed rows out of public
  read; a staging table isolates them but duplicates the profile shape.
* **Invitation ↔ profile cardinality** — one invitation per prepared
  profile (simplest) vs regenerate-able tokens against the same profile.
* **Token transport** — token in the URL path/fragment vs an opaque id +
  secret; hashing algorithm and per-token salt.
* **Claim-context preservation** across sign-in / register / email
  confirm — signed state param vs a short-lived server-side pending-claim
  row keyed to the token.
* **`masters_select` interaction** — unclaimed prepared profiles must not
  leak publicly nor to arbitrary authenticated users before claim; define
  the exact SELECT arm (and reconcile with the Slice 1 own-row policy).
* **Duplicate-master-profile guard** — the live `sauna_masters.user_id`
  unique index already enforces one profile per account; the atomic claim
  must fail closed against it and surface a clear conflict path.
* **Founding Partner assignment** stays moderator-only (privileged-column
  guard) and is never granted by the claim itself.
* **Public preview boundary** — which prepared-profile fields the claim
  preview screen may show before authentication (name/photo yes; contact
  and any private notes no).

The full Slice 2 design resolving these — data model, invitation state
machine, token security, atomic claim RPC contract, RLS matrix, threat
model, migration sequencing — is `docs/SP039_CLAIM_ARCHITECTURE.md`; its §22
lists the decisions still awaiting explicit owner approval.

## Slice 3 — Admin-Prepared Profiles and Claim Invitations

Admin draft creation + editing of all pilot fields; readiness status;
invitation creation with secure token generation and token-hash
persistence; expiry, revoke, regenerate; sent/opened/claimed timestamps;
invitation status management; pilot-candidate table; copyable invitation
message for manual sending via email / Messenger / WhatsApp — **no
mandatory automated email delivery in the MVP**. Suggested invitation
states: `created`, `ready`, `sent`, `opened`, `claimed`, `expired`,
`revoked` (final names after repository-convention inspection).

## Slice 4 — Authentication Return and Atomic Claim

Invitation preview; sign-in; registration; email confirmation; return to
claim after authentication; explicit **"This is my profile"** confirmation;
atomic claim RPC; ownership assignment; invitation consumption; audit
entry; redirect to the prefilled Studio editor. The atomic operation
revalidates server-side: authenticated user; valid token; correct token
hash; not expired; not revoked; not already used; target profile not
already claimed; account not already attached to another master profile;
no conflicting concurrent claim succeeded. Negative + concurrency tests
documented.

## Slice 5 — Pilot Onboarding Experience

"We prepared your profile" screen; prefilled profile editor; pending-master
Studio mode (**resolves the Slice 1 deferred `StudioAccessNotice`
behavior**); completeness checklist; useful empty states; preview before
publication; incorrect-data and incorrect-affiliation reporting;
verification labels; moderator-only Founding Partner assignment; pilot
instructions; admin onboarding-status view for the 10 participants.

## Slice 6 — Pilot E2E and Production Readiness

Authorization matrix; RLS/RPC tests; token expiry / revocation / replay;
claim concurrency; new-account and existing-account paths;
email-confirmation return path; mobile flow; moderator recovery; rollback;
Preview E2E; Production migration + verification; launch readiness for the
first two participants.

---

# SP-039P Controlled Sauna Master Pilot

Status: PRODUCT / OPERATIONAL PHASE (not a large implementation sprint).
Full definition: docs/ROADMAP.md §SP-039P. Runs after SP-039's claim +
onboarding workflow is ready, and is **gated by SP-040** (free-tier
guardrails must be live before broad invitations).

Waves: **2 → 3 → 5** masters, stopping to collect feedback and fix blockers
between waves. Metrics: profiles prepared / invitations generated / sent /
links opened / registration started / email confirmed / claim completed /
profile completeness / published / time-to-claim / time-to-publication /
admin interventions / duplicate-conflict cases / corrected prepared data /
rejected prepared data / qualitative feedback / public sharing. Entry and
exit criteria: docs/ROADMAP.md §SP-039P.

---

# SP-040 Platform Operations and Free-Tier Guardrails

Status: PLANNED (recorded 2026-07-27). **Supersedes and absorbs the earlier
"Platform Capacity & System Health Dashboard"** (same theme; the earlier
capacity-dashboard scope is preserved as Slices 2–4 below). Must be
completed **before invitations go to all 10 SP-039P pilot participants**.
Documentation/backlog entry only — nothing is implemented, no migrations
exist.

## Goal

Provide an internal administration dashboard that shows whether Supabase
and Vercel usage is approaching free-tier capacity, reliability,
performance or cost limits, so the platform never silently exceeds a
provider limit before or during the pilot.

## Principles

* **Do not hardcode current plan limits without verification** — provider
  limits can change; limit values and thresholds must be configurable.
* **Every metric identifies its source** and shows its **last refresh
  time**.
* **Do not display metrics that cannot be obtained reliably.**
* **Begin with an API and observability feasibility review** — verify what
  is actually available before designing the UI.
* The dashboard must NOT query infrastructure providers directly from the
  browser: a scheduled collector writes a snapshot table (candidate
  `system_metrics_snapshots`) consumed by `/admin/system` (admin-only; RLS
  + server-side checks, consistent with the Server Actions + RLS boundary).
* Guard against the monitoring itself consuming excessive resources.

## Slice 1 — Observability and Provider Capability Review

Determine: which Supabase metrics are available through API vs only in
Supabase Studio; which Vercel metrics are available through API vs require
a paid plan; which metrics can be calculated internally; refresh frequency;
data-retention strategy; security of provider credentials; risk that
monitoring itself consumes excessive resources.

## Slice 2 — Internal Application Metrics

Users; registrations; sauna masters; claimed profiles; events; photos;
imports; audit rows; largest tables; daily growth; monthly growth;
application errors; RLS failures; RPC failures.

## Slice 3 — Provider Usage Dashboard (where technically available)

**Supabase** — database size; Storage size; bandwidth; Auth usage; active
users; Realtime usage; function usage; table growth; error indicators.
**Vercel** — requests; transfer; function invocations; function execution
duration; deployment failures; 4xx/5xx errors; image optimization; cache
usage; billing-period context.

## Slice 4 — Guardrails and Alerts

Configurable thresholds: **60% Information / 75% Warning / 90% Critical**.
Anomaly detection: sudden Storage growth; registration spike; photo-upload
spike; import abuse; error spike; serverless execution spike; predicted
time-to-limit based on recent growth. Initially alerts may be visible only
inside the administration dashboard (notification channels later).

---

# SP-041 Recurring Sauna Sessions

Status: PLANNED (recorded 2026-07-27). **Relocated out of the SP-039
architecture** — recurrence is important but must not block the claim
pilot. Authoritative session model: docs/EVENT_SESSION_MODEL.md.

## Approved recurrence decisions (preserved)

* weekly; biweekly; up to **3 selected weekdays**;
* maximum **3 months** horizon; maximum **40 generated occurrences**;
* **no infinite recurrence**; require confirm/extend after the horizon;
* deterministic **date preview** before submission;
* **atomic generation** (the whole approved series and its occurrences, or
  nothing);
* store a recurrence-series definition **and generate concrete event
  occurrences** — never a virtual calendar rule with no concrete records;
* each generated occurrence remains independently editable, cancellable,
  moderateable and usable by existing event workflows;
* managed / unmanaged facility routing (reuse SP-037/SP-037B);
* **whole-series manager acceptance** for managed facilities (one decision,
  not per occurrence);
* individual occurrence editing; **"this and future"** split semantics;
  series extension (up to another 3 months);
* **non-destructive cancellation metadata** — past occurrences are never
  rewritten and event history is preserved (evaluate additive cancellation
  fields rather than deleting generated events);
* Today-Queue reminders ~14 days before a series ends.

## Do not implement (out of MVP)

Second-Tuesday-of-month and similar patterns; last business day; arbitrary
RRULE editing; infinite recurrence; yearly patterns. Daily recurrence is
outside the MVP.

## Architecture direction (from SP-039 planning, to confirm in the sprint)

`sauna_event_series` table + `sauna_events.series_id` and occurrence
metadata; generation is timezone-safe by operating on local wall-clock
dates (`sauna_events.event_time` carries no timezone), which makes it
DST-immune; series creation runs through a controlled transactional
`SECURITY DEFINER` RPC that reuses the existing managed/unmanaged routing.
Confirm exact column names against the live schema during the sprint.

---

# SP-042 Facility Data Improvement Proposals

Status: PLANNED (recorded 2026-07-20, discovered during SP-038 Smart
Facility Import). Backlog entry only — **explicitly out of scope for
SP-038**. In SP-038 only the extension point is documented
(`docs/SP038_SMART_IMPORT_ARCHITECTURE.md`) and the existing warn-only
duplicate behavior is preserved unchanged.

## Motivation

When an import (or any future contribution path) matches an existing
facility but carries newer or more complete data — fresh opening hours,
a missing phone number, corrected coordinates — the platform currently
offers only two bad outcomes: create a duplicate or overwrite the
active record. Neither is acceptable. The system must eventually
support a **controlled facility data improvement proposal**: a
moderated, auditable "suggest an update" workflow instead of a write.

## Required properties (binding for the future design)

* **Managed and unmanaged facilities both covered** — for managed
  facilities the approved staff resolves proposals (platform moderation
  retains override); for unmanaged facilities platform moderation
  resolves them. Consistent with the SP-036/SP-037B consent model:
  nothing fabricates facility consent.
* **Field-level diffs** — a proposal is a set of per-field changes
  (current value → proposed value), not a full-record replacement.
* **Provenance per proposed value** — where the value came from
  (import source URL, extraction origin/confidence per the SP-038
  `ExtractedField` model, or manual user input) and when it was
  retrieved.
* **Partial acceptance** — the resolver accepts or rejects each field
  independently; accepting some fields must not force the rest.
* **Platform moderator override** — moderation can resolve any
  proposal regardless of facility management state.
* **Full audit history** — who proposed, from what source, who
  resolved, what was accepted/rejected, when; history is never deleted
  on resolution (unlike the current MVP withdrawal-deletes-history
  pattern noted in KNOWN_ISSUES).
* **Never touches the active record until acceptance** — the active
  facility row changes only at explicit field acceptance; proposals are
  additive rows, RLS-guarded, moderated.

## Relationship to existing work

* SP-038 duplicate detection (`find_similar_saunas`) stays warn-only;
  when a duplicate is detected during import, the future UX offers
  "propose an update to X" instead of submitting a near-duplicate.
* The SP-038 provenance model (field origin/confidence/source hint,
  `import_log`) is the intended data source for proposal provenance.
* Candidate future extension of the same mechanism: PTS re-sync and
  community corrections from facility pages.

---

# SP-043 Architecture, Performance & Scalability Review

Status: PLANNED (**renumbered 2026-07-27 from the earlier SP-040** when
SP-040 became Platform Operations and Free-Tier Guardrails; no
implementation had started, so the identifier could move — see the
renumbering note in docs/ROADMAP.md and docs/SPRINT_HISTORY.md). This is an
**architecture review sprint, not a feature sprint** — no optimizations are
implemented during it; the deliverable is an evidence-based optimization
roadmap.

## Goal

Perform a comprehensive technical review of SaunaPlanet before significant
user growth and before starting the native mobile application (SP-030).
Identify bottlenecks, unnecessary infrastructure costs, scalability risks,
architectural debt and optimization opportunities while the product is
still relatively small. **No assumptions** — every recommendation must be
supported by measurements, profiling or code inspection.

## Areas to review

1. **Database** — every major query: unnecessary `SELECT *`, missing
   indexes, inefficient joins, PostGIS optimization opportunities, RLS
   overhead, RPC opportunities, `EXPLAIN ANALYZE` results, future scaling
   risks.
2. **Map performance** — marker loading, viewport queries, clustering,
   lazy loading; estimate expected behaviour at 500 / 2,000 / 10,000+ /
   50,000+ saunas.
3. **Images** — storage usage, transfer, thumbnails, responsive images,
   WebP/AVIF, CDN caching, upload pipeline.
4. **Frontend performance** — React rendering, memoization, server/client
   boundaries, bundle size, lazy loading, route performance, hydration
   cost.
5. **Next.js architecture** — caching, ISR, dynamic rendering, Server
   Components, Route Handlers, opportunities for Edge rendering.
6. **Network usage** — payload sizes, API calls, duplicated requests,
   unnecessary downloads, browser caching.
7. **Realtime** — which features truly require realtime; identify
   candidates for polling or delayed refresh instead.
8. **Mobile readiness** — evaluate the architecture for the future React
   Native app: reusable domain logic, validation, API layer;
   Next.js-specific code that should be extracted.
9. **Infrastructure costs** — model expected resource usage and operating
   costs at ~100 / 1,000 / 10,000 / 100,000 users across database,
   storage, bandwidth, Vercel, Supabase.
10. **Security** — another security review; verify recent changes have not
    introduced regressions.
11. **SEO** — metadata, structured data, indexing, performance, sitemap,
    discoverability.
12. **Accessibility** — keyboard navigation, screen readers, color
    contrast, mobile usability.

## Deliverables

A comprehensive architecture review document. Every finding includes:
description, measured impact, priority, implementation effort, expected
benefit. Every recommendation classified:

* **P1** — implement immediately
* **P2** — before large public launch
* **P3** — before 10× growth
* **P4** — long-term improvement

---

# Later backlog (unscheduled)

Normalized future themes — recorded so they are not lost; not yet assigned
sprint numbers or a slice plan.

## Notifications and invitation lifecycle

* claim-invitation notifications (SP-039 claim links);
* invitation expiry reminders;
* claim reminders;
* event-invitation notifications (W-10 facility→master invitations);
* withdrawal history (retain history for withdrawn requests/invitations
  instead of the current delete-on-withdraw MVP — see KNOWN_ISSUES);
* notification digest.
* (Existing follow-up already recorded above: **ParticipationModerationActions
  route refresh** — the SP-037 request queue still relies on
  `revalidatePath` alone.)

## Master discovery and following

* master directory; search; filters by city, region, language and
  specialty (SP-039 Slice 1 added the underlying fields: `city`,
  `specialties`, `languages`);
* follow a master; event notifications for followed masters;
* shareable profile (SP-039 slug is the shareable canonical URL);
* profile QR code.

## Reviews and reputation

* event-linked reviews; moderation; replies; verified participation;
* **strict separation** of profile ownership, identity verification,
  qualification verification, and rating (mirrors the SP-039 independent
  states — never a single boolean);
* ranking only after sufficient trusted data (see SP-023);
* NB: `sauna_masters.rating` / `review_count` are legacy display columns,
  now moderation-only (SP-039 privileged-column guard); a real master
  review system does not yet exist.

---

# Security and operations backlog

Preserve or add — cross-cutting hardening and operational hygiene items.
Several were surfaced during SP-038 / SP-039 and are recorded here so they
are not lost.

* **Remove public auth-UUID exposure** — audit public read surfaces for
  leaked `auth.users` UUIDs (e.g. `master_affiliations.created_by/
  resolved_by` for approved rows, noted during SP-035/SP-037).
* **Audit-log retention** — define retention for audit rows.
* **import_log retention / test-operation metadata** — a policy for the
  append-only `import_log` (E2E left benign anonymized audit rows during
  SP-038; distinguish/retire test operations without a broad DELETE path).
* **Storage deletion through supported APIs** — the `master-avatars` and
  `sauna-images` buckets have no client DELETE policy, so temporary blobs
  can only be removed via Supabase Studio/service role; deleting
  `storage.objects` rows via SQL is blocked by `protect_delete` and
  orphans the binary. Provide a supported cleanup path.
* **Orphaned blob cleanup** — a supported job to remove blobs whose owning
  row was deleted (SP-038 image import + SP-039 avatar/cover uploads).
* **Safe `master-avatars` object deletion** — a moderator/owner-scoped
  delete path for master images (currently INSERT-only policies; no
  authenticated DELETE).
* **History for withdrawn requests and invitations** — event-participation
  withdrawal and facility invitations currently delete the row (MVP), losing
  history (KNOWN_ISSUES).
* **Public-view security audit** — periodic review that no unclaimed
  prepared profile, pending/rejected record, or private field leaks through
  a public read path (critical for SP-039 claim: unclaimed prepared
  profiles must not be publicly enumerable before claim).
* **Claim rate limiting** — rate-limit token submission/claim attempts
  (SP-039 Slice 2 threat model); reuse the rolling-window pattern from the
  SP-038 import rate limit where applicable.
* **Invalid-token monitoring** — surface repeated invalid/expired claim
  token attempts (replay / brute-force signal) into the SP-040 dashboard.
* **Schema drift detection** — detect live-vs-repo policy/schema drift.
  Motivated by the SP-039 discovery that the live `masters_select` policy
  had drifted from the versioned SP-035d definition (own-row arm missing),
  fixed by `supabase/2026-07-27_sp039_masters_select_fix.sql`.
* **Version undocumented live policies** — capture policies that exist on
  the live database but are not in versioned SQL, e.g. `masters_delete`
  (observed during SP-039 preflight), so the repo is the true source of
  truth.
* **HTML-entity decoding in extracted text (SP-038)** — decode entities such
  as `&amp;` in imported JSON-LD/metadata values.
