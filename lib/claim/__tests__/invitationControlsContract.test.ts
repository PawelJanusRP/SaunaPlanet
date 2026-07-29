// SP-039 Slice 3B3 — secret-handling and boundary contract tests for the
// invitation controls (source-level guards, same class as the other contract
// suites: they pin the properties the security review verified).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ACTIONS_PATH = join('app', '(main)', 'admin', 'masters', 'pilot', 'actions.ts')
const CONTROLS_PATH = join('components', 'admin', 'InvitationControls.tsx')
const LIB_PATH = join('lib', 'claim', 'invitationControls.ts')
const LINK_PATH = join('lib', 'claim', 'claimLink.ts')

const ACTIONS = readFileSync(ACTIONS_PATH, 'utf8')
const CONTROLS = readFileSync(CONTROLS_PATH, 'utf8')
const LIB = readFileSync(LIB_PATH, 'utf8')
const LINK = readFileSync(LINK_PATH, 'utf8')

describe('one-time secret never persisted or logged', () => {
  it('the client component uses no browser persistence for the secret', () => {
    for (const banned of [
      'localStorage',
      'sessionStorage',
      'document.cookie',
      'indexedDB',
      'history.pushState',
      'history.replaceState',
    ]) {
      expect(CONTROLS.includes(banned), banned).toBe(false)
    }
  })

  it('no console output or stringified debug dumps anywhere on the secret path', () => {
    for (const src of [ACTIONS, CONTROLS, LIB, LINK]) {
      expect(src).not.toMatch(/console\.(log|info|warn|error|debug)/)
      expect(src).not.toContain('JSON.stringify')
    }
  })

  it('the secret lives in plain React state only (no effects syncing it out)', () => {
    expect(CONTROLS).toContain('useState<OneTimeSecret | null>(null)')
    expect(CONTROLS).toContain('setSecret(null)')
    // no useEffect at all — nothing can mirror the secret elsewhere
    expect(CONTROLS).not.toContain('useEffect')
  })

  it('the secret is never placed in a URL or navigation call', () => {
    expect(CONTROLS).not.toMatch(/router\.push/)
    expect(CONTROLS).not.toMatch(/\?.*claimUrl/)
    // refresh (server-state reload) is the only navigation used
    expect(CONTROLS).toContain('router.refresh()')
  })

  it('no raw-token or hash field names leak into the UI layer', () => {
    for (const src of [CONTROLS]) {
      expect(src.includes('token_hash')).toBe(false)
      expect(src.includes('raw_token')).toBe(false)
      expect(src.includes('rawToken')).toBe(false)
    }
  })
})

describe('secret confined to the dedicated result type', () => {
  it('only generate/regenerate return the secret result type', () => {
    expect(ACTIONS).toMatch(
      /generateMasterInvitation[\s\S]{0,200}Promise<InvitationSecretResult>/
    )
    expect(ACTIONS).toMatch(
      /regenerateMasterInvitation[\s\S]{0,200}Promise<InvitationSecretResult>/
    )
    expect(ACTIONS).toMatch(
      /markMasterInvitationSent[\s\S]{0,200}Promise<InvitationControlResult>/
    )
    expect(ACTIONS).toMatch(
      /revokeMasterInvitation[\s\S]{0,200}Promise<InvitationControlResult>/
    )
  })

  it('the non-secret result type structurally has no secret field', () => {
    const start = LIB.indexOf('export type InvitationControlResult')
    expect(start).toBeGreaterThan(-1)
    const block = LIB.slice(start)
    expect(block).not.toContain('claimUrl')
    expect(block).not.toContain('rawToken')
  })

  it('grant parsing is fail-closed and mapped to payload_malformed', () => {
    expect(ACTIONS.match(/parseTokenGrant\(result\.data\)/g)).toHaveLength(2)
    expect(ACTIONS.match(/controlFailure\('payload_malformed'\)/g)?.length).toBeGreaterThanOrEqual(
      4
    )
  })
})

describe('mutation boundaries', () => {
  it('client components never invoke the claimActions wrappers directly', () => {
    for (const wrapper of [
      'createClaimInvitation',
      'markClaimInvitationSent',
      'revokeClaimInvitation',
      'regenerateClaimInvitation',
    ]) {
      expect(CONTROLS.includes(wrapper), wrapper).toBe(false)
    }
    expect(CONTROLS).toContain("from '@/app/(main)/admin/masters/pilot/actions'")
  })

  it('every invitation mutation re-validates authorization and revalidates routes', () => {
    // four invitation actions + two 3B2 profile actions
    expect(ACTIONS.match(/await requireModerator\(\)/g)).toHaveLength(6)
    // one definition + four call sites
    expect(ACTIONS.match(/revalidatePilotSurfaces\(\)/g)).toHaveLength(5)
  })

  it('generate/regenerate re-read the fresh profile state before the RPC', () => {
    expect(ACTIONS.match(/await readInvitationGateState\(masterId\)/g)).toHaveLength(2)
  })

  it('no native confirm dialogs for the destructive actions', () => {
    expect(CONTROLS).not.toMatch(/\bconfirm\(/)
    expect(CONTROLS).not.toContain('window.confirm')
  })
})

describe('end-user claim route is NOT implemented in 3B3', () => {
  it('no /claim route directory exists', () => {
    expect(existsSync(join('app', 'claim'))).toBe(false)
    expect(existsSync(join('app', '(main)', 'claim'))).toBe(false)
  })

  it('the route prefix is only a link-building contract', () => {
    expect(LINK).toContain("export const CLAIM_ROUTE_PREFIX = '/claim/master/'")
  })
})

describe('claim URL base comes from configuration, never request headers', () => {
  it('resolvePublicBaseUrl reads NEXT_PUBLIC_SITE_URL with the established fallback', () => {
    expect(LINK).toContain('NEXT_PUBLIC_SITE_URL')
    expect(LINK).toContain("'https://sauna-planet.vercel.app'")
    for (const banned of ['headers()', 'x-forwarded-host', 'request.headers', 'next/headers']) {
      expect(LINK.toLowerCase().includes(banned.toLowerCase()), banned).toBe(false)
    }
  })
})
