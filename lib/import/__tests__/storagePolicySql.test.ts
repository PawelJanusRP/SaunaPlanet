// SP-038 Slice 3C — SQL contract test for the imported-storage policy.
//
// Regression guard for the name-binding incident (2026-07-25): inside an
// RLS policy's EXISTS subquery an UNQUALIFIED `name` binds to the inner
// relation (public.saunas.name), not to storage.objects.name. These
// assertions pin the committed migration text so the defect cannot be
// reintroduced silently. The hotfix ROLLBACK intentionally contains the
// defective form (it restores the pre-hotfix state) and is asserted
// separately.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(`supabase/${name}`, 'utf8')

/** The imported_own CREATE POLICY block of a file (first match). */
function importedPolicyBlock(sql: string): string {
  const start = sql.indexOf('create policy "sauna_images_insert_imported_own"')
  expect(start).toBeGreaterThan(-1)
  const end = sql.indexOf(';', start)
  return sql.slice(start, end)
}

const QUALIFIED = 'storage.foldername(storage.objects.name)'

function expectCorrectedPolicy(block: string) {
  // Fully qualified target-table references — twice (prefix arm + subquery).
  expect(block.split(QUALIFIED)).toHaveLength(3)
  // No ambiguous unqualified foldername(name) anywhere in the block.
  expect(block).not.toMatch(/foldername\(\s*name\s*\)/)
  expect(block).not.toContain('foldername(s.name)')
  // Authorization semantics stay intact.
  expect(block).toContain("s.status = 'pending'")
  expect(block).toContain('s.created_by = auth.uid()')
  expect(block).toContain('s.id::text')
  expect(block).toContain('public.is_platform_moderator()')
  expect(block).toContain("(storage.foldername(storage.objects.name))[1] = 'imported'")
  expect(block).toContain("bucket_id = 'sauna-images'")
  expect(block).toContain('for insert to authenticated')
}

describe('slice 3C storage policy SQL contract', () => {
  it('original migration: imported policy is fully qualified with intact semantics', () => {
    expectCorrectedPolicy(importedPolicyBlock(read('2026-07-25_sp038c_social_links.sql')))
  })

  it('original migration: normal upload policy excludes exactly the imported prefix', () => {
    const sql = read('2026-07-25_sp038c_social_links.sql')
    expect(sql).toContain(
      "coalesce((storage.foldername(storage.objects.name))[1], '') <> 'imported'"
    )
  })

  it('forward hotfix: recreates the policy fully qualified with intact semantics', () => {
    const sql = read('2026-07-25_sp038c_fix_imported_storage_policy.sql')
    expectCorrectedPolicy(importedPolicyBlock(sql))
    // Guard asserts the expected defective pre-state before dropping.
    expect(sql).toContain("position('storage.foldername(s.name)' in v_check) = 0")
    expect(sql).toContain('HOTFIX GUARD')
  })

  it('hotfix rollback: intentionally defective, loudly labeled, scope-limited', () => {
    const sql = read('2026-07-25_sp038c_fix_rollback.sql')
    const block = importedPolicyBlock(sql)
    // The defective unqualified form IS the point of this file:
    expect(block).toMatch(/foldername\(name\)/)
    expect(block).not.toContain(QUALIFIED)
    // ...and it must say so, unmissably.
    expect(sql).toContain('WARNING')
    expect(sql).toContain('REINTRODUCES THE KNOWN OWNER-UPLOAD DEFECT')
    // Scope limits (DDL, not comments): touches exactly ONE policy —
    // imported_own — and never drops columns or restores the broad
    // pre-3C bucket-only policy.
    expect(sql.match(/drop policy/gi)).toHaveLength(1)
    expect(sql.match(/create policy/gi)).toHaveLength(1)
    expect(sql).not.toMatch(/alter\s+table/i)
    expect(sql).not.toMatch(/drop\s+column/i)
    expect(sql).not.toMatch(/create policy "sauna_images_insert_authenticated"/)
  })
})
