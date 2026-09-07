/**
 * SP-039P0 — the ONE central support copy for the saunamaster pilot.
 *
 * The repository has no support/contact route, no support e-mail
 * configuration and no feedback form (verified 2026-07-30), so the pilot
 * support path is deliberately temporary: contact the person who sent the
 * invitation. When a real support channel exists, changing THIS module
 * updates every surface (Quick Start page, Studio) at once. No private
 * personal contact data may ever be hard-coded here.
 */

export const SUPPORT_HEADING_PL = 'Potrzebujesz pomocy?'

/** Temporary pilot channel — no invented e-mail address. */
export const SUPPORT_CHANNEL_PL =
  'Skontaktuj się z osobą, która przygotowała Twój profil i wysłała Ci ' +
  'zaproszenie do SaunaPlanet. To tymczasowa ścieżka wsparcia na czas pilotażu.'

/** What a helpful problem report contains. */
export const SUPPORT_REQUEST_CHECKLIST_PL: readonly string[] = [
  'krótki opis problemu,',
  'strona, na której problem wystąpił,',
  'zrzut ekranu — z ukrytymi hasłami i linkami do przejęcia profilu.',
]

/** Mandatory safety warning — shown wherever the support copy appears. */
export const SUPPORT_SECURITY_WARNING_PL =
  'Nie wysyłaj hasła ani aktywnego linku do przejęcia profilu.'
