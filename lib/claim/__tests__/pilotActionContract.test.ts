// SP-039 Slice 3B2 — contract tests for the pilot server-action module and
// the pilot UI security boundaries (same class of guards as
// serverActionContract.test.ts / masterProfileSql contract tests).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ACTIONS_PATH = join('app', '(main)', 'admin', 'masters', 'pilot', 'actions.ts')
const ACTIONS = readFileSync(ACTIONS_PATH, 'utf8')

const PILOT_UI_FILES = [
  join('app', '(main)', 'admin', 'masters', 'pilot', 'page.tsx'),
  join('app', '(main)', 'admin', 'masters', 'pilot', 'new', 'page.tsx'),
  join('app', '(main)', 'admin', 'masters', 'pilot', '[id]', 'page.tsx'),
  join('components', 'admin', 'PilotProfileForm.tsx'),
]

describe("pilot actions 'use server' export contract", () => {
  it('declares the use server directive', () => {
    expect(ACTIONS.trimStart().startsWith("'use server'")).toBe(true)
  })

  it('every top-level export is an async function (no type/value re-exports)', () => {
    const exportLines = ACTIONS.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('export'))
    expect(exportLines.length).toBeGreaterThan(0)
    for (const line of exportLines) {
      expect(line).toMatch(/^export\s+async\s+function\b/)
    }
    expect(exportLines.some((l) => l.startsWith('export type'))).toBe(false)
    expect(exportLines.some((l) => /^export\s*\{/.test(l))).toBe(false)
  })

  it('imports its types from the pure libs, never re-exported', () => {
    expect(ACTIONS).toContain("from '@/lib/claim/pilot'")
    expect(ACTIONS).toContain("from '@/lib/master/profileUpdate'")
  })

  it('never logs (stable codes only, no console output)', () => {
    expect(ACTIONS).not.toMatch(/console\.(log|info|warn|error|debug)/)
  })

  it('never surfaces a raw PostgreSQL error object or message', () => {
    // failures map to pilotResult(...) codes; error.message is only INSPECTED
    // (slug unique violation), never returned
    expect(ACTIONS).not.toMatch(/message:\s*error\.message/)
    expect(ACTIONS).not.toMatch(/return\s+\{[^}]*\berror\b[^}]*\}/)
  })

  it('checks moderator authorization before every write', () => {
    expect(ACTIONS).toContain('requireModerator')
    expect(ACTIONS.match(/await requireModerator\(\)/g)?.length).toBe(2)
  })

  it('creates with the pilot invariants pinned server-side', () => {
    const insertStart = ACTIONS.indexOf('.insert({')
    expect(insertStart).toBeGreaterThan(-1)
    const insertBlock = ACTIONS.slice(insertStart, ACTIONS.indexOf('})', insertStart))
    expect(insertBlock).toContain("origin: 'admin_prepared'")
    expect(insertBlock).toContain("status: 'pending'")
    // user_id is never set by the pilot actions (stays NULL until Slice 4 claim)
    expect(insertBlock).not.toContain('user_id')
  })

  it('update repeats the editability conditions as WHERE clauses (concurrency)', () => {
    expect(ACTIONS).toContain(".is('user_id', null)")
    expect(ACTIONS).toContain(".eq('origin', 'admin_prepared')")
    expect(ACTIONS).toContain(".eq('status', 'pending')")
    // zero matched rows -> conflict, never a silent overwrite
    expect(ACTIONS).toContain("pilotResult('conflict')")
  })

  it('uses explicit selected columns and no service-role client', () => {
    expect(ACTIONS).toContain("select('id, user_id, origin, status')")
    expect(ACTIONS).not.toMatch(/select\('\*'\)/)
    expect(ACTIONS).not.toMatch(/service_role|SERVICE_ROLE/)
  })

  it('never touches the claim tables directly (RPC boundary stays intact)', () => {
    expect(ACTIONS).not.toContain('master_claim_invitations')
    expect(ACTIONS).not.toContain('master_claim_events')
  })
})

describe('pilot UI security boundaries', () => {
  it('no pilot UI file references token_hash or raw_token', () => {
    for (const file of [ACTIONS_PATH, ...PILOT_UI_FILES]) {
      const src = readFileSync(file, 'utf8')
      expect(src.includes('token_hash'), file).toBe(false)
      expect(src.includes('raw_token'), file).toBe(false)
    }
  })

  it('no pilot UI file queries the claim tables directly', () => {
    for (const file of PILOT_UI_FILES) {
      const src = readFileSync(file, 'utf8')
      expect(src.includes("from('master_claim_invitations')"), file).toBe(false)
      expect(src.includes("from('master_claim_events')"), file).toBe(false)
    }
  })

  it('every pilot page enforces the moderator gate server-side', () => {
    const pages = PILOT_UI_FILES.filter((f) => f.endsWith('page.tsx'))
    for (const file of pages) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).toContain('getCurrentUserRole')
      expect(src, file).toMatch(/role !== 'admin' && role !== 'moderator'/)
      expect(src, file).toContain("redirect('/auth/login')")
    }
  })

  it('the pilot list queries ONLY admin_prepared profiles (cohort boundary)', () => {
    const src = readFileSync(PILOT_UI_FILES[0], 'utf8')
    expect(src).toContain(".eq('origin', 'admin_prepared')")
  })

  it('3B2 renders no invitation mutation controls (create/send/revoke/regenerate)', () => {
    for (const file of PILOT_UI_FILES) {
      const src = readFileSync(file, 'utf8')
      expect(src.includes('createClaimInvitation'), file).toBe(false)
      expect(src.includes('markClaimInvitationSent'), file).toBe(false)
      expect(src.includes('revokeClaimInvitation'), file).toBe(false)
      expect(src.includes('regenerateClaimInvitation'), file).toBe(false)
    }
  })
})
