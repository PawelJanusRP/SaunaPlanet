// SP-039 Slice 3B1 — 'use server' export contract for the admin claim actions.
// Same class of guard as lib/master/__tests__/serverActionContract.test.ts: a
// 'use server' module may export ONLY async functions (a type/value re-export
// breaks the Turbopack transform). Types must come from the pure lib.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ACTIONS = readFileSync('app/(main)/admin/claimActions.ts', 'utf8')

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
})
