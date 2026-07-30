// SP-039 Slice 4A — pure public-claim model tests.

import { describe, expect, it } from 'vitest'
import {
  PUBLIC_CLAIM_RESULT_CODES,
  PUBLIC_CLAIM_RESULT_MESSAGES_PL,
  PUBLIC_CLAIM_STATES,
  PUBLIC_CLAIM_STATE_MESSAGES_PL,
  TERMINAL_PUBLIC_CLAIM_CODES,
  extractClaimedMasterId,
  isValidClaimTokenShape,
  sanitizePublicInvitationPreview,
  toPublicClaimResultCode,
  toPublicClaimState,
} from '../publicClaim'

const TOKEN = 'A'.repeat(43)

describe('state and code narrowing (fail-closed)', () => {
  it('accepts every declared public state', () => {
    for (const s of PUBLIC_CLAIM_STATES) {
      expect(toPublicClaimState(s)).toBe(s)
    }
  })
  it('collapses unknown states to the generic negative', () => {
    expect(toPublicClaimState('claimed')).toBe('invalid_or_unknown')
    expect(toPublicClaimState('')).toBe('invalid_or_unknown')
    expect(toPublicClaimState('ok')).toBe('invalid_or_unknown')
  })
  it('accepts every declared claim result code', () => {
    for (const c of PUBLIC_CLAIM_RESULT_CODES) {
      expect(toPublicClaimResultCode(c)).toBe(c)
    }
  })
  it('collapses unknown claim codes to unexpected_error', () => {
    expect(toPublicClaimResultCode('claimable')).toBe('unexpected_error')
    expect(toPublicClaimResultCode('drop table')).toBe('unexpected_error')
  })
})

describe('Polish message coverage', () => {
  it('every public state has a non-empty message', () => {
    for (const s of PUBLIC_CLAIM_STATES) {
      expect(PUBLIC_CLAIM_STATE_MESSAGES_PL[s].length).toBeGreaterThan(0)
    }
  })
  it('every claim code has a non-empty message', () => {
    for (const c of PUBLIC_CLAIM_RESULT_CODES) {
      expect(PUBLIC_CLAIM_RESULT_MESSAGES_PL[c].length).toBeGreaterThan(0)
    }
  })
  it('malformed and unknown tokens share one message (anti-enumeration)', () => {
    expect(PUBLIC_CLAIM_STATE_MESSAGES_PL.invalid_or_unknown).toBe(
      PUBLIC_CLAIM_RESULT_MESSAGES_PL.invalid_token
    )
  })
})

describe('terminal codes', () => {
  it('marks settled outcomes and only those', () => {
    expect(TERMINAL_PUBLIC_CLAIM_CODES).toContain('claimed')
    expect(TERMINAL_PUBLIC_CLAIM_CODES).toContain('already_claimed_by_you')
    expect(TERMINAL_PUBLIC_CLAIM_CODES).toContain('expired')
    expect(TERMINAL_PUBLIC_CLAIM_CODES).toContain('revoked')
    expect(TERMINAL_PUBLIC_CLAIM_CODES).toContain('already_claimed')
    expect(TERMINAL_PUBLIC_CLAIM_CODES).not.toContain('not_authenticated')
    expect(TERMINAL_PUBLIC_CLAIM_CODES).not.toContain('unexpected_error')
  })
})

describe('token shape validation', () => {
  it('accepts exactly the 43-char base64url alphabet', () => {
    expect(isValidClaimTokenShape(TOKEN)).toBe(true)
    expect(isValidClaimTokenShape('aZ9-_'.repeat(8) + 'abc')).toBe(true)
  })
  it('rejects wrong lengths, wrong alphabets and non-strings', () => {
    expect(isValidClaimTokenShape('A'.repeat(42))).toBe(false)
    expect(isValidClaimTokenShape('A'.repeat(44))).toBe(false)
    expect(isValidClaimTokenShape('A'.repeat(42) + '+')).toBe(false)
    expect(isValidClaimTokenShape('A'.repeat(42) + '=')).toBe(false)
    expect(isValidClaimTokenShape('')).toBe(false)
    expect(isValidClaimTokenShape(null)).toBe(false)
    expect(isValidClaimTokenShape(undefined)).toBe(false)
    expect(isValidClaimTokenShape(42)).toBe(false)
  })
})

describe('sanitizePublicInvitationPreview (allow-list)', () => {
  const base = {
    master_name: 'Jan Para',
    city: 'Poznań',
    avatar_url: 'https://cdn.example/a.jpg',
    bio: 'O mnie',
    expires_at: '2026-08-13T10:00:00Z',
    auth_required: true,
  }
  it('maps the allow-listed fields', () => {
    const p = sanitizePublicInvitationPreview(base)
    expect(p).toEqual({
      state: 'claimable',
      masterName: 'Jan Para',
      city: 'Poznań',
      avatarUrl: 'https://cdn.example/a.jpg',
      bio: 'O mnie',
      expiresAt: '2026-08-13T10:00:00Z',
      authRequired: true,
    })
  })
  it('structurally drops every non-allow-listed key', () => {
    const p = sanitizePublicInvitationPreview({
      ...base,
      invitation_id: 'x',
      master_id: 'y',
      admin_note: 'secret',
      delivery_target_hint: 'p***',
      token_prefix: 'abcdefgh',
    })
    expect(p).not.toBeNull()
    expect(Object.keys(p as object).sort()).toEqual(
      ['authRequired', 'avatarUrl', 'bio', 'city', 'expiresAt', 'masterName', 'state'].sort()
    )
  })
  it('fails closed without a usable name or a non-object payload', () => {
    expect(sanitizePublicInvitationPreview(null)).toBeNull()
    expect(sanitizePublicInvitationPreview('x')).toBeNull()
    expect(sanitizePublicInvitationPreview({ ...base, master_name: '  ' })).toBeNull()
    expect(sanitizePublicInvitationPreview({ ...base, master_name: undefined })).toBeNull()
  })
  it('normalizes blanks to null and defaults authRequired to true', () => {
    const p = sanitizePublicInvitationPreview({
      master_name: 'Jan',
      city: ' ',
      avatar_url: '',
      bio: null,
      expires_at: 42,
    })
    expect(p).toEqual({
      state: 'claimable',
      masterName: 'Jan',
      city: null,
      avatarUrl: null,
      bio: null,
      expiresAt: null,
      authRequired: true,
    })
  })
})

describe('extractClaimedMasterId (allow-list)', () => {
  it('extracts only a non-empty string id', () => {
    expect(extractClaimedMasterId({ master_id: 'abc' })).toBe('abc')
    expect(extractClaimedMasterId({ master_id: '' })).toBeNull()
    expect(extractClaimedMasterId({ master_id: 42 })).toBeNull()
    expect(extractClaimedMasterId({})).toBeNull()
    expect(extractClaimedMasterId(null)).toBeNull()
  })
})
