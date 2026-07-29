// SP-039 Slice 3B3 — claim-link builder + fail-closed token-grant parsing.
// The token below is a synthetic fixture (43 base64url chars), never a secret.

import { describe, expect, it } from 'vitest'
import {
  buildClaimUrl,
  CLAIM_PUBLIC_ORIGIN_ENV,
  CLAIM_ROUTE_PREFIX,
  CLAIM_TOKEN_LENGTH,
  isValidClaimToken,
  parseTokenGrant,
  resolveClaimPublicOrigin,
} from '../claimLink'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'

describe('isValidClaimToken', () => {
  it('accepts exactly the 43-char base64url shape', () => {
    expect(TOKEN).toHaveLength(CLAIM_TOKEN_LENGTH)
    expect(isValidClaimToken(TOKEN)).toBe(true)
  })

  it.each([
    ['too short', TOKEN.slice(0, 42)],
    ['too long', TOKEN + 'A'],
    ['base64 plus', TOKEN.slice(0, 42) + '+'],
    ['base64 slash', TOKEN.slice(0, 42) + '/'],
    ['padding', TOKEN.slice(0, 42) + '='],
    ['space', TOKEN.slice(0, 42) + ' '],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isValidClaimToken(value)).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidClaimToken(null)).toBe(false)
    expect(isValidClaimToken(undefined)).toBe(false)
    expect(isValidClaimToken(42)).toBe(false)
  })
})

describe('resolveClaimPublicOrigin (server-only, fail-closed, no fallback)', () => {
  const env = (value?: string) =>
    value === undefined ? {} : { [CLAIM_PUBLIC_ORIGIN_ENV]: value }

  it('accepts a valid absolute https root origin', () => {
    expect(resolveClaimPublicOrigin(env('https://saunaplanet.pl'))).toEqual({
      ok: true,
      origin: 'https://saunaplanet.pl',
    })
  })

  it('normalizes a trailing slash away deterministically', () => {
    expect(resolveClaimPublicOrigin(env('https://saunaplanet.pl/'))).toEqual({
      ok: true,
      origin: 'https://saunaplanet.pl',
    })
  })

  it('accepts a non-default port as part of the origin', () => {
    expect(resolveClaimPublicOrigin(env('https://preview.saunaplanet.pl:8443'))).toEqual({
      ok: true,
      origin: 'https://preview.saunaplanet.pl:8443',
    })
  })

  it.each([
    ['missing variable', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('fails closed as not_configured for %s', (_label, value) => {
    expect(resolveClaimPublicOrigin(env(value))).toEqual({
      ok: false,
      code: 'claim_origin_not_configured',
    })
  })

  it.each([
    ['http (not https)', 'http://saunaplanet.pl'],
    ['credentials', 'https://user:pass@saunaplanet.pl'],
    ['a path', 'https://saunaplanet.pl/claim'],
    ['a query string', 'https://saunaplanet.pl/?x=1'],
    ['a fragment', 'https://saunaplanet.pl/#top'],
    ['garbage', 'not a url'],
    ['schemaless', 'saunaplanet.pl'],
  ])('fails closed as invalid for %s', (_label, value) => {
    expect(resolveClaimPublicOrigin(env(value))).toEqual({
      ok: false,
      code: 'claim_origin_invalid',
    })
  })

  it('never returns the rejected environment value', () => {
    const result = resolveClaimPublicOrigin(env('http://leak.example.com'))
    expect(JSON.stringify(result)).not.toContain('leak.example.com')
  })
})

describe('buildClaimUrl', () => {
  it('builds against the stable future route contract', () => {
    expect(buildClaimUrl(TOKEN, 'https://saunaplanet.pl')).toBe(
      `https://saunaplanet.pl${CLAIM_ROUTE_PREFIX}${TOKEN}`
    )
  })

  it('normalizes the base to its origin', () => {
    expect(buildClaimUrl(TOKEN, 'https://saunaplanet.pl/admin/deep')).toBe(
      `https://saunaplanet.pl${CLAIM_ROUTE_PREFIX}${TOKEN}`
    )
  })

  it('fails closed on an invalid token or base', () => {
    expect(buildClaimUrl(TOKEN.slice(0, 42), 'https://saunaplanet.pl')).toBeNull()
    expect(buildClaimUrl('', 'https://saunaplanet.pl')).toBeNull()
    expect(buildClaimUrl(TOKEN, 'not a url')).toBeNull()
  })
})

describe('parseTokenGrant (fail-closed)', () => {
  const createPayload = {
    invitation_id: 'inv-1',
    token_prefix: TOKEN.slice(0, 8),
    expires_at: '2026-08-12T12:00:00Z',
    raw_token: TOKEN,
  }

  it('parses a create payload (revokedInvitationId null)', () => {
    const grant = parseTokenGrant(createPayload)
    expect(grant).toEqual({
      invitationId: 'inv-1',
      tokenPrefix: TOKEN.slice(0, 8),
      expiresAt: '2026-08-12T12:00:00Z',
      rawToken: TOKEN,
      revokedInvitationId: null,
    })
  })

  it('parses a regenerate payload with the revoked predecessor id', () => {
    const grant = parseTokenGrant({ ...createPayload, revoked_invitation_id: 'inv-0' })
    expect(grant!.revokedInvitationId).toBe('inv-0')
  })

  it('treats a null revoked_invitation_id (plain re-issue) as null', () => {
    const grant = parseTokenGrant({ ...createPayload, revoked_invitation_id: null })
    expect(grant!.revokedInvitationId).toBeNull()
  })

  it.each([
    ['missing raw_token', { ...createPayload, raw_token: undefined }],
    ['short token', { ...createPayload, raw_token: TOKEN.slice(0, 42) }],
    ['bad charset', { ...createPayload, raw_token: TOKEN.slice(0, 42) + '+' }],
    ['prefix mismatch', { ...createPayload, token_prefix: 'zzzzzzzz' }],
    ['missing invitation_id', { ...createPayload, invitation_id: '' }],
    ['missing expires_at', { ...createPayload, expires_at: undefined }],
    ['non-object', 'text'],
    ['null', null],
  ])('returns null for %s', (_label, payload) => {
    expect(parseTokenGrant(payload)).toBeNull()
  })
})
