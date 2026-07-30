// SP-039 Slice 4B — source-level security contract for the public claim page,
// its client components, the auth callback, and the route headers.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  join('app', 'claim', 'master', '[token]', 'page.tsx'),
  'utf8'
)
const authPanel = readFileSync(
  join('components', 'claim', 'ClaimAuthPanel.tsx'),
  'utf8'
)
const actionPanel = readFileSync(
  join('components', 'claim', 'ClaimActionPanel.tsx'),
  'utf8'
)
const callback = readFileSync(
  join('app', '(main)', 'auth', 'callback', 'route.ts'),
  'utf8'
)
const nextConfig = readFileSync('next.config.ts', 'utf8')

describe('claim page — metadata and token hygiene', () => {
  it('metadata is STATIC (token structurally cannot reach title/OG/canonical)', () => {
    expect(page).toContain('export const metadata')
    expect(page).not.toContain('generateMetadata')
    expect(page).not.toContain('openGraph')
    expect(page).not.toContain('canonical')
  })
  it('sets no-referrer and noindex via metadata', () => {
    expect(page).toContain("referrer: 'no-referrer'")
    expect(page).toContain('index: false')
  })
  it('validates the token shape BEFORE the inspection boundary', () => {
    const gate = page.indexOf('isValidClaimTokenShape(token)')
    const rpc = page.indexOf('inspectMasterClaimInvitation(token)')
    expect(gate).toBeGreaterThan(-1)
    expect(rpc).toBeGreaterThan(gate)
  })
  it('reads only its own master row and never writes', () => {
    expect(page).toContain("eq('user_id', user.id)")
    expect(page).not.toContain('.insert(')
    expect(page).not.toContain('.update(')
    expect(page).not.toContain('.delete(')
    expect(page).not.toContain('.rpc(')
  })
  it('never logs and never interpolates the token into any URL or text', () => {
    for (const src of [page, authPanel, actionPanel]) {
      expect(src).not.toContain('console.')
      expect(src).not.toContain('${token')
      expect(src).not.toContain('localStorage')
      expect(src).not.toContain('sessionStorage')
      expect(src).not.toContain('document.cookie')
    }
    // the token appears ONLY as the ClaimActionPanel prop and RPC argument
    expect(page).toContain('<ClaimActionPanel token={token}')
  })
  it('renders no moderator-only or secret fields', () => {
    for (const banned of [
      'token_prefix',
      'invitation_id',
      'admin_note',
      'delivery_channel',
      'delivery_target_hint',
      'created_by',
      'claimed_by',
      'revoked',
    ]) {
      expect(page.includes(banned), `page must not reference ${banned}`).toBe(
        // 'revoked' appears only as a VIEW KIND from the pure model
        banned === 'revoked'
      )
    }
  })
})

/** Strip line comments so hygiene assertions test code, not documentation. */
const stripLineComments = (src: string) =>
  src
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

describe('inline auth panel — no token, no redirects, default callback', () => {
  it('receives no token and builds no redirect state', () => {
    expect(authPanel).toContain('export default function ClaimAuthPanel()')
    expect(stripLineComments(authPanel)).not.toContain('token')
    expect(authPanel).not.toContain('next=')
    expect(authPanel).not.toContain('router.push')
  })
  it('registration uses the DEFAULT auth callback only', () => {
    expect(authPanel).toContain('/auth/callback')
    expect(authPanel).not.toContain('/claim/')
  })
  it('uses only auth methods — no table or RPC access', () => {
    expect(authPanel).not.toContain('.from(')
    expect(authPanel).not.toContain('.rpc(')
    expect(authPanel).toContain('signInWithPassword')
    expect(authPanel).toContain('signUp')
  })
})

describe('claim action panel — explicit action, server boundary only', () => {
  it('claims ONLY via the approved server action on an explicit click', () => {
    expect(actionPanel).toContain('claimMasterProfile(token)')
    expect(actionPanel).not.toContain('.from(')
    expect(actionPanel).not.toContain('.rpc(')
    expect(actionPanel).not.toContain('useEffect')
  })
  it('guards against double-submit and hides the action on terminal results', () => {
    expect(actionPanel).toContain('if (pending) return')
    expect(actionPanel).toContain('TERMINAL_PUBLIC_CLAIM_CODES')
  })
  it('the success destination is the token-free Studio route', () => {
    expect(actionPanel).toContain('href="/studio"')
  })
  it('renders only mapped Polish messages, never raw error objects', () => {
    expect(actionPanel).toContain('{result.message}')
    expect(actionPanel).not.toContain('error.message')
  })
})

describe('auth callback — allow-listed return only', () => {
  it('sanitizes the next parameter through the shared allow-list', () => {
    expect(callback).toContain('sanitizeReturnPath')
    expect(callback).not.toContain("searchParams.get('next') ?? '/'")
  })
})

describe('route headers — next.config', () => {
  it('ships Referrer-Policy: no-referrer and noindex for the /claim subtree', () => {
    expect(nextConfig).toContain('"/claim/:path*"')
    expect(nextConfig).toContain('"Referrer-Policy"')
    expect(nextConfig).toContain('"no-referrer"')
    expect(nextConfig).toContain('"X-Robots-Tag"')
  })
})
