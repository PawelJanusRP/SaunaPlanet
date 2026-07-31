import type { Metadata } from 'next'
import Link from 'next/link'
import SupportNotice from '@/components/help/SupportNotice'
import {
  PUBLICATION_STATUS_HINTS_PL,
  PUBLICATION_STATUS_LABELS_PL,
} from '@/lib/master/publicationView'

// SP-039P0 / SP-039H Layer 3 — the public saunamaster Quick Start page.
// Public by design: it contains nothing non-public, is safe to send BEFORE
// login, and never shows account-specific data. Content terminology reuses
// the shared Polish publication vocabulary (PUBLICATION_STATUS_LABELS_PL) —
// no parallel status labels. Authoritative content source:
// docs/SP039H_SAUNAMASTER_ONBOARDING_HELP.md.

export const metadata: Metadata = {
  title: 'Szybki start saunamistrza — SaunaPlanet',
  description:
    'Jak przejąć profil saunamistrza, uzupełnić wizytówkę, opublikować ją i dodać pierwsze wydarzenie w SaunaPlanet.',
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

const TOC: { href: string; label: string }[] = [
  { href: '#przejecie', label: 'Jak przejąć profil' },
  { href: '#konto', label: 'Jak zalogować się lub założyć konto' },
  { href: '#studio', label: 'Jak wejść do Master Studio' },
  { href: '#wizytowka', label: 'Jak uzupełnić wizytówkę' },
  { href: '#publikacja', label: 'Jak działa podgląd i publikacja' },
  { href: '#statusy', label: 'Co oznaczają statusy moderacji' },
  { href: '#wydarzenie', label: 'Jak dodać wydarzenie' },
  { href: '#obiekty', label: 'Wydarzenie w obiekcie zarządzanym i niezarządzanym' },
  { href: '#pomoc', label: 'Jak uzyskać pomoc' },
  { href: '#bezpieczenstwo', label: 'Zasady bezpieczeństwa' },
]

export default function SaunamasterQuickStartPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8 print:max-w-none">
      <h1 className="text-2xl font-bold">Szybki start saunamistrza</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        Witaj w SaunaPlanet! Ten przewodnik przeprowadzi Cię krok po kroku od
        zaproszenia do publicznej wizytówki i pierwszego wydarzenia. Każda
        sekcja to jedno krótkie zadanie — możesz wracać tu w dowolnym momencie.
      </p>

      <nav aria-label="Spis treści" className="mt-4 rounded-2xl border bg-gray-50 p-4 print:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Spis treści
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {TOC.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="text-orange-700 hover:underline">
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-8">
        <Section id="przejecie" title="1. Jak przejąć profil">
          <p>
            SaunaPlanet przygotowało dla Ciebie profil saunamistrza. Zaproszenie,
            które otrzymujesz, zawiera link do strony przejęcia profilu.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Otwórz link z zaproszenia — zobaczysz przygotowaną wizytówkę.</li>
            <li>Zaloguj się lub załóż konto (sekcja 2).</li>
            <li>
              Kliknij <strong>„Przejmij profil”</strong>. Od tej chwili profil
              jest powiązany z Twoim kontem i tylko Ty nim zarządzasz.
            </li>
          </ol>
          <p>
            <strong>Ważne:</strong> przejęcie profilu <strong>nie publikuje go</strong>.
            Wizytówka staje się publiczna dopiero po jej uzupełnieniu, zgłoszeniu
            i zatwierdzeniu przez moderację (sekcje 4–5).
          </p>
          <p>
            Link z zaproszenia jest jednorazowy, ma termin ważności i działa jak
            klucz do Twojego profilu — nie przekazuj go nikomu. Jeśli link wygasł
            lub nie działa, poproś o nowe zaproszenie (sekcja 9).
          </p>
        </Section>

        <Section id="konto" title="2. Jak zalogować się lub założyć konto">
          <p>
            Do przejęcia profilu potrzebujesz zwykłego konta SaunaPlanet. Na
            stronie przejęcia możesz zalogować się lub zarejestrować bez
            opuszczania tej strony.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Masz konto? Zaloguj się swoim adresem e-mail i hasłem.</li>
            <li>
              Nie masz konta? Zarejestruj się. Po rejestracji potwierdź adres
              e-mail (link aktywacyjny), a następnie otwórz link z zaproszenia
              jeszcze raz.
            </li>
          </ol>
        </Section>

        <Section id="studio" title="3. Jak wejść do Master Studio">
          <p>
            Master Studio to Twoja przestrzeń robocza: wizytówka, publikacja
            i wydarzenia. Po przejęciu profilu wejdziesz tam przyciskiem
            „Przejdź do Master Studio”, a później w każdej chwili:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Zaloguj się w SaunaPlanet.</li>
            <li>Otwórz menu konta i wybierz <strong>Studio</strong>.</li>
            <li>
              Możesz też wejść bezpośrednio pod adres{' '}
              <Link href="/studio" className="text-orange-700 hover:underline">
                /studio
              </Link>
              .
            </li>
          </ol>
          <p>
            Studio działa od razu po przejęciu profilu — także zanim moderacja
            zatwierdzi Twój profil saunamistrza.
          </p>
        </Section>

        <Section id="wizytowka" title="4. Jak uzupełnić wizytówkę">
          <p>
            Wizytówkę edytujesz w Studio, w zakładce <strong>Profil</strong>.
            Do publikacji wymagane są:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>imię i nazwisko,</li>
            <li>miasto lub obszar działania,</li>
            <li>opis (minimum 80 znaków),</li>
            <li>zdjęcie profilowe,</li>
            <li>co najmniej jedna specjalizacja.</li>
          </ul>
          <p>
            Pola zalecane (własny adres profilu, języki, linki do stron i
            mediów społecznościowych) nie blokują publikacji, ale wzmacniają
            wizytówkę. Karta „Pierwsze kroki” w Studio pokazuje na bieżąco,
            czego jeszcze brakuje.
          </p>
        </Section>

        <Section id="publikacja" title="5. Jak działa podgląd i publikacja">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong>Podgląd:</strong> w Studio zawsze możesz obejrzeć swoją
              wizytówkę dokładnie tak, jak zobaczą ją inni. Dopóki profil nie
              jest opublikowany, podgląd widzisz tylko Ty.
            </li>
            <li>
              <strong>Zgłoszenie:</strong> gdy wymagane pola są uzupełnione,
              zgłoś profil do publikacji przyciskiem w Studio. Do czasu decyzji
              możesz wycofać zgłoszenie.
            </li>
            <li>
              <strong>Moderacja:</strong> moderacja może zatwierdzić profil albo
              poprosić o zmiany — wiadomość z uzasadnieniem zobaczysz w Studio.
              Po poprawkach zgłaszasz profil ponownie.
            </li>
            <li>
              <strong>Publikacja:</strong> po zatwierdzeniu profil jest widoczny
              publicznie w katalogu saunamistrzów.
            </li>
          </ol>
          <p>
            <strong>Uwaga:</strong> istotna edycja opublikowanego profilu (np.
            zmiana opisu lub zdjęcia) tymczasowo ukrywa go z katalogu — wraca po
            ponownym zatwierdzeniu przez moderację. To normalne działanie, nie
            błąd. Profilu z zawieszoną publikacją nie można opublikować
            samodzielnie — skontaktuj się z pomocą (sekcja 9).
          </p>
        </Section>

        <Section id="statusy" title="6. Co oznaczają statusy moderacji">
          <ul className="space-y-2">
            {(
              [
                'draft',
                'submitted',
                'changes_requested',
                'published',
                'suspended',
              ] as const
            ).map((status) => (
              <li key={status} className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="font-semibold text-gray-800">
                  {PUBLICATION_STATUS_LABELS_PL[status]}
                </p>
                <p className="mt-0.5 text-gray-600">
                  {PUBLICATION_STATUS_HINTS_PL[status]}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="wydarzenie" title="7. Jak dodać wydarzenie">
          <p>
            Wydarzenia dodasz po zatwierdzeniu Twojego profilu saunamistrza
            przez moderację.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Wejdź do Studio i otwórz zakładkę <strong>Moje wydarzenia</strong>.</li>
            <li>Kliknij „Utwórz wydarzenie”.</li>
            <li>
              Podaj wymagane informacje: <strong>obiekt (saunę)</strong>,{' '}
              <strong>nazwę</strong> i <strong>datę</strong>. Możesz dodać
              godzinę, cenę, limit miejsc i opis.
            </li>
            <li>Zapisz — co dalej dzieje się z wydarzeniem, opisuje sekcja 8.</li>
          </ol>
          <p>
            Nie musisz mieć afiliacji z obiektem, żeby dodać w nim wydarzenie.
            Obiekty mogą też same zapraszać Cię do swoich wydarzeń — zaproszenie
            przyjmujesz lub odrzucasz w zakładce Moje wydarzenia. W jednym
            wydarzeniu może występować kilku saunamistrzów.
          </p>
          <p>
            Rezerwacja miejsc przez uczestników nie jest jeszcze dostępna w
            SaunaPlanet.
          </p>
          <p>
            <strong>Korekta lub odwołanie aktywnego wydarzenia:</strong> w
            obecnej, pilotażowej wersji aplikacji zmiany w już aktywnym
            wydarzeniu wprowadza pomoc SaunaPlanet — skontaktuj się z nami
            (sekcja 9). To tymczasowa procedura na czas pilotażu.
          </p>
        </Section>

        <Section id="obiekty" title="8. Wydarzenie w obiekcie zarządzanym i niezarządzanym">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Obiekt zarządzany</strong> (ma swojego opiekuna w
              SaunaPlanet): Twoje wydarzenie trafia do niego jako propozycja do
              akceptacji. Do czasu decyzji możesz je wycofać; publiczne staje
              się po akceptacji.
            </li>
            <li>
              <strong>Obiekt niezarządzany:</strong> wydarzenie jest aktywne od
              razu, a Ty jesteś jego organizatorem.
            </li>
          </ul>
          <p>
            Publicznie widoczne są wyłącznie aktywne wydarzenia — na mapie, na
            stronie wydarzeń i na Twojej wizytówce.
          </p>
        </Section>

        <Section id="pomoc" title="9. Jak uzyskać pomoc">
          <SupportNotice />
        </Section>

        <Section id="bezpieczenstwo" title="10. Zasady bezpieczeństwa">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Nikomu nie przekazuj hasła do konta — nikt z SaunaPlanet nigdy o
              nie nie poprosi.
            </li>
            <li>
              Nie udostępniaj nikomu aktywnego linku do przejęcia profilu —
              działa jak klucz do Twojej wizytówki.
            </li>
            <li>
              Na zrzutach ekranu wysyłanych do pomocy zakryj hasła i linki z
              zaproszeń.
            </li>
            <li>
              Jeśli podejrzewasz, że ktoś niepowołany użył Twojego linku lub
              konta, jak najszybciej skontaktuj się z pomocą (sekcja 9).
            </li>
          </ul>
        </Section>
      </div>
    </main>
  )
}
