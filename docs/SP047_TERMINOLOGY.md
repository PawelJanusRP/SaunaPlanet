# SP-047 — Sauna-domain terminology glossary (PL / EN / DE)

Authoritative translations for SaunaPlanet's domain vocabulary. Use these when
authoring `messages/{en,de}/*.json`. Translations must be natural, not literal;
this table pins the *product* meaning so wording stays consistent across
surfaces. Polish (`pl`) is the authored reference language.

| Concept (context) | Polish (pl) | English (en) | German (de) | Notes |
|---|---|---|---|---|
| Sauna facility / venue | obiekt | facility / venue | Anlage / Einrichtung | "obiekt" = the physical place; prefer "venue" in discovery UI, "facility" in admin. |
| Sauna (the room/product) | sauna | sauna | Sauna | |
| Sauna event | wydarzenie / event | event | Event / Veranstaltung | UI uses "Event" in DE (common in the sauna scene); "Veranstaltung" acceptable in formal copy. |
| Sauna session | seans saunowy | sauna session | Saunagang | A single heat/steam sitting. |
| Sauna ceremony | ceremonia saunowa | sauna ceremony | Sauna-Aufguss / Aufguss-Zeremonie | See Aufguss. |
| Aufguss (infusion ritual) | aufguss / seans z olejkami | Aufguss (infusion) | Aufguss | Keep the loanword "Aufguss" in EN and DE — it is the established term. |
| Sauna master | saunamistrz | sauna master | Saunameister | Core role. Do NOT translate personal names/pseudonyms. |
| Resident master | mistrz rezydent | resident master | ansässiger Meister / Resident-Meister | Affiliation type. |
| Guest master | mistrz gościnny | guest master | Gastmeister | Affiliation type. |
| Affiliation (master↔venue) | afiliacja | affiliation | Zugehörigkeit | Relationship between a master and a facility. |
| Qualifications | kwalifikacje | qualifications | Qualifikationen | |
| Certificate | certyfikat | certificate | Zertifikat | |
| Verification / verified | weryfikacja / zweryfikowany | verification / verified | Verifizierung / verifiziert | Trust signal, not authorization. |
| Published profile | profil opublikowany | published profile | veröffentlichtes Profil | |
| Publication (act) | publikacja | publication | Veröffentlichung | |
| Reservation | rezerwacja | reservation | Reservierung | Future marketplace term. |
| Booking (verb sense) | rezerwacja | booking | Buchung | Prefer "reservation" for the noun; "book" for the CTA. |
| Submission (user-submitted sauna) | zgłoszenie | submission | Einreichung / Eintrag | "Zgłoś saunę" → "Submit a sauna" / "Sauna melden". |
| Claim (a master profile) | przejęcie / claim | claim | Übernahme / Beanspruchung | The SP-039 invitation flow; keep "claim" as the action verb in EN. |
| Moderation | moderacja | moderation | Moderation | |
| Review | opinia / recenzja | review | Bewertung / Rezension | "Bewertung" for star ratings; "Rezension" for written reviews. |
| Rating (stars) | ocena | rating | Bewertung | |
| Favorite | ulubione | favorite | Favorit | |
| Interested (in event) | zainteresowany | interested | interessiert | Event participation intent. |
| Sauna master studio | Studio (saunamistrza) | Master Studio | Meister-Studio | The master's authoring area; keep "Studio" prominent. |
| Owner workspace | panel obiektu | owner workspace | Betreiber-Bereich | The facility owner's area. |
| Dashboard / panel | pulpit / panel | dashboard | Dashboard / Übersicht | |
| Geolocation | lokalizacja / moja lokalizacja | my location | mein Standort | Map control. |
| Filters | filtry | filters | Filter | |
| TOP SaunaPlanet | TOP SaunaPlanet | TOP SaunaPlanet | TOP SaunaPlanet | Brand label — do not translate. |

## Status / enum presentation (domain code → label)

Domain codes stay canonical in the database (e.g. `pending`); only the label is
localized. Never branch logic on a localized string.

| Code | pl | en | de |
|---|---|---|---|
| `pending` | Oczekuje | Pending | Ausstehend |
| `approved` | Zatwierdzono | Approved | Genehmigt |
| `rejected` | Odrzucono | Rejected | Abgelehnt |
| `published` | Opublikowano | Published | Veröffentlicht |
| `draft` | Szkic | Draft | Entwurf |
| `active` | Aktywne | Active | Aktiv |
| `cancelled` | Anulowano | Cancelled | Abgesagt |
| `verified` | Zweryfikowano | Verified | Verifiziert |
