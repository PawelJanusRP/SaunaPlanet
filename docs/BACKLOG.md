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

# SP-040 Architecture, Performance & Scalability Review

Status: PLANNED (recorded 2026-07-18). This is an **architecture review
sprint, not a feature sprint** — no optimizations are implemented during
it; the deliverable is an evidence-based optimization roadmap.

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

# SP-041 Platform Capacity & System Health Dashboard

Status: PLANNED (recorded 2026-07-18; renumbered from the provisional
SP-040 when the Architecture Review sprint claimed that number).
Documentation/backlog entry only — nothing is implemented, no migrations
exist.

## Motivation

SaunaPlanet should proactively monitor platform capacity and infrastructure
usage before production growth requires emergency scaling. The goal is not
only observability, but **operational decision support**. The platform
should clearly answer:

* How healthy is the system?
* Which resource is becoming the bottleneck?
* How much capacity remains?
* When should we scale or optimize?
* Are users currently experiencing degradation?

## Scope (future sprint)

New administration section: **`/admin/system`** — privileged administrators
only. The dashboard should eventually include:

**Platform Health** — overall system status (healthy / warning / critical),
last refresh timestamp.

**Database** — database size, growth trend, active connections, connection
limit usage, slow queries, storage growth, estimated capacity exhaustion.

**Storage** — storage usage, image count, monthly transfer, growth trend,
estimated exhaustion.

**Traffic** — requests, active users, response times (p95), error rates,
API health.

**Product Metrics** — users, saunas, events, reviews, photos, pending
moderation queue, reservations, realtime connections.

**Forecasts** — trends instead of only current values: remaining capacity,
estimated limit date, weekly growth, monthly growth.

**Alerts** — configurable thresholds; suggested defaults: 60% → Watch,
75% → Warning, 90% → Critical. Future notification channels: email, admin
notifications, optional Discord/Slack.

## Architecture notes

The dashboard must NOT query infrastructure providers directly from the
browser. Data flows through a scheduled collector and a snapshot table:

```
Infrastructure Providers (Vercel / Supabase / internal metrics)
        ↓
scheduled collector
        ↓
system_metrics_snapshots
        ↓
Admin Dashboard (/admin/system)
```

Access: privileged administrators only (admin role; RLS + server-side
checks, consistent with the platform's Server Actions + RLS boundary).

Implementation candidates when scoped: Vercel Cron for the collector,
Supabase `pg_stat_*` views and the Supabase/Vercel management APIs as
sources, existing admin panel as the UI shell.
