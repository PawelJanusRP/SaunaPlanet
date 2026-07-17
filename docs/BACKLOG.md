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
