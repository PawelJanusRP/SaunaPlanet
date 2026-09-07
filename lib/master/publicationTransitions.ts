// SP-039 Slice 4C2 — pure model for the M10 publication-transition boundary.
//
// Mirrors the seven DEFINER RPCs added by M10. The DATABASE is the authority
// for every transition rule; this module is the tested UI/action contract:
// stable code narrowing, Polish message mapping and allow-list parsing of the
// RPC payloads. No direct table writes exist anywhere in the app — every
// mutation of publication state flows through these RPC names.

/** RPC names exactly as granted to `authenticated` by M10. */
export const PUBLICATION_TRANSITION_RPCS = {
  submit: 'submit_master_profile_for_publication',
  withdraw: 'withdraw_master_profile_submission',
  unpublish: 'unpublish_master_profile',
  approve: 'moderator_approve_master_publication',
  requestChanges: 'moderator_request_master_publication_changes',
  suspend: 'moderator_suspend_master_publication',
  restore: 'moderator_restore_master_publication',
} as const

/** Stable result codes of the M10 transition RPCs (superset across all
 *  seven), plus the FRONTEND-ONLY `unavailable` for transport failures. */
export const PUBLICATION_TRANSITION_CODES = [
  'submitted',
  'already_submitted',
  'withdrawn',
  'already_draft',
  'unpublished',
  'already_unpublished',
  'published',
  'already_published',
  'changes_requested',
  'already_changes_requested',
  'suspended',
  'already_suspended',
  'restored',
  'invalid_transition',
  'profile_incomplete',
  'reason_required',
  'master_not_found',
  'master_not_approved',
  'not_owner',
  'not_authenticated',
  'not_authorized',
  'unavailable',
] as const
export type PublicationTransitionCode =
  (typeof PUBLICATION_TRANSITION_CODES)[number]

/** Missing-field codes the submit RPC may return under `data.missing`. */
export const PUBLICATION_MISSING_FIELD_CODES = [
  'name',
  'city',
  'bio',
  'avatar',
  'specialties',
] as const
export type PublicationMissingFieldCode =
  (typeof PUBLICATION_MISSING_FIELD_CODES)[number]

/** Publication states as stored in master_publication (M9 vocabulary). */
export const PUBLICATION_STATUSES = [
  'draft',
  'submitted',
  'changes_requested',
  'published',
  'legacy_published',
  'suspended',
] as const
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number]

export const PUBLICATION_TRANSITION_MESSAGES_PL: Record<
  PublicationTransitionCode,
  string
> = {
  submitted: 'Profil został zgłoszony do publikacji — czeka na moderację.',
  already_submitted: 'Profil jest już zgłoszony do publikacji.',
  withdrawn: 'Zgłoszenie zostało wycofane.',
  already_draft: 'Profil jest już w wersji roboczej.',
  unpublished: 'Profil został wycofany z publikacji.',
  already_unpublished: 'Profil nie jest opublikowany.',
  published: 'Profil został opublikowany.',
  already_published: 'Profil jest już opublikowany.',
  changes_requested: 'Przekazano prośbę o zmiany do właściciela profilu.',
  already_changes_requested: 'Prośba o zmiany została już przekazana.',
  suspended: 'Publikacja profilu została zawieszona.',
  already_suspended: 'Publikacja profilu jest już zawieszona.',
  restored: 'Profil przywrócono do wersji roboczej.',
  invalid_transition: 'Ta operacja nie jest możliwa w obecnym stanie profilu.',
  profile_incomplete:
    'Profil jest niekompletny — uzupełnij wymagane pola przed zgłoszeniem.',
  reason_required: 'Podaj uzasadnienie tej operacji.',
  master_not_found: 'Nie znaleziono profilu saunamistrza.',
  master_not_approved:
    'Profil nie został jeszcze zatwierdzony przez moderację.',
  not_owner: 'Tylko właściciel profilu może wykonać tę operację.',
  not_authenticated: 'Zaloguj się, aby wykonać tę operację.',
  not_authorized: 'Nie masz uprawnień do tej operacji.',
  unavailable: 'Chwilowy problem techniczny — spróbuj ponownie.',
}

export const PUBLICATION_MISSING_FIELD_LABELS_PL: Record<
  PublicationMissingFieldCode,
  string
> = {
  name: 'imię i nazwisko',
  city: 'miasto lub obszar działania',
  bio: 'opis (min. 80 znaków)',
  avatar: 'zdjęcie profilowe',
  specialties: 'co najmniej jedna specjalizacja',
}

/** Narrow an arbitrary string to a known transition code (fail-closed). */
export function toPublicationTransitionCode(
  code: string
): PublicationTransitionCode {
  return (PUBLICATION_TRANSITION_CODES as readonly string[]).includes(code)
    ? (code as PublicationTransitionCode)
    : 'unavailable'
}

/** Narrow an arbitrary string to a known publication status, or null. */
export function toPublicationStatus(value: unknown): PublicationStatus | null {
  return typeof value === 'string' &&
    (PUBLICATION_STATUSES as readonly string[]).includes(value)
    ? (value as PublicationStatus)
    : null
}

/** Result of any transition RPC as consumed by future Studio/moderation UI. */
export type PublicationTransitionResult = {
  ok: boolean
  code: PublicationTransitionCode
  message: string
  /** Present when the RPC reports the resulting state. */
  publicationStatus: PublicationStatus | null
  /** Present only on `profile_incomplete`. */
  missing: PublicationMissingFieldCode[]
}

/**
 * ALLOW-LIST parser for the raw jsonb payload of any M10 transition RPC.
 * Unknown codes and malformed payloads collapse to the retryable
 * `unavailable`; unknown missing-field codes are dropped, never forwarded.
 */
export function parsePublicationTransitionResult(
  raw: unknown
): PublicationTransitionResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      code: 'unavailable',
      message: PUBLICATION_TRANSITION_MESSAGES_PL.unavailable,
      publicationStatus: null,
      missing: [],
    }
  }
  const r = raw as Record<string, unknown>
  const code = toPublicationTransitionCode(
    typeof r.code === 'string' ? r.code : ''
  )
  const data =
    r.data !== null && typeof r.data === 'object' && !Array.isArray(r.data)
      ? (r.data as Record<string, unknown>)
      : null
  const missing = Array.isArray(data?.missing)
    ? (data.missing.filter((m) =>
        (PUBLICATION_MISSING_FIELD_CODES as readonly string[]).includes(
          m as string
        )
      ) as PublicationMissingFieldCode[])
    : []
  return {
    ok: r.ok === true && code !== 'unavailable',
    code,
    message: PUBLICATION_TRANSITION_MESSAGES_PL[code],
    publicationStatus: toPublicationStatus(data?.publication_status),
    missing,
  }
}
