import { describe, expect, it } from 'vitest'
import {
  isActiveStatus,
  isTerminalStatus,
  canMarkSent,
  canRevoke,
  shouldExpire,
} from '../transitions'
import { INVITATION_STATUSES, ACTIVE_INVITATION_STATUSES } from '../types'

describe('invitation status classification', () => {
  it('active set is exactly ready/sent/opened (no created)', () => {
    expect([...ACTIVE_INVITATION_STATUSES]).toEqual(['ready', 'sent', 'opened'])
    expect(INVITATION_STATUSES).not.toContain('created' as never)
    for (const s of INVITATION_STATUSES) {
      expect(isActiveStatus(s)).toBe(['ready', 'sent', 'opened'].includes(s))
    }
  })

  it('terminal set is exactly claimed/expired/revoked', () => {
    for (const s of INVITATION_STATUSES) {
      expect(isTerminalStatus(s)).toBe(
        ['claimed', 'expired', 'revoked'].includes(s)
      )
    }
  })

  it('active and terminal partition the vocabulary', () => {
    for (const s of INVITATION_STATUSES) {
      expect(isActiveStatus(s)).toBe(!isTerminalStatus(s))
    }
  })
})

describe('transition legality (Slice 3B1)', () => {
  it('mark-sent only from ready', () => {
    expect(canMarkSent('ready')).toBe(true)
    for (const s of ['sent', 'opened', 'claimed', 'expired', 'revoked'] as const) {
      expect(canMarkSent(s)).toBe(false)
    }
  })

  it('revoke only from an active status', () => {
    expect(canRevoke('ready')).toBe(true)
    expect(canRevoke('sent')).toBe(true)
    expect(canRevoke('opened')).toBe(true)
    for (const s of ['claimed', 'expired', 'revoked'] as const) {
      expect(canRevoke(s)).toBe(false)
    }
  })
})

describe('expiry materialization', () => {
  const now = new Date('2026-07-27T12:00:00Z')
  it('expires an active row whose expires_at has passed', () => {
    expect(shouldExpire('ready', new Date('2026-07-27T11:59:59Z'), now)).toBe(true)
    expect(shouldExpire('sent', new Date('2026-07-27T12:00:00Z'), now)).toBe(true)
  })
  it('does not expire a future active row or a terminal row', () => {
    expect(shouldExpire('ready', new Date('2026-07-28T00:00:00Z'), now)).toBe(false)
    expect(shouldExpire('revoked', new Date('2020-01-01T00:00:00Z'), now)).toBe(false)
  })
})
