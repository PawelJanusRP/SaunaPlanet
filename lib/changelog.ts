// Public, user-facing changelog rendered by /about (SP-039I).
//
// This is the single source of truth for the "Ostatnie zmiany" history shown
// to visitors. It is written for SaunaPlanet USERS, not developers: describe
// user-visible behaviour, never internal technical/security work (that stays
// in Git history and docs/).
//
// Convention: every production-facing release that changes user-visible
// behaviour prepends a new entry here (newest first). See CLAUDE.md
// ("Documentation Updates").

export type ChangelogEntry = {
  /** Human-readable release date or period label (Polish), e.g. "7 września 2026". */
  date: string
  /** Short, user-friendly release title. */
  title: string
  /** User-visible changes in this release. */
  items: string[]
}

/** Newest release first. */
export const changelog: ChangelogEntry[] = [
  {
    date: '7 września 2026',
    title: 'Pilotaż saunamistrzów i ułatwienia nawigacji',
    items: [
      'Powrót z zarządzania wydarzeniem prowadzi teraz bezpośrednio do właściwej sauny na mapie.',
      'Dodaliśmy stronę „O aplikacji”, na której można sprawdzić ostatnio wdrożone zmiany w SaunaPlanet.',
      'Rozbudowaliśmy profile saunamistrzów — więcej informacji o osobie, zdjęcie profilowe i okładka.',
      'Saunamistrzowie mogą teraz przejąć i opublikować swój profil w ramach pilotażu.',
      'Dodaliśmy wskazówki i pomoc dla nowych saunamistrzów.',
      'Ujednoliciliśmy ikony w menu i poprawiliśmy czytelność nawigacji na mapie.',
    ],
  },
  {
    date: '27 lipca 2026',
    title: 'Szybsze dodawanie saun',
    items: [
      'Saunę można dodać na podstawie adresu jej strony internetowej — podstawowe dane i zdjęcia uzupełniają się automatycznie, a przed zapisaniem można je poprawić.',
    ],
  },
  {
    date: '20 lipca 2026',
    title: 'Więcej możliwości dla saunamistrzów i wydarzeń',
    items: [
      'Saunamistrzowie mogą zgłaszać swój udział w wydarzeniach.',
      'Organizatorzy mogą zapraszać saunamistrzów do współpracy przy wydarzeniach.',
      'Na stronie wydarzenia widać przypisanych saunamistrzów oraz organizatora.',
    ],
  },
]
