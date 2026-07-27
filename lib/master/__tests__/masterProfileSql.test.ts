// SP-039 Slice 1 — SQL contract test for the master-profile migration.
//
// Pins the security-relevant text of the committed migration and rollback:
// the privileged-column guard set (R1), the ownership-aware Storage policy
// (R2 — with the SP-039C lessons: qualified target-table references, no
// uuid cast of the untrusted path segment), and the rollback's exact
// restoration of the legacy definitions.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/2026-07-27_sp039_master_profile.sql', 'utf8')
const rollback = readFileSync('supabase/2026-07-27_sp039_rollback.sql', 'utf8')

function guardBody(sql: string): string {
  const start = sql.indexOf('create or replace function public.guard_master_privileged_columns')
  expect(start).toBeGreaterThan(-1)
  const end = sql.indexOf('language plpgsql', start)
  return sql.slice(start, end)
}

describe('forward migration', () => {
  it('adds exactly the nine approved columns', () => {
    for (const col of [
      'add column slug text',
      'add column city text',
      'add column specialties text[]',
      'add column languages text[]',
      'add column experience_since_year smallint',
      'add column social_links jsonb',
      'add column website text',
      'add column cover_image_url text',
      'add column is_founding_partner boolean not null default false',
    ]) {
      expect(migration).toContain(col)
    }
    // loud-failure policy: no silent skips on columns/indexes
    expect(migration).not.toMatch(/add column if not exists/i)
    expect(migration).not.toMatch(/create unique index if not exists/i)
  })

  it('pins the slug invariants', () => {
    expect(migration).toContain("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
    expect(migration).toContain('char_length(slug) between 3 and 40')
    expect(migration).toContain('on public.sauna_masters (lower(slug))')
    expect(migration).toContain('where slug is not null')
  })

  it('guard protects all seven privileged columns with the generic message', () => {
    const body = guardBody(migration)
    for (const col of [
      'new.level is distinct from old.level',
      'new.status is distinct from old.status',
      'new.user_id is distinct from old.user_id',
      'new.home_sauna_id is distinct from old.home_sauna_id',
      'new.is_founding_partner is distinct from old.is_founding_partner',
      'new.rating is distinct from old.rating',
      'new.review_count is distinct from old.review_count',
    ]) {
      expect(body).toContain(col)
    }
    expect(body).toContain(
      'Pola uprzywilejowane profilu saunamistrza może zmieniać wyłącznie moderacja.'
    )
    // the generic message must NOT enumerate protected columns
    expect(body).not.toContain('rating i review_count')
  })

  it('storage policy is ownership-aware with qualified refs and no uuid cast', () => {
    const start = migration.indexOf('create policy "master_avatars_insert_own"')
    expect(start).toBeGreaterThan(-1)
    const block = migration.slice(start, migration.indexOf(';', start))
    expect(block).toContain("storage.objects.bucket_id = 'master-avatars'")
    expect(block).toContain('storage.foldername(storage.objects.name)')
    expect(block).toContain('m.id::text')
    expect(block).toContain('m.user_id = auth.uid()')
    expect(block).toContain('public.is_platform_moderator()')
    // the SP-038 3C lesson: never an unqualified target-table column in a
    // policy subquery, never a cast of the untrusted path segment
    expect(block).not.toMatch(/foldername\(\s*name\s*\)/)
    expect(block).not.toMatch(/foldername\(\s*m\.name\s*\)/)
    expect(block).not.toMatch(/\[1\]\s*\)?::uuid/)
    expect(block).toContain('for insert to authenticated')
  })

  it('drops only the legacy master-avatars policy and touches nothing else', () => {
    expect(migration).toContain(
      'drop policy "Authenticated users can upload to master-avatars" on storage.objects'
    )
    expect(migration.match(/drop policy/g)).toHaveLength(1)
    expect(migration).not.toContain('sauna_images')
  })
})

describe('rollback', () => {
  it('restores the SP-035 four-column guard verbatim', () => {
    const body = guardBody(rollback)
    expect(body).toContain('new.home_sauna_id is distinct from old.home_sauna_id')
    expect(body).not.toContain('is_founding_partner')
    expect(body).not.toContain('new.rating')
    expect(body).toContain('Poziom, status i powiązania profilu zmienia tylko moderacja')
  })

  it('restores the legacy bucket-only storage policy and keeps profile data', () => {
    expect(rollback).toContain(
      'create policy "Authenticated users can upload to master-avatars" on storage.objects'
    )
    expect(rollback).toContain("with check (bucket_id = 'master-avatars')")
    // functional rollback must NOT drop data — only the commented full
    // rollback section may mention column drops
    const functional = rollback.slice(0, rollback.indexOf('3. FULL ROLLBACK'))
    expect(functional).not.toMatch(/^\s*alter table public\.sauna_masters\s*$/m)
    expect(functional).not.toMatch(/^\s*drop column/m)
    expect(rollback).not.toContain('sauna_images')
  })
})
