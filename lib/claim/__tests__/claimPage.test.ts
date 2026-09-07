// SP-039 Slice 4B — pure claim-page view-model tests.

import { describe, expect, it } from 'vitest'
import { resolveClaimPageView } from '../claimPage'
import {
  PUBLIC_INSPECTION_MESSAGES_PL,
  type PublicInspectionResult,
  type PublicInvitationPreview,
} from '../publicClaim'

const preview: PublicInvitationPreview = {
  state: 'claimable',
  masterName: 'Jan Para',
  city: 'Poznań',
  avatarUrl: null,
  bio: 'O mnie',
  expiresAt: '2026-08-13T10:00:00Z',
  authRequired: true,
}

const inspection = (
  state: PublicInspectionResult['state'],
  p: PublicInvitationPreview | null = null
): PublicInspectionResult => ({
  state,
  message: PUBLIC_INSPECTION_MESSAGES_PL[state],
  preview: p,
})

describe('resolveClaimPageView', () => {
  it('claimable + anonymous -> inline-auth view with the preview', () => {
    const v = resolveClaimPageView(inspection('claimable', preview), false, false)
    expect(v.kind).toBe('claimable_anon')
    if (v.kind === 'claimable_anon') expect(v.preview.masterName).toBe('Jan Para')
  })
  it('claimable + authenticated -> explicit claim view', () => {
    const v = resolveClaimPageView(inspection('claimable', preview), true, false)
    expect(v.kind).toBe('claimable_auth')
  })
  it('claimable WITHOUT a preview degrades to the generic negative', () => {
    expect(resolveClaimPageView(inspection('claimable', null), true, false).kind).toBe(
      'invalid'
    )
  })
  it('terminal states map one-to-one', () => {
    expect(
      resolveClaimPageView(inspection('invalid_or_unknown'), false, false).kind
    ).toBe('invalid')
    expect(resolveClaimPageView(inspection('expired'), false, false).kind).toBe(
      'expired'
    )
    expect(resolveClaimPageView(inspection('revoked'), false, false).kind).toBe(
      'revoked'
    )
    expect(resolveClaimPageView(inspection('unavailable'), false, false).kind).toBe(
      'unavailable'
    )
  })
  it('already_claimed shows the Studio hint ONLY to an authenticated owner', () => {
    const anon = resolveClaimPageView(inspection('already_claimed'), false, false)
    const authNoMaster = resolveClaimPageView(inspection('already_claimed'), true, false)
    const authOwner = resolveClaimPageView(inspection('already_claimed'), true, true)
    expect(anon).toMatchObject({ kind: 'already_claimed', showStudioHint: false })
    expect(authNoMaster).toMatchObject({ kind: 'already_claimed', showStudioHint: false })
    expect(authOwner).toMatchObject({ kind: 'already_claimed', showStudioHint: true })
  })
  it('every view carries the Polish message for its state', () => {
    const v = resolveClaimPageView(inspection('expired'), false, false)
    expect(v.message).toBe(PUBLIC_INSPECTION_MESSAGES_PL.expired)
  })
  it('the retryable unavailable message differs from the terminal negative', () => {
    expect(PUBLIC_INSPECTION_MESSAGES_PL.unavailable).not.toBe(
      PUBLIC_INSPECTION_MESSAGES_PL.invalid_or_unknown
    )
  })
})
