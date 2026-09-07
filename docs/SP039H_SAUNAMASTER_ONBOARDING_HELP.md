# SP-039H — Saunamaster Onboarding and Help

Status: PLANNED (authoritative design + backlog document, recorded
2026-07-30). This is a planning/documentation workstream: **nothing here is
implemented by this document**, no screenshots or videos exist yet, and no
implementation may start without separate authorization.

Goal: the first saunamaster pilot must not depend on direct support from the
project owner. A newly invited saunamaster must be able to understand — on
their own, in Polish, on a phone — how to claim the prepared profile, enter
Master Studio, complete and publish the public profile card, add and manage
events, how moderation works, and where to get help.

Related: `docs/SP039_SLICE4_PUBLIC_CLAIM.md` (claim + publication),
`docs/SP037_MASTER_EVENTS_ARCHITECTURE.md` (events),
`docs/ROADMAP.md` §SP-039/§SP-039P, `docs/BACKLOG.md` §SP-039H.

---

## 1. Onboarding architecture — five layers

Layer 1 is the primary channel; the others reinforce it. All user-facing
content is Polish; all layers must work on mobile first.

### Layer 1 — In-application onboarding (primary)

A **Master Studio first-steps card** on `/studio` with a checklist:

| # | Step | Kind | Derived from (no duplicated state) | Links to |
|---|------|------|------------------------------------|----------|
| 1 | Przejmij swój profil | required | `sauna_masters.user_id IS NOT NULL` (always done once the user sees Studio) | — |
| 2 | Uzupełnij wizytówkę | required | hard-checklist parity: `resolveHardChecklist` (lib/master/publicationView.ts) | `/studio/profile` |
| 3 | Dodaj zdjęcie profilowe | required | `avatar_url` (part of the hard checklist; shown separately for guidance) | `/studio/profile` |
| 4 | Wybierz co najmniej jedną specjalizację | required | `specialties` (hard checklist) | `/studio/profile` |
| 5 | Zobacz podgląd profilu | recommended | first visit not persisted → render as an action, not a tracked step | `/masters/[slug\|id]` |
| 6 | Zgłoś profil do moderacji | required | `master_publication.publication_status` ∈ {submitted, published} | `/studio` (publication card) |
| 7 | Publikacja profilu | required | `publication_status = 'published'` (+ visible via the M9 helper) | `/studio` |
| 8 | Dodaj pierwsze wydarzenie | recommended | any `sauna_events.organizer_master_id = master` OR approved participation | `/studio/events` |

Rules:

* completion is **derived from existing data** (profile row, publication
  row, events) — the checklist stores NO business state of its own; at most
  a per-user "dismissed" flag (client-side or `profiles` preference);
* updates automatically after each server action (`revalidatePath` already
  refreshes `/studio`);
* required vs recommended visually distinct (mirrors the 4C2 publication
  card split);
* after dismissal it stays reachable through a "Pomoc" entry in Studio;
* steps link directly to the page where the step is completed;
* the existing `PublicationStatusCard` + `computeMasterCompleteness`
  (lib/master/completeness.ts) are the reuse points — the checklist is a
  composition of already-computed facts, not a new engine.

### Layer 2 — Contextual help (point of use)

Short one-to-three sentence Polish explanations, no blocking modals.
Inventory (place → message intent):

* Studio publication card → why the profile is not public yet (already
  shipped in 4C2 as `PUBLICATION_STATUS_HINTS_PL`; extend, do not fork);
* status chips → what `submitted` / `changes_requested` / `published` /
  `suspended` mean (same source of truth: `PUBLICATION_STATUS_LABELS_PL`);
* profile editor → what happens after a material edit of a published
  profile (shipped in 4C2: demotion warning; keep wording in sync);
* submit button → what is required before publication (missing-field list
  already returned by the RPC; the help text explains the *why*);
* event creation form → what happens after submitting an event to a
  managed facility (pending proposal) vs an unmanaged one (born active);
* event lists → who may edit an event (organizer/staff/admin) and what
  the invitation vs request direction means (`initiated_by`);
* affiliation pages → affiliation does NOT gate event creation today
  (any active facility can be picked); it affects where you are listed;
* preview banner → what information becomes public after publication.

### Layer 3 — Saunamaster Quick Start page

Route: `/help/saunamaster` (public route; content contains nothing
non-public, so no auth gate — decision may be revisited in H3).

Information architecture (task-oriented, one short section each):

1. Jak przejąć swój profil (invitation link → login/registration → claim)
2. Jak zalogować się lub założyć konto
3. Jak wejść do Master Studio
4. Jak uzupełnić wizytówkę profilu
5. Jak obejrzeć podgląd i zgłosić profil do publikacji
6. Jak działa moderacja (statusy, prośby o zmiany, zawieszenie)
7. Jak dodać wydarzenie
8. Jak edytować lub odwołać wydarzenie (see §3 gaps — partially blocked)
9. Jak powiązać wydarzenie z obiektem sauny (managed vs unmanaged)
10. Gdzie uzyskać pomoc (support block, §4.E)

Requirements: screenshots only AFTER the UI is final (H3); direct links to
app routes; simple Polish, no technical vocabulary (no "RLS", "RPC",
"trigger"); mobile-first layout; print-friendly CSS (PDF export later);
never exposes moderation internals, claim/audit/database details.

### Layer 4 — Short instructional videos

Five videos, one task each, ~60–120 s, Polish narration or captions,
mobile + desktop UI where relevant:

1. Jak przejąć swój profil w SaunaPlanet
2. Jak uzupełnić i opublikować wizytówkę
3. Jak dodać pierwsze wydarzenie
4. Jak edytować lub odwołać wydarzenie *(blocked until the §3 gaps are
   fixed — the flow cannot be recorded honestly today)*
5. Jak korzystać z Master Studio

Recording rules: only dedicated technical test accounts and synthetic
fixtures; no real claim token, password, e-mail or private data on screen;
recorded only after the relevant E2E is GREEN and the UI is declared
stable. Hosting decision (YouTube unlisted vs storage) belongs to H4.

### Layer 5 — Pilot presentation

Short deck for onboarding meetings (does not replace in-app help):

1. What SaunaPlanet is (sauna → event → saunamaster ecosystem)
2. Benefits for saunamasters (public card, events, discoverability)
3. How profile ownership works (invitation → claim → your account)
4. How the public profile card works (completeness → moderation → publish)
5. How events appear in SaunaPlanet (map, event pages, your profile)
6. How moderation works and why it exists
7. What feedback we expect during the pilot (waves 2 → 3 → 5)
8. How to report a problem (support path from §4.E)

---

## 2. Actual event workflow (repository audit, 2026-07-30)

Audited from code, not from intended architecture. Key facts the help
content must reflect:

* Studio events route: `app/(main)/studio/events/page.tsx` — four lists
  (facility invitations, pending submissions, upcoming, history).
  **Approved masters only**: pending masters see `StudioAccessNotice`
  (the 4C2 pending-owner opening covers `/studio` and `/studio/profile`
  only — deliberate; events stay approved-gated, and the `create_master_event`
  RPC independently enforces `status='approved'`).
* Creation: `CreateMasterEventForm` (modal in Studio) → server action →
  `create_master_event` RPC (SECURITY DEFINER, atomic event + organizer
  participation). Required fields: **facility, title, date**. Optional:
  time, price (free text), max participants, description.
* Facility choice: ANY `active` sauna (affiliation does NOT gate
  creation). Managed facility → event born `pending` (facility staff
  approve in the Owner Workspace queue); unmanaged → born `active`
  immediately with the master as organizer.
* Lineup: `sauna_event_masters` many-to-many; two handshake directions
  (`initiated_by = 'master'` request → staff assigns role on approval;
  `'facility'` invitation with a fixed role → master accepts/declines).
  Multiple masters per event supported.
* Moderation: `/admin?tab=eventy` — approve/reject/delete, **admin only**;
  participation handshakes are resolved in the Owner Workspace, not the
  admin panel.
* Withdrawal: a master may withdraw an own PENDING proposal
  (`withdrawMasterEventProposal`). 
* Public visibility: only `active` events (map RPC `get_upcoming_events`,
  event page, master public page — approved participations only).
* Reservations: NOT implemented (tables `event_registrations` /
  `user_event_interests` exist; no management flow — SP-022). Help content
  must not promise reservations.

### Gaps that block documenting the flow as final

| # | Gap | Impact on help |
|---|-----|----------------|
| G1 | No UI for a master to cancel an approved own event (admin-only delete) | Quick Start §8 and video 4 blocked; interim copy must say "skontaktuj się z pomocą" |
| G2 | Master editing of an approved event unclear (`EditEventForm` reachable from the event page for organizers; not from Studio; exact editable field set unaudited) | §8 needs a verified flow first |
| G3 | Bundled facility+event submission has an RPC but untraced UI | exclude from pilot help until traced |
| G4 | `/studio/events` fully hidden for pending masters | help must state: events unlock after profile approval |
| G5 | Organizer vs participant not distinguished on the public master page | cosmetic; note in copy review |
| G6 | `max_participants` not enforced anywhere visible | do not document capacity as a feature |

G1/G2 are the ones that must be fixed (or explicitly scoped out) before
Quick Start §8 and video 4 are produced.

---

## 3. First-draft Polish copy

Drafts for future materials — reviewed copy lands with H2/H3. No real
token anywhere; `<link z zaproszenia>` is a placeholder by contract.

### A. Quick Start — wstęp

> **Witaj w SaunaPlanet!** Przejąłeś właśnie swój profil saunamistrza —
> od teraz należy on do Ciebie. W Master Studio uzupełnisz swoją
> wizytówkę, zdecydujesz kiedy stanie się publiczna i dodasz swoje
> wydarzenia, żeby saunowicze mogli Cię znaleźć. Ten przewodnik
> przeprowadzi Cię krok po kroku — każda sekcja to jedno krótkie zadanie.

### B. Instrukcja przejęcia profilu

> 1. Otwórz link z zaproszenia, który otrzymałeś od SaunaPlanet.
> 2. Zobaczysz przygotowaną dla Ciebie wizytówkę. Jeśli masz już konto —
>    zaloguj się. Jeśli nie — załóż je (po aktywacji konta e-mailem
>    kliknij link z zaproszenia jeszcze raz).
> 3. Kliknij **„Przejmij profil"**. Od tej chwili profil jest powiązany
>    z Twoim kontem.
> 4. Kliknij **„Przejdź do Master Studio"** — tam uzupełnisz resztę.
>
> **Link nie działa?** Zaproszenia mają termin ważności i mogą zostać
> unieważnione. Jeśli widzisz komunikat, że link wygasł, został
> unieważniony albo profil został już przejęty — napisz do nas, wyślemy
> nowe zaproszenie. Nie przekazuj linku z zaproszenia nikomu — działa jak
> klucz do Twojego profilu.

### C. Instrukcja publikacji wizytówki

> Zanim profil trafi do katalogu, musi być kompletny i przejść krótką
> moderację:
>
> 1. **Uzupełnij wymagane pola**: imię i nazwisko, miasto lub obszar
>    działania, opis (min. 80 znaków), zdjęcie profilowe i co najmniej
>    jedną specjalizację. Pola zalecane (adres profilu, linki, języki)
>    nie blokują publikacji, ale wzmacniają wizytówkę.
> 2. **Zobacz podgląd** — dokładnie tak będzie wyglądać Twoja publiczna
>    strona. Dopóki profil nie jest opublikowany, widzisz ją tylko Ty.
> 3. **Zgłoś profil do publikacji** przyciskiem w Studio. Status zmieni
>    się na „Zgłoszony do moderacji".
> 4. Moderacja może **poprosić o zmiany** — zobaczysz wiadomość w Studio;
>    po poprawkach zgłoś profil ponownie.
> 5. Po zatwierdzeniu profil jest **opublikowany** i widoczny w katalogu.
> 6. **Uwaga:** edycja opublikowanego profilu (np. zmiana opisu czy
>    zdjęcia) tymczasowo ukrywa go z katalogu — wraca po ponownym
>    zatwierdzeniu przez moderację. To normalne działanie, nie błąd.

### D. Instrukcja dodania wydarzenia (stan obecny aplikacji)

> Wydarzenia dodasz po zatwierdzeniu Twojego profilu przez moderację.
>
> 1. Wejdź do **Master Studio** i otwórz zakładkę **Wydarzenia**.
> 2. Kliknij **„Utwórz wydarzenie"**.
> 3. Wybierz obiekt (saunę), w którym odbędzie się wydarzenie.
> 4. Podaj **nazwę** i **datę** (wymagane). Możesz dodać godzinę, cenę,
>    limit miejsc i opis.
> 5. Zapisz. Jeżeli obiekt ma swojego opiekuna w SaunaPlanet, wydarzenie
>    trafi do niego do akceptacji („Twoja propozycja — czeka na managera
>    obiektu"). Jeżeli nie — wydarzenie jest od razu aktywne, a Ty jesteś
>    jego organizatorem.
> 6. Status sprawdzisz w zakładce Wydarzenia. Propozycję, która czeka na
>    akceptację, możesz wycofać.
> 7. Obiekty mogą też same zapraszać Cię do wydarzeń — zaproszenie z
>    proponowaną rolą przyjmujesz lub odrzucasz w tej samej zakładce.
>
> *(Edycja i odwołanie już zatwierdzonego wydarzenia: w tej wersji
> aplikacji skontaktuj się z pomocą — sekcja „Potrzebujesz pomocy?".)*

### E. Blok wsparcia (komponent wielokrotnego użytku)

> **Potrzebujesz pomocy?**
> Napisz do nas: `[KONTAKT-PILOTA — do ustalenia przed pierwszym
> zaproszeniem]`. Opisz krótko problem i, jeśli możesz, dołącz zrzut
> ekranu — tak pomożemy najszybciej.
> **Nigdy nie wysyłaj nam swojego hasła ani linku z zaproszenia.**

The support contact is a placeholder by design — no production support
address may be invented; choosing it is a pilot-readiness prerequisite.

---

## 4. Security and redaction rules

All help materials (text, screenshots, videos, slides, analytics
examples, support examples) must:

* warn users never to share passwords, active claim links, raw invitation
  tokens, private moderation notes, or account information;
* use ONLY dedicated technical test accounts, synthetic names/data,
  redacted e-mail addresses; no real phone numbers; no private production
  records;
* NEVER contain a real or realistic claim token — the token may not appear
  in documentation source, screenshots, captions, slides, analytics or
  support examples in any form (placeholder `<link z zaproszenia>` only);
* keep moderation internals (review notes, audit actors, database or RLS
  details) out of every public-facing material.

---

## 5. Content maintenance model

* This document is the single authoritative help source; UI help strings
  and the Quick Start page must reuse its terminology (status names come
  from `PUBLICATION_STATUS_LABELS_PL` — one vocabulary everywhere).
* Screenshots are versioned (date + commit in the filename or caption)
  and regenerated after significant UI changes; videos are reviewed after
  material UI changes.
* Every sprint touching claim, Studio, profile publication or events MUST
  include a documentation-impact check. Release checklist item (add to
  the Definition of Done for those areas):
  **"Does this change require an update to saunamaster onboarding or help
  content?"**
* Help content owner: **the platform moderation role** (named by role,
  not by personal e-mail).

---

## 6. Analytics and pilot feedback (proposal only — no tracking in H1)

SP-039P already defines the pilot metric set; onboarding adds these
minimal measurements, all derivable WITHOUT new tracking primitives where
possible (DB timestamps first, events second):

| Metric | Source | Privacy note |
|---|---|---|
| invitation opened | opened-tracking is DEFERRED (4B decision) — currently unavailable | requires anon-write path → privacy + abuse review before build |
| claim completed | `master_claim_events` (`invitation_claimed`) | already audited, no extra data |
| Studio opened | would need a page event | flag: behavioral tracking → privacy review |
| completeness achieved | hard checklist over profile row | derived, no tracking |
| profile submitted / published | `master_publication_events` | already audited |
| first event created | `sauna_events.organizer_master_id` | derived |
| time claim → publication | timestamps of the two audit events | derived |
| help page opened | page event | flag: privacy review |
| checklist completion | derived from the same facts as the card | no storage |

Hard rule: no raw claim tokens, profile text, e-mail addresses or other
private data in any analytics payload.

---

## 7. Delivery sequence and backlog

* **SP-039H1 — Content and onboarding architecture** (THIS document):
  authoritative doc, task inventory, Polish copy drafts, screenshot/video
  plan, implementation backlog. DONE when merged with the sprint branch.
* **SP-039H2 — In-app helper**: Studio first-steps card (Layer 1),
  contextual help strings (Layer 2), event empty states, support links.
  Depends on: 4C2 shipped (yes); support contact decided.
  *Minimum shipped with SP-039P0 (2026-07-30): the first-steps card
  (components/studio/FirstStepsCard.tsx over lib/master/onboarding.ts —
  fully derived, no stored onboarding state) plus the shared support block
  (lib/help/support.ts, temporary contact-the-inviter path).*
* **SP-039H3 — Quick Start page**: `/help/saunamaster`, screenshots,
  direct task links, printable layout. Depends on: UI declared stable
  after the 4E Preview E2E; G1/G2 fixed or §8 scoped out.
  *Minimum shipped with SP-039P0 (2026-07-30): the public page with the ten
  task sections; §8 active-event editing is scoped out with honest interim
  wording (changes to an active event go through support). Screenshots and
  PDF export remain open.*
* **SP-039H4 — Video guides**: record + publish after final E2E GREEN;
  embed/link from the help page and Studio.
* **SP-039H5 — Pilot presentation**: deck + feedback/support process for
  wave 1.

## 8. Pilot-readiness impact

The SP-039 pilot-readiness gate (SP039_SLICE4_PUBLIC_CLAIM.md §12.5) is
EXTENDED: the first two real invitations must not be sent until the
minimum onboarding package is ready —

* visible first-steps checklist (or equivalent Studio guidance);
* claim instructions (§3.B, reviewed);
* profile completion + publication instructions (§3.C, reviewed);
* event creation instructions (§3.D, reviewed against fixed G1/G2 or with
  the explicit interim wording);
* a decided, working support contact path (§3.E placeholder resolved);
* one tested Quick Start page or equivalent document.

Videos (H4) and the presentation (H5) may follow shortly after the first
controlled wave if the minimum written and in-app help is complete.
