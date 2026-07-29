// SP-039 Slice 3B3 fix — behavioral proof that a missing/invalid
// CLAIM_PUBLIC_ORIGIN fails closed BEFORE any create/regenerate RPC call.
// This matters because those RPCs return the raw token exactly once: a config
// error discovered after the RPC would mint an active invitation whose only
// displayable link is lost.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'moderator-1' } } }) },
    // minimal chain for the fresh-gate profile read in the valid-origin case
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '33333333-3333-3333-3333-333333333333',
              user_id: null,
              origin: 'admin_prepared',
              status: 'pending',
              name: 'Jan Kowalski',
              city: 'Poznań',
              bio: 'Doświadczony saunamistrz.',
            },
            error: null,
          }),
        }),
      }),
    })),
  })),
  getCurrentUserRole: vi.fn(async () => 'admin'),
}))

vi.mock('@/app/(main)/admin/claimActions', () => ({
  createClaimInvitation: vi.fn(),
  regenerateClaimInvitation: vi.fn(),
  markClaimInvitationSent: vi.fn(),
  revokeClaimInvitation: vi.fn(),
  listClaimInvitations: vi.fn(async () => ({ ok: false, code: 'unexpected_error', message: 'x' })),
}))

import {
  createClaimInvitation,
  listClaimInvitations,
  regenerateClaimInvitation,
} from '@/app/(main)/admin/claimActions'
import {
  generateMasterInvitation,
  regenerateMasterInvitation,
} from '@/app/(main)/admin/masters/pilot/actions'

const MASTER_ID = '33333333-3333-3333-3333-333333333333'
const ORIGINAL_ORIGIN = process.env.CLAIM_PUBLIC_ORIGIN

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CLAIM_PUBLIC_ORIGIN
})

afterEach(() => {
  if (ORIGINAL_ORIGIN === undefined) delete process.env.CLAIM_PUBLIC_ORIGIN
  else process.env.CLAIM_PUBLIC_ORIGIN = ORIGINAL_ORIGIN
})

describe('generate: origin resolved before ANY read or RPC', () => {
  it('missing CLAIM_PUBLIC_ORIGIN -> claim_origin_not_configured, no RPC, no reads', async () => {
    const result = await generateMasterInvitation(MASTER_ID, 14, null)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('claim_origin_not_configured')
    expect(result.message).toContain('Zaproszenie nie zostało utworzone')
    expect(createClaimInvitation).not.toHaveBeenCalled()
    // origin resolves BEFORE the eligibility/current-invitation read
    expect(listClaimInvitations).not.toHaveBeenCalled()
    // the failure carries no secret of any shape
    expect('claimUrl' in result).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/token|claim\/master/i)
  })

  it('invalid CLAIM_PUBLIC_ORIGIN -> claim_origin_invalid, no RPC', async () => {
    process.env.CLAIM_PUBLIC_ORIGIN = 'http://insecure.example.com'
    const result = await generateMasterInvitation(MASTER_ID, 14, null)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('claim_origin_invalid')
    expect(createClaimInvitation).not.toHaveBeenCalled()
    expect('claimUrl' in result).toBe(false)
    // the env value never leaks into the result
    expect(JSON.stringify(result)).not.toContain('insecure.example.com')
  })

  it('with a valid origin the flow proceeds past origin resolution', async () => {
    process.env.CLAIM_PUBLIC_ORIGIN = 'https://preview.example.com'
    const result = await generateMasterInvitation(MASTER_ID, 14, null)
    // the mocked invitation-list read fails -> unexpected_error, which proves
    // origin resolution passed and the gate read WAS attempted
    expect(listClaimInvitations).toHaveBeenCalledTimes(1)
    expect(result.code).toBe('unexpected_error')
    expect(createClaimInvitation).not.toHaveBeenCalled()
  })
})

describe('regenerate: same fail-closed ordering', () => {
  it('missing CLAIM_PUBLIC_ORIGIN -> claim_origin_not_configured, no RPC, no reads', async () => {
    const result = await regenerateMasterInvitation(MASTER_ID, 'link wyciekł', 14)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('claim_origin_not_configured')
    expect(regenerateClaimInvitation).not.toHaveBeenCalled()
    expect(listClaimInvitations).not.toHaveBeenCalled()
    expect('claimUrl' in result).toBe(false)
  })

  it('invalid CLAIM_PUBLIC_ORIGIN -> claim_origin_invalid, no RPC', async () => {
    process.env.CLAIM_PUBLIC_ORIGIN = 'https://host.example.com/some/path'
    const result = await regenerateMasterInvitation(MASTER_ID, 'link wyciekł', 14)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('claim_origin_invalid')
    expect(regenerateClaimInvitation).not.toHaveBeenCalled()
    expect('claimUrl' in result).toBe(false)
  })

  it('input validation still precedes everything (bad reason, no env touch needed)', async () => {
    const result = await regenerateMasterInvitation(MASTER_ID, '   ', 14)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('invalid_input')
    expect(regenerateClaimInvitation).not.toHaveBeenCalled()
  })
})
