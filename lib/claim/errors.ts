// SP-039 Slice 3B1 — stable-code -> Polish message mapping (pure).
// Raw PostgreSQL errors and token values must NEVER reach the browser; the
// Server Action maps a stable code to one of these messages and nothing else.

import { CLAIM_RESULT_CODES, type ClaimResultCode } from './types'

export const CLAIM_MESSAGES_PL: Record<ClaimResultCode, string> = {
  ok: 'Gotowe.',
  sent: 'Oznaczono jako wysłane.',
  revoked: 'Zaproszenie zostało unieważnione.',
  already_sent: 'Zaproszenie było już oznaczone jako wysłane.',
  already_revoked: 'Zaproszenie było już unieważnione.',
  not_authenticated: 'Musisz być zalogowany.',
  not_authorized: 'Brak uprawnień.',
  master_not_found: 'Nie znaleziono profilu saunamistrza.',
  master_already_claimed: 'Ten profil jest już powiązany z kontem.',
  master_not_eligible: 'Profil nie kwalifikuje się do zaproszenia.',
  active_invitation_exists:
    'Ten profil ma już aktywne zaproszenie — najpierw je unieważnij lub wygeneruj ponownie.',
  invitation_not_found: 'Nie znaleziono zaproszenia.',
  invalid_transition: 'Niedozwolona zmiana stanu zaproszenia.',
  invitation_already_terminal: 'Zaproszenie jest już w stanie końcowym.',
  generation_conflict:
    'Konflikt podczas generowania zaproszenia — spróbuj ponownie.',
  rate_limited: 'Za dużo prób — odczekaj chwilę i spróbuj ponownie.',
  unexpected_error: 'Wystąpił nieoczekiwany błąd.',
}

/** Narrow an arbitrary string to a known code, defaulting to unexpected_error. */
export function toClaimResultCode(code: string): ClaimResultCode {
  return (CLAIM_RESULT_CODES as readonly string[]).includes(code)
    ? (code as ClaimResultCode)
    : 'unexpected_error'
}

/** Polish message for any code (falls back to the generic error message). */
export function claimMessagePl(code: string): string {
  return CLAIM_MESSAGES_PL[toClaimResultCode(code)]
}
