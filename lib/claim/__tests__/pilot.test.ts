// SP-039 Slice 3B2 — pilot readiness / filter / editability / contract tests.

import { describe, expect, it } from 'vitest'
import {
  evaluatePilotReadiness,
  evaluatePreparedProfileEditability,
  groupInvitationsByMaster,
  INVITATION_STATUS_LABELS_PL,
  matchesPilotFilter,
  missingRequiredFields,
  pickLatestInvitation,
  PILOT_ACTION_CODES,
  PILOT_ACTION_MESSAGES_PL,
  PILOT_FILTER_LABELS_PL,
  PILOT_FILTERS,
  PILOT_READINESS_META,
  PILOT_READINESS_VALUES,
  pilotResult,
  toPilotFilter,
  toPilotInvitationSummaries,
  toPilotInvitationSummary,
  type PilotInvitationSummary,
  type PilotProfileState,
} from '../pilot'
import { INVITATION_STATUSES } from '../types'

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

describe('evaluatePilotReadiness', () => {
  it('complete unclaimed prepared pending profile with no invitation -> ready_for_invitation', () => {
    const r = evaluatePilotReadiness(profile(), null, NOW)
    expect(r.readiness).toBe('ready_for_invitation')
    expect(r.missingRequired).toEqual([])
    expect(r.invitationExpired).toBe(false)
  })

  it('claimed via user_id wins over everything else', () => {
    const r = evaluatePilotReadiness(
      profile({ userId: 'some-user' }),
      invitation({ status: 'ready', expiresAt: FUTURE }),
      NOW
    )
    expect(r.readiness).toBe('claimed')
  })

  it('claimed via latest invitation status claimed', () => {
    const r = evaluatePilotReadiness(profile(), invitation({ status: 'claimed' }), NOW)
    expect(r.readiness).toBe('claimed')
  })

  it.each(['ready', 'sent', 'opened'] as const)(
    'unexpired %s invitation -> active_invitation',
    (status) => {
      const r = evaluatePilotReadiness(
        profile(),
        invitation({ status, expiresAt: FUTURE }),
        NOW
      )
      expect(r.readiness).toBe('active_invitation')
      expect(r.invitationExpired).toBe(false)
    }
  )

  it('active-status invitation past expires_at -> terminal_attention with expiry flag', () => {
    const r = evaluatePilotReadiness(
      profile(),
      invitation({ status: 'sent', expiresAt: PAST }),
      NOW
    )
    expect(r.readiness).toBe('terminal_attention')
    expect(r.invitationExpired).toBe(true)
  })

  it.each(['expired', 'revoked'] as const)(
    'latest %s invitation -> terminal_attention',
    (status) => {
      const r = evaluatePilotReadiness(profile(), invitation({ status }), NOW)
      expect(r.readiness).toBe('terminal_attention')
      expect(r.invitationExpired).toBe(false)
    }
  )

  it('terminal invitation takes precedence over an otherwise-ready profile', () => {
    const r = evaluatePilotReadiness(profile(), invitation({ status: 'revoked' }), NOW)
    expect(r.readiness).toBe('terminal_attention')
  })

  it.each([
    ['name', profile({ name: '  ' })],
    ['city', profile({ city: null })],
    ['bio', profile({ bio: '' })],
  ] as const)('missing %s -> incomplete and reported', (field, p) => {
    const r = evaluatePilotReadiness(p, null, NOW)
    expect(r.readiness).toBe('incomplete')
    expect(r.missingRequired).toContain(field)
  })

  it('self-registered profile is never ready_for_invitation', () => {
    const r = evaluatePilotReadiness(profile({ origin: 'self_registered' }), null, NOW)
    expect(r.readiness).toBe('incomplete')
  })

  it.each(['approved', 'rejected'] as const)(
    'status %s (outside pilot flow) is not ready_for_invitation',
    (status) => {
      const r = evaluatePilotReadiness(profile({ status }), null, NOW)
      expect(r.readiness).toBe('incomplete')
    }
  )

  it('missingRequiredFields lists every gap in stable order', () => {
    expect(missingRequiredFields(profile({ name: null, city: null, bio: null }))).toEqual([
      'name',
      'city',
      'bio',
    ])
  })
})

describe('pilot filters', () => {
  it('every readiness value maps to exactly one non-all filter', () => {
    for (const readiness of PILOT_READINESS_VALUES) {
      const matches = PILOT_FILTERS.filter(
        (f) => f !== 'all' && matchesPilotFilter(readiness, f)
      )
      expect(matches, readiness).toHaveLength(1)
    }
  })

  it('the explicit mapping is the documented one', () => {
    expect(matchesPilotFilter('ready_for_invitation', 'ready')).toBe(true)
    expect(matchesPilotFilter('incomplete', 'incomplete')).toBe(true)
    expect(matchesPilotFilter('active_invitation', 'active')).toBe(true)
    expect(matchesPilotFilter('claimed', 'claimed')).toBe(true)
    expect(matchesPilotFilter('terminal_attention', 'attention')).toBe(true)
    expect(matchesPilotFilter('claimed', 'ready')).toBe(false)
  })

  it('all matches everything', () => {
    for (const readiness of PILOT_READINESS_VALUES) {
      expect(matchesPilotFilter(readiness, 'all')).toBe(true)
    }
  })

  it('toPilotFilter narrows unknown values to all', () => {
    expect(toPilotFilter('claimed')).toBe('claimed')
    expect(toPilotFilter('nonsense')).toBe('all')
    expect(toPilotFilter(undefined)).toBe('all')
  })

  it('every filter and readiness has a Polish label', () => {
    for (const f of PILOT_FILTERS) expect(PILOT_FILTER_LABELS_PL[f]).toBeTruthy()
    for (const r of PILOT_READINESS_VALUES) {
      expect(PILOT_READINESS_META[r].label).toBeTruthy()
      expect(PILOT_READINESS_META[r].className).toBeTruthy()
    }
    for (const s of INVITATION_STATUSES) {
      expect(INVITATION_STATUS_LABELS_PL[s]).toBeTruthy()
    }
  })
})

describe('toPilotInvitationSummary (allow-list sanitizer)', () => {
  const rpcRow = {
    invitation_id: 'inv-1',
    master_id: 'master-1',
    master_name: 'Jan',
    status: 'sent',
    token_prefix: 'abcd1234',
    expires_at: FUTURE,
    created_at: '2026-07-28T10:00:00Z',
    sent_at: '2026-07-28T11:00:00Z',
    revoked_at: null,
    delivery_channel: 'email',
    delivery_target_hint: 'j***@gmail.com',
  }

  it('picks the allow-listed fields', () => {
    const s = toPilotInvitationSummary(rpcRow)
    expect(s).not.toBeNull()
    expect(s!.invitationId).toBe('inv-1')
    expect(s!.masterId).toBe('master-1')
    expect(s!.status).toBe('sent')
    expect(s!.tokenPrefix).toBe('abcd1234')
    expect(s!.deliveryTargetHint).toBe('j***@gmail.com')
  })

  it('structurally drops token_hash / raw_token even if a payload carried them', () => {
    const s = toPilotInvitationSummary({
      ...rpcRow,
      token_hash: 'deadbeef',
      raw_token: 'super-secret',
    })
    expect(s).not.toBeNull()
    const json = JSON.stringify(s)
    expect(json).not.toContain('deadbeef')
    expect(json).not.toContain('super-secret')
    expect(json).not.toContain('token_hash')
    expect(json).not.toContain('raw_token')
  })

  it('rejects rows with a missing id or unknown status', () => {
    expect(toPilotInvitationSummary({ ...rpcRow, invitation_id: undefined })).toBeNull()
    expect(toPilotInvitationSummary({ ...rpcRow, status: 'created' })).toBeNull()
    expect(toPilotInvitationSummary(null)).toBeNull()
    expect(toPilotInvitationSummary('text')).toBeNull()
  })

  it('toPilotInvitationSummaries tolerates a non-array payload', () => {
    expect(toPilotInvitationSummaries(null)).toEqual([])
    expect(toPilotInvitationSummaries({})).toEqual([])
    expect(toPilotInvitationSummaries([rpcRow, null, 42])).toHaveLength(1)
  })
})

describe('pickLatestInvitation / groupInvitationsByMaster', () => {
  it('picks the newest by createdAt', () => {
    const older = invitation({ invitationId: 'a', createdAt: '2026-07-01T00:00:00Z' })
    const newer = invitation({ invitationId: 'b', createdAt: '2026-07-20T00:00:00Z' })
    expect(pickLatestInvitation([older, newer])!.invitationId).toBe('b')
    expect(pickLatestInvitation([newer, older])!.invitationId).toBe('b')
  })

  it('breaks createdAt ties deterministically on invitationId', () => {
    const a = invitation({ invitationId: 'aaa', createdAt: '2026-07-20T00:00:00Z' })
    const b = invitation({ invitationId: 'bbb', createdAt: '2026-07-20T00:00:00Z' })
    expect(pickLatestInvitation([a, b])!.invitationId).toBe('bbb')
    expect(pickLatestInvitation([b, a])!.invitationId).toBe('bbb')
  })

  it('returns null for no invitations', () => {
    expect(pickLatestInvitation([])).toBeNull()
  })

  it('groups by masterId', () => {
    const m1a = invitation({ invitationId: 'a', masterId: 'm1' })
    const m1b = invitation({ invitationId: 'b', masterId: 'm1' })
    const m2 = invitation({ invitationId: 'c', masterId: 'm2' })
    const map = groupInvitationsByMaster([m1a, m2, m1b])
    expect(map.get('m1')).toHaveLength(2)
    expect(map.get('m2')).toHaveLength(1)
    expect(map.get('m3')).toBeUndefined()
  })
})

describe('evaluatePreparedProfileEditability', () => {
  const base = {
    exists: true,
    userId: null,
    origin: 'admin_prepared',
    status: 'pending',
  }

  it('prepared unclaimed pending profile is editable', () => {
    expect(evaluatePreparedProfileEditability(base)).toEqual({ ok: true })
  })

  it('missing row -> not_found', () => {
    expect(evaluatePreparedProfileEditability({ ...base, exists: false })).toEqual({
      ok: false,
      code: 'not_found',
    })
  })

  it('claimed profile -> master_claimed (never editable through the pilot)', () => {
    expect(evaluatePreparedProfileEditability({ ...base, userId: 'u1' })).toEqual({
      ok: false,
      code: 'master_claimed',
    })
  })

  it('self-registered profile -> not_admin_prepared', () => {
    expect(
      evaluatePreparedProfileEditability({ ...base, origin: 'self_registered' })
    ).toEqual({ ok: false, code: 'not_admin_prepared' })
  })

  it.each(['approved', 'rejected'] as const)('status %s -> not_editable_status', (status) => {
    expect(evaluatePreparedProfileEditability({ ...base, status })).toEqual({
      ok: false,
      code: 'not_editable_status',
    })
  })

  it('claimed wins over wrong origin (a claimed profile is reported as claimed)', () => {
    expect(
      evaluatePreparedProfileEditability({
        ...base,
        userId: 'u1',
        origin: 'self_registered',
      })
    ).toEqual({ ok: false, code: 'master_claimed' })
  })
})

describe('pilot action result contract', () => {
  it('every code has a non-empty Polish message', () => {
    for (const code of PILOT_ACTION_CODES) {
      expect(PILOT_ACTION_MESSAGES_PL[code]).toBeTruthy()
    }
  })

  it('pilotResult builds ok exactly for the ok code', () => {
    expect(pilotResult('ok').ok).toBe(true)
    for (const code of PILOT_ACTION_CODES.filter((c) => c !== 'ok')) {
      expect(pilotResult(code).ok).toBe(false)
      expect(pilotResult(code).message).toBe(PILOT_ACTION_MESSAGES_PL[code])
    }
  })

  it('pilotResult supports message refinement and masterId passthrough', () => {
    const r = pilotResult('ok', { message: 'Profil przygotowany.', masterId: 'm1' })
    expect(r).toEqual({ ok: true, code: 'ok', message: 'Profil przygotowany.', masterId: 'm1' })
    const noId = pilotResult('invalid_input', { message: 'Zły slug' })
    expect(noId.masterId).toBeUndefined()
  })
})
