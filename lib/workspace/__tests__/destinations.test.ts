// SP-039 Slice 4C2-App — menu entitlement: the Studio destination unlocks
// for ANY non-rejected linked master profile (pending included), while the
// other destinations keep their original conditions.

import { describe, expect, it } from 'vitest'
import {
  AUTHENTICATED_BASE_ACCESS,
  GUEST_ACCESS,
  getVisibleWorkspaceDestinations,
} from '../destinations'
import type { WorkspaceAccess } from '../types'

const base: WorkspaceAccess = {
  isAuthenticated: true,
  role: 'user',
  hasApprovedSaunaMembership: false,
  hasLinkedMasterProfile: false,
  hasMasterStudioAccess: false,
}

const keys = (access: WorkspaceAccess) =>
  getVisibleWorkspaceDestinations(access).map((d) => d.key)

describe('master-studio destination', () => {
  it('is hidden for guests and plain authenticated users', () => {
    expect(keys(GUEST_ACCESS)).not.toContain('master-studio')
    expect(keys(base)).not.toContain('master-studio')
    expect(keys(AUTHENTICATED_BASE_ACCESS)).not.toContain('master-studio')
  })
  it('unlocks for a freshly claimed PENDING owner', () => {
    expect(
      keys({ ...base, hasMasterStudioAccess: true, hasLinkedMasterProfile: false })
    ).toContain('master-studio')
  })
  it('unlocks for approved owners', () => {
    expect(
      keys({ ...base, hasMasterStudioAccess: true, hasLinkedMasterProfile: true })
    ).toContain('master-studio')
  })
  it('an approved-only flag alone no longer drives the link (single source)', () => {
    expect(
      keys({ ...base, hasLinkedMasterProfile: true, hasMasterStudioAccess: false })
    ).not.toContain('master-studio')
  })
})

describe('other destinations unchanged', () => {
  it('profile for any authenticated user; admin by role only', () => {
    expect(keys(base)).toContain('profile')
    expect(keys({ ...base, role: 'moderator' })).toContain('admin')
    expect(keys(base)).not.toContain('admin')
    expect(keys({ ...base, hasApprovedSaunaMembership: true })).toContain(
      'owner-workspace'
    )
  })
})
