import { describe, expect, it } from 'vitest'
import {
  evaluateInvitationEligibility,
  type MasterEligibilityInput,
} from '../eligibility'

const base: MasterEligibilityInput = {
  exists: true,
  userId: null,
  origin: 'admin_prepared',
  status: 'pending',
  name: 'Jan Kowalski',
}

describe('invitation eligibility', () => {
  it('accepts a prepared, unclaimed, pending, named profile', () => {
    expect(evaluateInvitationEligibility(base)).toEqual({ eligible: true, code: 'ok' })
  })

  it('rejects a missing master', () => {
    expect(evaluateInvitationEligibility({ ...base, exists: false }).code).toBe(
      'master_not_found'
    )
  })

  it('rejects a profile already linked to an account', () => {
    expect(
      evaluateInvitationEligibility({ ...base, userId: 'u-1' }).code
    ).toBe('master_already_claimed')
  })

  it('rejects self_registered origin', () => {
    expect(
      evaluateInvitationEligibility({ ...base, origin: 'self_registered' }).code
    ).toBe('master_not_eligible')
  })

  it('rejects non-pending moderation status', () => {
    for (const status of ['approved', 'rejected']) {
      expect(evaluateInvitationEligibility({ ...base, status }).code).toBe(
        'master_not_eligible'
      )
    }
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(evaluateInvitationEligibility({ ...base, name: '' }).code).toBe(
      'master_not_eligible'
    )
    expect(evaluateInvitationEligibility({ ...base, name: '   ' }).code).toBe(
      'master_not_eligible'
    )
    expect(evaluateInvitationEligibility({ ...base, name: null }).code).toBe(
      'master_not_eligible'
    )
  })

  it('checks claimed before eligibility (order matches the RPC)', () => {
    // a claimed row that is also self_registered still reports "already_claimed"
    expect(
      evaluateInvitationEligibility({
        ...base,
        userId: 'u-1',
        origin: 'self_registered',
      }).code
    ).toBe('master_already_claimed')
  })
})
