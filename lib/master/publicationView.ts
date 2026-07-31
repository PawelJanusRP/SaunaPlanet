// SP-039 Slice 4C2-App — pure view models for the publication workflow UI.
//
// The DATABASE is the authority for every transition and completeness rule
// (M10). This module mirrors ONLY what the UI must render before calling an
// RPC: the action matrix (verbatim from the M10 migration header) and the
// hard completeness checklist (the exact predicates of the submit gate).
// The mirrors are pinned by tests; if the DB contract changes, change both.

import { BIO_MIN_LENGTH } from './completeness'
import type {
  PublicationMissingFieldCode,
  PublicationStatus,
} from './publicationTransitions'
import { PUBLICATION_MISSING_FIELD_LABELS_PL } from './publicationTransitions'

/** A master with no master_publication row behaves as an ordinary draft
 *  (the submit RPC get-or-creates the row on first use). */
export function effectivePublicationStatus(
  status: PublicationStatus | null | undefined
): PublicationStatus {
  return status ?? 'draft'
}

export const PUBLICATION_STATUS_LABELS_PL: Record<PublicationStatus, string> = {
  draft: 'Wersja robocza',
  submitted: 'Zgłoszony do moderacji',
  changes_requested: 'Moderacja prosi o zmiany',
  published: 'Opublikowany',
  legacy_published: 'Opublikowany (profil zweryfikowany historycznie)',
  suspended: 'Publikacja zawieszona',
}

export const PUBLICATION_STATUS_HINTS_PL: Record<PublicationStatus, string> = {
  draft:
    'Profil nie jest widoczny publicznie. Uzupełnij wymagane pola i zgłoś go do publikacji.',
  submitted:
    'Profil czeka na przegląd moderacji. Do czasu zatwierdzenia nie jest widoczny publicznie.',
  changes_requested:
    'Moderacja poprosiła o poprawki. Po ich wprowadzeniu zgłoś profil ponownie.',
  published: 'Profil jest widoczny publicznie w katalogu saunamistrzów.',
  legacy_published:
    'Profil jest widoczny publicznie na dotychczasowych zasadach.',
  suspended:
    'Publikacja została zawieszona przez moderację. Skontaktuj się z administracją.',
}

/** Owner-side transition controls, verbatim from the M10 matrix. */
export type OwnerPublicationAction = 'submit' | 'withdraw' | 'unpublish'

export function resolveOwnerPublicationActions(
  status: PublicationStatus
): OwnerPublicationAction[] {
  switch (status) {
    case 'draft':
    case 'changes_requested':
      return ['submit']
    case 'submitted':
      return ['withdraw']
    case 'published':
      return ['unpublish']
    case 'legacy_published':
    case 'suspended':
      return []
  }
}

/** Moderator-side transition controls, verbatim from the M10 matrix. */
export type ModeratorPublicationAction =
  | 'approve'
  | 'request_changes'
  | 'unpublish'
  | 'suspend'
  | 'restore'

export function resolveModeratorPublicationActions(
  status: PublicationStatus
): ModeratorPublicationAction[] {
  switch (status) {
    case 'submitted':
      return ['approve', 'request_changes', 'suspend']
    case 'changes_requested':
      return ['suspend']
    case 'published':
      return ['unpublish', 'suspend']
    case 'legacy_published':
      return ['unpublish', 'suspend']
    case 'suspended':
      return ['restore']
    case 'draft':
      return []
  }
}

/** Moderator actions whose reason/note the M10 RPCs REQUIRE. */
export const MODERATOR_ACTIONS_REQUIRING_REASON: readonly ModeratorPublicationAction[] =
  ['request_changes', 'suspend', 'restore']

/**
 * SP-039P0 — moderator guidance for the `master_not_approved` result of the
 * approve RPC. The double gate is intentional: the BASE master profile must
 * be approved (admin panel, masters tab) before publication approval; the
 * two decisions stay separate and the RPC result code stays authoritative.
 */
export const MASTER_NOT_APPROVED_GUIDANCE_PL = {
  message:
    'Najpierw zatwierdź profil saunamistrza. Publikacja wizytówki jest ' +
    'możliwa dopiero po zatwierdzeniu profilu podstawowego.',
  /** The real master-moderation surface: /admin, masters tab. */
  actionHref: '/admin?tab=masters',
  actionLabel: 'Przejdź do moderacji saunamistrzów',
} as const

/** Saving a material edit on a publicly visible profile demotes it (M10
 *  trigger) — the editor must warn BEFORE save. */
export function needsMaterialEditWarning(status: PublicationStatus): boolean {
  return status === 'published' || status === 'legacy_published'
}

export type HardChecklistProfile = {
  name: string | null
  city: string | null
  bio: string | null
  avatarUrl: string | null
  specialties: string[] | null
}

export type HardChecklistItem = {
  code: PublicationMissingFieldCode
  label: string
  ok: boolean
}

/**
 * The EXACT predicates of the M10 submit gate (btrim semantics; bio uses the
 * shared BIO_MIN_LENGTH). The database re-checks authoritatively — this
 * mirror only lets the UI show the same verdict the RPC would return.
 */
export function resolveHardChecklist(
  profile: HardChecklistProfile
): HardChecklistItem[] {
  const filled = (v: string | null) => (v ?? '').trim().length > 0
  const items: { code: PublicationMissingFieldCode; ok: boolean }[] = [
    { code: 'name', ok: filled(profile.name) },
    { code: 'city', ok: filled(profile.city) },
    { code: 'bio', ok: (profile.bio ?? '').trim().length >= BIO_MIN_LENGTH },
    { code: 'avatar', ok: filled(profile.avatarUrl) },
    { code: 'specialties', ok: (profile.specialties?.length ?? 0) >= 1 },
  ]
  return items.map((item) => ({
    ...item,
    label: PUBLICATION_MISSING_FIELD_LABELS_PL[item.code],
  }))
}

/** Missing-field codes exactly as the submit RPC would report them. */
export function resolveMissingHardFields(
  profile: HardChecklistProfile
): PublicationMissingFieldCode[] {
  return resolveHardChecklist(profile)
    .filter((item) => !item.ok)
    .map((item) => item.code)
}
