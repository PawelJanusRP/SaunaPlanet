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
    // SP-042B — facility correction submission, deployed 2026-09-10.
    date: '10 września 2026',
    title: 'Zgłaszanie nieprawidłowości w danych saun',
    items: [
      'Na stronie każdej sauny znajdziesz przycisk „Zgłoś nieprawidłowość" — możesz poinformować nas o błędnym adresie, położeniu na mapie, godzinach otwarcia, stronie internetowej i innych danych obiektu.',
      'Jeśli znasz poprawną wartość (np. właściwy adres), możesz podać ją od razu w zgłoszeniu — przyspieszy to weryfikację.',
      'Zgłoszenie wyślesz bez zakładania konta; adres e-mail jest opcjonalny (bez niego nie będziemy mogli odpowiedzieć).',
      'Formularz dostępny jest po polsku, angielsku i niemiecku.',
      'Zgłoszenia trafiają do moderacji SaunaPlanet — dane obiektu nigdy nie zmieniają się automatycznie.',
    ],
  },
  {
    // SP-047 — deployed to production 2026-09-09.
    date: '9 września 2026',
    title: 'SaunaPlanet po polsku, angielsku i niemiecku',
    items: [
      'Aplikacja jest teraz dostępna w trzech językach: polskim, angielskim i niemieckim.',
      'Język można zmienić w każdej chwili z menu (ikona globusa) — wybór nie zmienia otwartej strony ani widoku mapy.',
      'Adresy stron zawierają język, np. /pl/, /en/, /de/ — a stare linki nadal działają.',
      'Wejście na stronę główną dobiera język automatycznie (na podstawie ustawień przeglądarki), z polskim jako domyślnym.',
      'Daty, liczby i ceny wyświetlają się zgodnie z konwencją wybranego języka.',
      'Dodano globalną sekcję Pomoc dostępną z menu.',
      'Nazwy saun, wydarzeń i saunamistrzów oraz treści wpisane przez użytkowników pozostają w oryginalnym języku.',
    ],
  },
  {
    date: '9 września 2026',
    title: 'Nowa mapa i wyszukiwanie saunamistrzów',
    items: [
      'Mapa zajmuje teraz niemal cały ekran, a wyszukiwanie i filtry otwierają się dopiero na żądanie.',
      'Wyszukiwarka mapy znajduje teraz zarówno sauny, jak i publiczne profile saunamistrzów.',
      'Profil saunamistrza pokazuje najbliższe wydarzenia wraz z obiektem, w którym się odbędą.',
      'Dotknięcie sauny przy wydarzeniu przenosi bezpośrednio do właściwego miejsca na mapie.',
      'Okno sauny jest bardziej kompaktowe, a duże przyciski zastąpiono wygodnymi ikonami.',
      'Mapa w wersji komputerowej korzysta teraz z tego samego lekkiego interfejsu co wersja mobilna — bez stałego panelu bocznego i pasków filtrów.',
      'Wyszukiwanie saun i saunamistrzów oraz filtry otwierają się na żądanie także na komputerze, a okna saun i akcje są spójne na telefonie i desktopie.',
    ],
  },
  {
    date: '8 września 2026',
    title: 'Zarządzanie saunamistrzami i prywatność',
    items: [
      'Administrator może teraz usuwać profile saunamistrzów bezpośrednio z listy saunamistrzów.',
      'Po przejęciu przygotowanego profilu saunamistrz jest od razu widoczny publicznie — bez dodatkowego zatwierdzania.',
      'Saunamistrzowie mogą używać pseudonimu i ukryć swoje imię i nazwisko — publicznie widoczny jest wtedy tylko pseudonim.',
    ],
  },
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
