// SP-039 Slice 4B — pure view-model for the public claim page.
//
// Maps the inspection outcome + the viewer's auth/ownership context to exactly
// one renderable view. Pure and fully tested; the server component only renders
// what this resolves. The database (M7) remains the authority — a stale view
// here can never mutate anything (the claim RPC re-validates everything).

import type {
  PublicInspectionResult,
  PublicInvitationPreview,
} from './publicClaim'

export type ClaimPageView =
  | { kind: 'invalid'; message: string }
  | { kind: 'expired'; message: string }
  | { kind: 'revoked'; message: string }
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'already_claimed'
      message: string
      /** Authenticated viewer already owns SOME master profile — show the
       *  Studio hint (their own row; no cross-account information). */
      showStudioHint: boolean
    }
  | { kind: 'claimable_anon'; message: string; preview: PublicInvitationPreview }
  | { kind: 'claimable_auth'; message: string; preview: PublicInvitationPreview }

export function resolveClaimPageView(
  inspection: PublicInspectionResult,
  isAuthenticated: boolean,
  viewerOwnsMaster: boolean
): ClaimPageView {
  const { state, message, preview } = inspection
  switch (state) {
    case 'claimable':
      if (preview === null) {
        // Structurally impossible after the wrapper's fail-closed check;
        // degrade to the generic negative rather than render a broken page.
        return { kind: 'invalid', message }
      }
      return isAuthenticated
        ? { kind: 'claimable_auth', message, preview }
        : { kind: 'claimable_anon', message, preview }
    case 'expired':
      return { kind: 'expired', message }
    case 'revoked':
      return { kind: 'revoked', message }
    case 'already_claimed':
      return {
        kind: 'already_claimed',
        message,
        showStudioHint: isAuthenticated && viewerOwnsMaster,
      }
    case 'unavailable':
      return { kind: 'unavailable', message }
    default:
      return { kind: 'invalid', message }
  }
}
