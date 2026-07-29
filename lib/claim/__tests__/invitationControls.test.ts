// SP-039 Slice 3B3 — action-availability matrix + invitation input validation.

import { describe, expect, it } from 'vitest'
import {
  DELIVERY_CHANNEL_LABELS_PL,
  DELIVERY_HINT_EXAMPLES,
  evaluateInvitationActions,
  invitationControlMessagePl,
  isDeliveryChannel,
  normalizeValidDays,
  VALID_DAYS_DEFAULT,
  validateDeliveryHint,
  validateInvitationReason,
} from '../invitationControls'
import type { PilotInvitationSummary, PilotProfileState } from '../pilot'
import { CLAIM_RESULT_CODES, DELIVERY_CHANNELS } from '../types'

const NOW = new Date('2026-07-29T12:00:00Z')
const FUTURE = '2026-08-10T12:00:00Z'
const PAST = '2026-07-01T12:00:00Z'

function profile(overrides: Partial<PilotProfileState> = {}): PilotProfileState {
  return {
    userId: null,
    origin: 'admin_prepared',
    status: 'pending',
    name: 'Jan Kowalski',
    city: 'Poznań',
    bio: 'Doświadczony saunamistrz.',
    ...overrides,
  }
}

function invitation(
  overrides: Partial<PilotInvitationSummary> = {}
): PilotInvitationSummary {
  return {
    invitationId: '11111111-1111-1111-1111-111111111111',
    masterId: '22222222-2222-2222-2222-222222222222',
    status: 'ready',
    expiresAt: FUTURE,
    createdAt: '2026-07-28T10:00:00Z',
    sentAt: null,
    revokedAt: null,
    deliveryChannel: null,
    deliveryTargetHint: null,
    tokenPrefix: 'abcd1234',
    ...overrides,
  }
}

describe('evaluateInvitationActions — matrix', () => {
  it('no invitation + ready profile -> Generate only', () => {
    expect(evaluateInvitationActions(profile(), null, NOW)).toEqual({
      state: 'none',
      canGenerate: true,
      canMarkSent: false,
      canRevoke: false,
      canRegenerate: false,
    })
  })

  it('no invitation + incomplete profile -> nothing', () => {
    expect(evaluateInvitationActions(profile({ bio: null }), null, NOW)).toEqual({
      state: 'none',
      canGenerate: false,
      canMarkSent: false,
      canRevoke: false,
      canRegenerate: false,
    })
  })

  it('ready (unexpired) -> Mark-sent + Revoke + Regenerate, never Generate', () => {
    expect(
      evaluateInvitationActions(profile(), invitation({ status: 'ready' }), NOW)
    ).toEqual({
      state: 'ready',
      canGenerate: false,
      canMarkSent: true,
      canRevoke: true,
      canRegenerate: true,
    })
  })

  it('sent -> Revoke + Regenerate (mark-sent not offered as a normal transition)', () => {
    expect(
      evaluateInvitationActions(profile(), invitation({ status: 'sent' }), NOW)
    ).toEqual({
      state: 'sent',
      canGenerate: false,
      canMarkSent: false,
      canRevoke: true,
      canRegenerate: true,
    })
  })

  it('opened -> Revoke + Regenerate', () => {
    expect(
      evaluateInvitationActions(profile(), invitation({ status: 'opened' }), NOW)
    ).toEqual({
      state: 'opened',
      canGenerate: false,
      canMarkSent: false,
      canRevoke: true,
      canRegenerate: true,
    })
  })

  it('claimed profile (user_id set) -> NO mutation controls', () => {
    expect(
      evaluateInvitationActions(
        profile({ userId: 'u1' }),
        invitation({ status: 'sent' }),
        NOW
      )
    ).toEqual({
      state: 'claimed',
      canGenerate: false,
      canMarkSent: false,
      canRevoke: false,
      canRegenerate: false,
    })
  })

  it('claimed invitation -> NO mutation controls', () => {
    expect(
      evaluateInvitationActions(profile(), invitation({ status: 'claimed' }), NOW)
    ).toEqual({
      state: 'claimed',
      canGenerate: false,
      canMarkSent: false,
      canRevoke: false,
      canRegenerate: false,
    })
  })

  it.each(['expired', 'revoked'] as const)(
    '%s -> Regenerate only, while the profile stays eligible',
    (status) => {
      expect(evaluateInvitationActions(profile(), invitation({ status }), NOW)).toEqual({
        state: status,
        canGenerate: false,
        canMarkSent: false,
        canRevoke: false,
        canRegenerate: true,
      })
    }
  )

  it('expired/revoked with an ineligible profile -> no Regenerate', () => {
    for (const status of ['expired', 'revoked'] as const) {
      const r = evaluateInvitationActions(
        profile({ bio: null }),
        invitation({ status }),
        NOW
      )
      expect(r.canRegenerate).toBe(false)
      expect(r.canRevoke).toBe(false)
      expect(r.canMarkSent).toBe(false)
      expect(r.canGenerate).toBe(false)
    }
  })

  it('active-status invitation past expires_at behaves as expired (Regenerate only)', () => {
    expect(
      evaluateInvitationActions(
        profile(),
        invitation({ status: 'sent', expiresAt: PAST }),
        NOW
      )
    ).toEqual({
      state: 'expired',
      canGenerate: false,
      canMarkSent: false,
      canRevoke: false,
      canRegenerate: true,
    })
  })

  it('non-pending profile blocks regeneration of a terminal invitation', () => {
    const r = evaluateInvitationActions(
      profile({ status: 'approved' }),
      invitation({ status: 'revoked' }),
      NOW
    )
    expect(r.canRegenerate).toBe(false)
  })
})

describe('validateDeliveryHint (redaction gate)', () => {
  it('accepts every documented redacted example', () => {
    for (const example of DELIVERY_HINT_EXAMPLES) {
      const r = validateDeliveryHint(example)
      expect(r.ok, example).toBe(true)
    }
  })

  it('blank -> ok with null value', () => {
    expect(validateDeliveryHint('')).toEqual({ ok: true, value: null })
    expect(validateDeliveryHint('   ')).toEqual({ ok: true, value: null })
    expect(validateDeliveryHint(null)).toEqual({ ok: true, value: null })
  })

  it.each([
    'jan.kowalski@example.com',
    'kontakt: anna@gmail.com',
    'ab@cd.pl',
  ])('rejects a likely FULL e-mail address: %s', (value) => {
    const r = validateDeliveryHint(value)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('e-mail')
  })

  it.each(['601234567', '+48 601 234 567', 'tel. 601-234-567'])(
    'rejects a likely FULL phone number: %s',
    (value) => {
      const r = validateDeliveryHint(value)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toContain('telefonu')
    }
  )

  it('masking characters make the hint acceptable', () => {
    expect(validateDeliveryHint('p***@example.com').ok).toBe(true)
    expect(validateDeliveryHint('***123').ok).toBe(true)
    expect(validateDeliveryHint('+48 *** *** 567').ok).toBe(true)
  })

  it('enforces the length cap', () => {
    expect(validateDeliveryHint('a'.repeat(121)).ok).toBe(false)
    expect(validateDeliveryHint('a'.repeat(120)).ok).toBe(true)
  })
})

describe('validateInvitationReason', () => {
  it('requires a non-empty reason', () => {
    expect(validateInvitationReason('').ok).toBe(false)
    expect(validateInvitationReason('   ').ok).toBe(false)
    expect(validateInvitationReason(null).ok).toBe(false)
  })

  it('trims and accepts a real reason', () => {
    expect(validateInvitationReason('  link wyciekł  ')).toEqual({
      ok: true,
      value: 'link wyciekł',
    })
  })

  it('caps at the audit limit (2000)', () => {
    expect(validateInvitationReason('a'.repeat(2001)).ok).toBe(false)
    expect(validateInvitationReason('a'.repeat(2000)).ok).toBe(true)
  })
})

describe('normalizeValidDays (mirrors the RPC clamp)', () => {
  it.each([
    [1, 1],
    [60, 60],
    [30, 30],
    ['30', 30],
    [0, VALID_DAYS_DEFAULT],
    [61, VALID_DAYS_DEFAULT],
    [14.5, VALID_DAYS_DEFAULT],
    ['abc', VALID_DAYS_DEFAULT],
    [undefined, VALID_DAYS_DEFAULT],
    [null, VALID_DAYS_DEFAULT],
    ['', VALID_DAYS_DEFAULT],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeValidDays(input)).toBe(expected)
  })
})

describe('result contracts and messages', () => {
  it('every RPC code plus the extra codes maps to a non-empty Polish message', () => {
    for (const code of CLAIM_RESULT_CODES) {
      expect(invitationControlMessagePl(code)).toBeTruthy()
    }
    expect(invitationControlMessagePl('payload_malformed')).toContain('Odśwież')
    expect(invitationControlMessagePl('invalid_input')).toBeTruthy()
  })

  it('delivery channel vocabulary matches the DB CHECK and has Polish labels', () => {
    for (const c of DELIVERY_CHANNELS) {
      expect(isDeliveryChannel(c)).toBe(true)
      expect(DELIVERY_CHANNEL_LABELS_PL[c]).toBeTruthy()
    }
    expect(isDeliveryChannel('pigeon')).toBe(false)
    expect(isDeliveryChannel('')).toBe(false)
  })
})
