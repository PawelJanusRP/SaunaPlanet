// SP-039 regression guard (2026-07-27): a `'use server'` module may only
// export async Server Action functions. A type-only re-export
// (`export type { OwnMasterProfileUpdate }`) was NOT erased by the
// Turbopack "use server" transform and crashed the module graph at
// evaluation with `ReferenceError: OwnMasterProfileUpdate is not defined`,
// breaking every /studio/profile save. These assertions pin the contract
// so the same class of regression cannot return silently.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ACTIONS = readFileSync('app/(main)/studio/actions.ts', 'utf8')
const FORM = readFileSync('components/studio/MasterProfileForm.tsx', 'utf8')

describe("studio actions 'use server' export contract", () => {
  it('declares the use server directive', () => {
    expect(ACTIONS.trimStart().startsWith("'use server'")).toBe(true)
  })

  it('every top-level export is an async function (no type/value re-exports)', () => {
    // Only real statement lines — a comment line (trimmed leading `*` or
    // `//`) never starts with `export`, so documentation mentioning the
    // forbidden `export type { ... }` construct does not trip this.
    const exportLines = ACTIONS.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('export'))
    expect(exportLines.length).toBeGreaterThan(0)
    for (const line of exportLines) {
      expect(line).toMatch(/^export\s+async\s+function\b/)
    }
    // the exact construct that caused the runtime ReferenceError must not
    // survive as a statement
    expect(exportLines.some((l) => l.startsWith('export type'))).toBe(false)
    expect(exportLines.some((l) => /^export\s*\{/.test(l))).toBe(false)
  })

  it('imports the update payload type from the pure lib, not re-exported', () => {
    expect(ACTIONS).toContain("from '@/lib/master/profileUpdate'")
  })
})

describe('MasterProfileForm consumes the runtime-safe contract', () => {
  it('imports the action, never a type, from the server-action module', () => {
    // the form may import the action function, but must not pull a type
    // export out of the 'use server' module
    expect(FORM).not.toMatch(/import\s+type[^\n]*from\s+['"]@\/app\/\(main\)\/studio\/actions['"]/)
    expect(FORM).toContain('updateOwnMasterProfile')
  })
})
