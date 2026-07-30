import { describe, expect, it } from 'vitest'
import { CLAIM_MESSAGES_PL, claimMessagePl, toClaimResultCode } from '../errors'
import { CLAIM_RESULT_CODES } from '../types'

describe('claim error mapping', () => {
  it('maps every stable code to a non-empty Polish message', () => {
    for (const code of CLAIM_RESULT_CODES) {
      const msg = CLAIM_MESSAGES_PL[code]
      expect(msg, code).toBeTruthy()
      expect(typeof msg).toBe('string')
    }
  })

  it('covers the required stable error codes', () => {
    for (const code of [
      'not_authenticated',
      'not_authorized',
      'master_not_found',
      'master_already_claimed',
      'master_not_eligible',
      'active_invitation_exists',
      'invitation_not_found',
      'invalid_transition',
      'invitation_already_terminal',
      'generation_conflict',
      'rate_limited',
      'unexpected_error',
    ] as const) {
      expect(CLAIM_RESULT_CODES).toContain(code)
      expect(claimMessagePl(code)).toBeTruthy()
    }
  })

  it('falls back to the generic error for unknown codes (no raw SQL leaks)', () => {
    expect(toClaimResultCode('some_raw_pg_error: relation does not exist')).toBe(
      'unexpected_error'
    )
    expect(claimMessagePl('42P01')).toBe(CLAIM_MESSAGES_PL.unexpected_error)
  })

  it('never exposes token or hash wording in any message', () => {
    for (const msg of Object.values(CLAIM_MESSAGES_PL)) {
      expect(msg.toLowerCase()).not.toContain('token')
      expect(msg.toLowerCase()).not.toContain('hash')
    }
  })
})
