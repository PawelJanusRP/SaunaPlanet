// SP-039 Slice 3B1 — 'use server' export contract for the admin claim actions.
// Same class of guard as lib/master/__tests__/serverActionContract.test.ts: a
// 'use server' module may export ONLY async functions (a type/value re-export
// breaks the Turbopack transform). Types must come from the pure lib.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ACTIONS = readFileSync('app/(main)/admin/claimActions.ts', 'utf8')

/** All .ts/.tsx files under a directory (recursive). */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

describe("claimActions 'use server' export contract", () => {
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

  it('imports its types from the pure lib, not re-exported', () => {
    expect(ACTIONS).toContain("from '@/lib/claim/types'")
    expect(ACTIONS).toContain("from '@/lib/claim/errors'")
  })

  it('never logs the raw token (no console.* on RPC data)', () => {
    expect(ACTIONS).not.toMatch(/console\.(log|info|warn|error|debug)/)
  })

  it('maps errors to a safe code and never surfaces raw PG errors', () => {
    expect(ACTIONS).toContain("code: 'unexpected_error'")
    // the raw supabase error object is never returned to the caller
    expect(ACTIONS).not.toMatch(/return\s+\{[^}]*\berror\b[^}]*\}/)
  })

  it('has no runtime pgcrypto fallback: does not import the token helper', () => {
    // Variant B must be a separate reviewed change, never an auto-active path.
    expect(ACTIONS).not.toContain('@/lib/claim/token')
  })
})

describe('privileged token RPC browser boundary', () => {
  const PRIVILEGED_RPCS = [
    'admin_create_master_claim_invitation',
    'admin_regenerate_master_claim_invitation',
    'admin_revoke_master_claim_invitation',
    'admin_mark_master_claim_sent',
  ]
  // Every source file under app/ and components/ (UI + server layer).
  const files = [...walk('app'), ...walk('components')]

  it('the privileged RPCs are invoked ONLY from the server-action module', () => {
    const allowed = join('app', '(main)', 'admin', 'claimActions.ts')
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const rpc of PRIVILEGED_RPCS) {
        if (src.includes(rpc)) {
          // normalize separators for cross-platform comparison
          expect(file.replace(/\\/g, '/')).toBe(allowed.replace(/\\/g, '/'))
        }
      }
    }
  })

  it('no client component references the privileged token RPCs', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const isClient = src.trimStart().startsWith("'use client'")
      if (!isClient) continue
      for (const rpc of PRIVILEGED_RPCS) {
        expect(src.includes(rpc), `${file} is a client component`).toBe(false)
      }
    }
  })
})
