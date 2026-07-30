// SP-039 Slice 4C2-App — view-model tests: the UI mirrors of the M10
// contract (action matrix + hard checklist) pinned against the migration.

import { describe, expect, it } from 'vitest'
import { BIO_MIN_LENGTH } from '../completeness'
import {
  MODERATOR_ACTIONS_REQUIRING_REASON,
  PUBLICATION_STATUS_HINTS_PL,
  PUBLICATION_STATUS_LABELS_PL,
  effectivePublicationStatus,
  needsMaterialEditWarning,
  resolveHardChecklist,
  resolveMissingHardFields,
  resolveModeratorPublicationActions,
  resolveOwnerPublicationActions,
} from '../publicationView'
import { PUBLICATION_STATUSES } from '../publicationTransitions'

const COMPLETE = {
  name: 'Jan Kowalski',
  city: 'Poznań',
  bio: 'b'.repeat(BIO_MIN_LENGTH),
  avatarUrl: 'https://example.invalid/a.png',
  specialties: ['classic-aufguss'],
}

describe('effectivePublicationStatus', () => {
  it('treats a missing row as draft (the RPC get-or-creates it)', () => {
    expect(effectivePublicationStatus(null)).toBe('draft')
    expect(effectivePublicationStatus(undefined)).toBe('draft')
    expect(effectivePublicationStatus('published')).toBe('published')
  })
})

describe('owner action matrix (verbatim M10)', () => {
  it('matches the migration header for every state', () => {
    expect(resolveOwnerPublicationActions('draft')).toEqual(['submit'])
    expect(resolveOwnerPublicationActions('changes_requested')).toEqual(['submit'])
    expect(resolveOwnerPublicationActions('submitted')).toEqual(['withdraw'])
    expect(resolveOwnerPublicationActions('published')).toEqual(['unpublish'])
    expect(resolveOwnerPublicationActions('suspended')).toEqual([])
    expect(resolveOwnerPublicationActions('legacy_published')).toEqual([])
  })
})

describe('moderator action matrix (verbatim M10)', () => {
  it('matches the migration header for every state', () => {
    expect(resolveModeratorPublicationActions('submitted')).toEqual([
      'approve',
      'request_changes',
      'suspend',
    ])
    expect(resolveModeratorPublicationActions('changes_requested')).toEqual([
      'suspend',
    ])
    expect(resolveModeratorPublicationActions('published')).toEqual([
      'unpublish',
      'suspend',
    ])
    expect(resolveModeratorPublicationActions('legacy_published')).toEqual([
      'unpublish',
      'suspend',
    ])
    expect(resolveModeratorPublicationActions('suspended')).toEqual(['restore'])
    expect(resolveModeratorPublicationActions('draft')).toEqual([])
  })
  it('requires a reason exactly where the RPCs do', () => {
    expect(MODERATOR_ACTIONS_REQUIRING_REASON).toEqual([
      'request_changes',
      'suspend',
      'restore',
    ])
  })
})

describe('material-edit warning', () => {
  it('warns only for the two publicly visible states', () => {
    expect(needsMaterialEditWarning('published')).toBe(true)
    expect(needsMaterialEditWarning('legacy_published')).toBe(true)
    expect(needsMaterialEditWarning('draft')).toBe(false)
    expect(needsMaterialEditWarning('submitted')).toBe(false)
    expect(needsMaterialEditWarning('changes_requested')).toBe(false)
    expect(needsMaterialEditWarning('suspended')).toBe(false)
  })
})

describe('hard checklist (the exact submit-gate predicates)', () => {
  it('a complete profile has no missing fields', () => {
    expect(resolveMissingHardFields(COMPLETE)).toEqual([])
    expect(resolveHardChecklist(COMPLETE).every((i) => i.ok)).toBe(true)
  })
  it('reports the same codes the RPC would return', () => {
    expect(
      resolveMissingHardFields({
        name: '  ',
        city: null,
        bio: 'b'.repeat(BIO_MIN_LENGTH - 1),
        avatarUrl: '',
        specialties: [],
      })
    ).toEqual(['name', 'city', 'bio', 'avatar', 'specialties'])
  })
  it('applies trim semantics like btrim', () => {
    expect(
      resolveMissingHardFields({ ...COMPLETE, city: '   ' })
    ).toEqual(['city'])
    expect(
      resolveMissingHardFields({
        ...COMPLETE,
        bio: '  ' + 'b'.repeat(BIO_MIN_LENGTH - 1) + '  ',
      })
    ).toEqual(['bio'])
  })
  it('bio threshold equals the shared BIO_MIN_LENGTH (80, as in M10)', () => {
    expect(BIO_MIN_LENGTH).toBe(80)
    expect(
      resolveMissingHardFields({ ...COMPLETE, bio: 'b'.repeat(80) })
    ).toEqual([])
    expect(
      resolveMissingHardFields({ ...COMPLETE, bio: 'b'.repeat(79) })
    ).toEqual(['bio'])
  })
  it('recommended fields never appear as hard requirements', () => {
    const codes = resolveHardChecklist(COMPLETE).map((i) => i.code)
    expect(codes).toEqual(['name', 'city', 'bio', 'avatar', 'specialties'])
  })
})

describe('status labels', () => {
  it('covers every publication status with label and hint', () => {
    for (const status of PUBLICATION_STATUSES) {
      expect(PUBLICATION_STATUS_LABELS_PL[status]).toBeTruthy()
      expect(PUBLICATION_STATUS_HINTS_PL[status]).toBeTruthy()
    }
  })
})
