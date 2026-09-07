// SP-039P0 — Studio-destination resilience: the client access-snapshot
// state machine. A transient loader failure must never erase confirmed
// Studio access for the same user, and must never INVENT access either.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACCESS_LOAD_MAX_AUTO_RETRIES,
  GUEST_ACCESS_STATE,
  accessLoadFailed,
  accessLoadStarted,
  accessLoadSucceeded,
  accessRetryDelayMs,
  accessSignedOut,
  resolveVisibleAccess,
  shouldAutoRetryAccessLoad,
  type AccessLoadState,
} from '../accessState'
import {
  AUTHENTICATED_BASE_ACCESS,
  GUEST_ACCESS,
  getVisibleWorkspaceDestinations,
} from '../destinations'
import type { WorkspaceAccess } from '../types'

const USER_A = 'user-a'
const USER_B = 'user-b'

function snapshot(overrides: Partial<WorkspaceAccess> = {}): WorkspaceAccess {
  return {
    isAuthenticated: true,
    role: 'user',
    hasApprovedSaunaMembership: false,
    hasLinkedMasterProfile: false,
    hasMasterStudioAccess: false,
    ...overrides,
  }
}

const PENDING_OWNER = snapshot({ hasMasterStudioAccess: true })
const APPROVED_OWNER = snapshot({
  hasLinkedMasterProfile: true,
  hasMasterStudioAccess: true,
})

function confirmed(userId: string, access: WorkspaceAccess): AccessLoadState {
  return accessLoadSucceeded(accessLoadStarted(GUEST_ACCESS_STATE, userId), userId, access)
}

function studioVisible(state: AccessLoadState): boolean {
  return getVisibleWorkspaceDestinations(resolveVisibleAccess(state)).some(
    (d) => d.key === 'master-studio'
  )
}

describe('confirmed access', () => {
  it('a pending claimed owner gets the Studio destination', () => {
    expect(studioVisible(confirmed(USER_A, PENDING_OWNER))).toBe(true)
  })
  it('an approved owner gets the Studio destination', () => {
    expect(studioVisible(confirmed(USER_A, APPROVED_OWNER))).toBe(true)
  })
})

describe('initial loader failure (no confirmed snapshot yet)', () => {
  it('does not invent Studio access — falls back to base authenticated access', () => {
    let state = accessLoadStarted(GUEST_ACCESS_STATE, USER_A)
    state = accessLoadFailed(state, USER_A)
    expect(state.phase).toBe('error')
    expect(resolveVisibleAccess(state)).toEqual(AUTHENTICATED_BASE_ACCESS)
    expect(studioVisible(state)).toBe(false)
  })
})

describe('transient failure after confirmed access (same user)', () => {
  it('keeps the confirmed snapshot through a reload and a failure', () => {
    let state = confirmed(USER_A, APPROVED_OWNER)
    state = accessLoadStarted(state, USER_A)
    expect(resolveVisibleAccess(state)).toEqual(APPROVED_OWNER)
    state = accessLoadFailed(state, USER_A)
    expect(state.phase).toBe('error')
    expect(resolveVisibleAccess(state)).toEqual(APPROVED_OWNER)
    expect(studioVisible(state)).toBe(true)
  })
  it('keeps a pending owner Studio-visible through repeated failures', () => {
    let state = confirmed(USER_A, PENDING_OWNER)
    for (let i = 0; i < 3; i++) {
      state = accessLoadStarted(state, USER_A)
      state = accessLoadFailed(state, USER_A)
    }
    expect(studioVisible(state)).toBe(true)
  })
  it('role survives the transient failure too', () => {
    let state = confirmed(USER_A, snapshot({ role: 'moderator' }))
    state = accessLoadStarted(state, USER_A)
    state = accessLoadFailed(state, USER_A)
    expect(resolveVisibleAccess(state).role).toBe('moderator')
  })
})

describe('confirmed negative result', () => {
  it('a successful no-profile load REMOVES previously confirmed access', () => {
    let state = confirmed(USER_A, APPROVED_OWNER)
    state = accessLoadStarted(state, USER_A)
    state = accessLoadSucceeded(state, USER_A, snapshot())
    expect(state.phase).toBe('confirmed')
    expect(studioVisible(state)).toBe(false)
  })
})

describe('retry recovery', () => {
  it('a successful retry after failure restores the confirmed phase', () => {
    let state = confirmed(USER_A, APPROVED_OWNER)
    state = accessLoadStarted(state, USER_A)
    state = accessLoadFailed(state, USER_A)
    state = accessLoadStarted(state, USER_A)
    state = accessLoadSucceeded(state, USER_A, APPROVED_OWNER)
    expect(state).toEqual({ phase: 'confirmed', userId: USER_A, access: APPROVED_OWNER })
  })
  it('auto-retry is bounded — no infinite loop', () => {
    let state = accessLoadStarted(GUEST_ACCESS_STATE, USER_A)
    state = accessLoadFailed(state, USER_A)
    expect(shouldAutoRetryAccessLoad(state, USER_A, 0)).toBe(true)
    expect(
      shouldAutoRetryAccessLoad(state, USER_A, ACCESS_LOAD_MAX_AUTO_RETRIES)
    ).toBe(false)
    expect(accessRetryDelayMs(0)).toBeLessThan(accessRetryDelayMs(1))
  })
  it('auto-retry never fires outside the error phase or for another user', () => {
    const ok = confirmed(USER_A, APPROVED_OWNER)
    expect(shouldAutoRetryAccessLoad(ok, USER_A, 0)).toBe(false)
    let state = accessLoadStarted(GUEST_ACCESS_STATE, USER_A)
    state = accessLoadFailed(state, USER_A)
    expect(shouldAutoRetryAccessLoad(state, USER_B, 0)).toBe(false)
  })
})

describe('logout', () => {
  it('sign-out clears retained access entirely', () => {
    let state: AccessLoadState = confirmed(USER_A, APPROVED_OWNER)
    state = accessSignedOut()
    expect(state).toEqual(GUEST_ACCESS_STATE)
    expect(resolveVisibleAccess(state)).toEqual(GUEST_ACCESS)
    expect(studioVisible(state)).toBe(false)
  })
  it('a stale async result arriving after sign-out is dropped', () => {
    let state: AccessLoadState = accessLoadStarted(GUEST_ACCESS_STATE, USER_A)
    state = accessSignedOut()
    expect(accessLoadSucceeded(state, USER_A, APPROVED_OWNER)).toEqual(GUEST_ACCESS_STATE)
    expect(accessLoadFailed(state, USER_A)).toEqual(GUEST_ACCESS_STATE)
  })
})

describe('account switch', () => {
  it('switching accounts clears the previous user retained access', () => {
    let state = confirmed(USER_A, APPROVED_OWNER)
    state = accessLoadStarted(state, USER_B)
    // No confirmed snapshot exists for USER_B — only base access shows.
    expect(resolveVisibleAccess(state)).toEqual(AUTHENTICATED_BASE_ACCESS)
    state = accessLoadFailed(state, USER_B)
    expect(studioVisible(state)).toBe(false)
  })
  it('a stale result for the previous account never overwrites the new one', () => {
    let state = confirmed(USER_A, snapshot())
    state = accessLoadStarted(state, USER_B)
    const afterStale = accessLoadSucceeded(state, USER_A, APPROVED_OWNER)
    expect(afterStale).toBe(state)
    expect(studioVisible(afterStale)).toBe(false)
  })
})

describe('server-side /studio gate stays independent', () => {
  const studioPage = readFileSync('app/(main)/studio/page.tsx', 'utf8')
  const provider = readFileSync('components/AuthProvider.tsx', 'utf8')

  it('the studio page authorizes via the server client and gate, not the client snapshot', () => {
    expect(studioPage).toContain("from '@/lib/supabase/server'")
    expect(studioPage).toContain('resolveStudioGate')
    expect(studioPage).not.toContain('AuthProvider')
    expect(studioPage).not.toContain('useAuth')
  })
  it('the client snapshot is never persisted and never used as authorization', () => {
    expect(provider).not.toMatch(/localStorage|sessionStorage/)
    expect(provider).toContain("from '@/lib/workspace/accessState'")
  })
})
