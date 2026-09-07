// SP-039 Slice 4C2 — unit tests for the M10 transition contract module.

import { describe, expect, it } from 'vitest'
import {
  PUBLICATION_MISSING_FIELD_CODES,
  PUBLICATION_MISSING_FIELD_LABELS_PL,
  PUBLICATION_TRANSITION_CODES,
  PUBLICATION_TRANSITION_MESSAGES_PL,
  PUBLICATION_TRANSITION_RPCS,
  parsePublicationTransitionResult,
  toPublicationStatus,
  toPublicationTransitionCode,
} from '../publicationTransitions'

describe('publication transition codes', () => {
  it('every code has a Polish message', () => {
    for (const code of PUBLICATION_TRANSITION_CODES) {
      expect(PUBLICATION_TRANSITION_MESSAGES_PL[code]).toBeTruthy()
    }
  })
  it('every missing-field code has a Polish label', () => {
    for (const code of PUBLICATION_MISSING_FIELD_CODES) {
      expect(PUBLICATION_MISSING_FIELD_LABELS_PL[code]).toBeTruthy()
    }
  })
  it('narrows unknown codes fail-closed to unavailable', () => {
    expect(toPublicationTransitionCode('published')).toBe('published')
    expect(toPublicationTransitionCode('DROP TABLE')).toBe('unavailable')
    expect(toPublicationTransitionCode('')).toBe('unavailable')
  })
  it('pins the exact RPC names of the M10 grants', () => {
    expect(Object.values(PUBLICATION_TRANSITION_RPCS)).toEqual([
      'submit_master_profile_for_publication',
      'withdraw_master_profile_submission',
      'unpublish_master_profile',
      'moderator_approve_master_publication',
      'moderator_request_master_publication_changes',
      'moderator_suspend_master_publication',
      'moderator_restore_master_publication',
    ])
  })
})

describe('toPublicationStatus', () => {
  it('accepts only the M9 vocabulary', () => {
    expect(toPublicationStatus('published')).toBe('published')
    expect(toPublicationStatus('legacy_published')).toBe('legacy_published')
    expect(toPublicationStatus('nonsense')).toBeNull()
    expect(toPublicationStatus(42)).toBeNull()
    expect(toPublicationStatus(null)).toBeNull()
  })
})

describe('parsePublicationTransitionResult', () => {
  it('parses a success payload with the resulting state', () => {
    const r = parsePublicationTransitionResult({
      ok: true,
      code: 'submitted',
      data: { publication_status: 'submitted' },
    })
    expect(r.ok).toBe(true)
    expect(r.code).toBe('submitted')
    expect(r.publicationStatus).toBe('submitted')
    expect(r.missing).toEqual([])
    expect(r.message).toBe(PUBLICATION_TRANSITION_MESSAGES_PL.submitted)
  })
  it('parses profile_incomplete with allow-listed missing codes only', () => {
    const r = parsePublicationTransitionResult({
      ok: false,
      code: 'profile_incomplete',
      data: { missing: ['bio', 'avatar', 'secret_column', 42] },
    })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('profile_incomplete')
    expect(r.missing).toEqual(['bio', 'avatar'])
  })
  it('collapses malformed payloads to retryable unavailable', () => {
    for (const raw of [null, undefined, 'x', 7, [], { ok: true, code: 'weird' }]) {
      const r = parsePublicationTransitionResult(raw)
      expect(r.code).toBe('unavailable')
      expect(r.ok).toBe(false)
      expect(r.publicationStatus).toBeNull()
    }
  })
  it('never trusts ok without a known code', () => {
    const r = parsePublicationTransitionResult({ ok: true, code: 'mystery' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('unavailable')
  })
})
