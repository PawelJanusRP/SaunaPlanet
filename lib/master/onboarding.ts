// SP-039P0 / SP-039H — Master Studio first-steps checklist (Layer 1).
//
// Completion is DERIVED, never stored: every step reads facts the Studio
// dashboard already loads (owned profile row, the M10 hard checklist via
// resolveHardChecklist, the publication status, existing event data). There
// is no onboarding-state table, no persisted dismissal, and no parallel
// completeness predicate — the hard-gate steps consume the EXACT
// HardChecklistItem verdicts the submit RPC mirrors.

import type { PublicationStatus } from './publicationTransitions'
import type { HardChecklistItem } from './publicationView'

export type FirstStepKey =
  | 'claimed'
  | 'details'
  | 'avatar'
  | 'specialty'
  | 'preview'
  | 'submitted'
  | 'published'
  | 'first-event'

export type FirstStep = {
  key: FirstStepKey
  label: string
  /** required = the path to profile publication; recommended = after it. */
  kind: 'required' | 'recommended'
  done: boolean
  /** Real route to act on the step; null when no direct action exists. */
  href: string | null
  /** Short Polish explanation shown under the step (optional). */
  hint?: string
}

export type FirstStepsInput = {
  /** The M10 hard checklist (resolveHardChecklist) — the single authority
   *  for what publication requires; never re-derived here. */
  checklist: HardChecklistItem[]
  publicationStatus: PublicationStatus
  /** Base master profile approved by platform moderation. */
  masterApproved: boolean
  /** Any organized event OR any approved participation exists. */
  hasAnyEvent: boolean
  /** Public-profile route (slug or id) — preview is always available. */
  previewHref: string
}

export type FirstSteps = {
  steps: FirstStep[]
  required: FirstStep[]
  recommended: FirstStep[]
  doneCount: number
  totalCount: number
  /** e.g. "5 z 8 kroków" */
  progressLabel: string
}

const SUBMITTED_OR_LATER: readonly PublicationStatus[] = [
  'submitted',
  'published',
  'legacy_published',
]
const PUBLISHED: readonly PublicationStatus[] = ['published', 'legacy_published']

function checklistOk(
  checklist: HardChecklistItem[],
  codes: readonly string[]
): boolean {
  return checklist
    .filter((item) => codes.includes(item.code))
    .every((item) => item.ok)
}

export function deriveFirstSteps(input: FirstStepsInput): FirstSteps {
  const steps: FirstStep[] = [
    {
      key: 'claimed',
      label: 'Profil został przejęty',
      kind: 'required',
      // The card renders only inside the owner's Studio — ownership is the
      // entry condition, so this step is complete by construction.
      done: true,
      href: null,
    },
    {
      key: 'details',
      label: 'Uzupełniono wymagane dane wizytówki',
      kind: 'required',
      done: checklistOk(input.checklist, ['name', 'city', 'bio']),
      href: '/studio/profile',
    },
    {
      key: 'avatar',
      label: 'Dodano zdjęcie profilowe',
      kind: 'required',
      done: checklistOk(input.checklist, ['avatar']),
      href: '/studio/profile',
    },
    {
      key: 'specialty',
      label: 'Dodano co najmniej jedną specjalizację',
      kind: 'required',
      done: checklistOk(input.checklist, ['specialties']),
      href: '/studio/profile',
    },
    {
      key: 'preview',
      label: 'Dostępny jest podgląd wizytówki',
      kind: 'required',
      // Preview exists for every owned profile; before publication only the
      // owner (and moderation) can see it.
      done: true,
      href: input.previewHref,
    },
    {
      key: 'submitted',
      label: 'Profil został wysłany do moderacji',
      kind: 'required',
      done: SUBMITTED_OR_LATER.includes(input.publicationStatus),
      // The submit action lives on the Studio publication card.
      href: '/studio#publikacja',
    },
    {
      key: 'published',
      label: 'Profil został opublikowany',
      kind: 'required',
      done: PUBLISHED.includes(input.publicationStatus),
      href: null,
      hint: 'O publikacji decyduje moderacja po Twoim zgłoszeniu.',
    },
    {
      key: 'first-event',
      label: 'Dodano pierwsze wydarzenie',
      kind: 'recommended',
      done: input.hasAnyEvent,
      // A pending master must never get a broken event-creation action —
      // events unlock after platform moderation approves the profile.
      href: input.masterApproved ? '/studio/events' : null,
      hint: input.masterApproved
        ? undefined
        : 'Dodawanie wydarzeń będzie dostępne po zatwierdzeniu profilu saunamistrza przez moderację.',
    },
  ]

  const doneCount = steps.filter((step) => step.done).length
  return {
    steps,
    required: steps.filter((step) => step.kind === 'required'),
    recommended: steps.filter((step) => step.kind === 'recommended'),
    doneCount,
    totalCount: steps.length,
    progressLabel: `${doneCount} z ${steps.length} kroków`,
  }
}
