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

Status: PLANNED

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

Status: PLANNED

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

# SP-025 Sauny prywatne (marketplace)

Status: PLANNED

Zakres:

* prywatni właściciele mogą dodać swoją saunę
* dostępność kalendarza
* rezerwacje z płatnością
* recenzje
* oddzielna kategoria na mapie
