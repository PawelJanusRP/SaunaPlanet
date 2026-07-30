// SP-039 Slice 4C2 — SQL contract test for the M10 transition layer.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')

const m10 = read('supabase/2026-07-30_sp039_m10_publication_transitions.sql')
const m10r = read(
  'supabase/2026-07-30_sp039_m10_publication_transitions_rollback.sql'
)
const m10s = stripComments(m10)
const m10rs = stripComments(m10r)

const RPC_SIGNATURES = [
  'public.submit_master_profile_for_publication(uuid)',
  'public.withdraw_master_profile_submission(uuid, text)',
  'public.unpublish_master_profile(uuid, text)',
  'public.moderator_approve_master_publication(uuid, text)',
  'public.moderator_request_master_publication_changes(uuid, text)',
  'public.moderator_suspend_master_publication(uuid, text)',
  'public.moderator_restore_master_publication(uuid, text)',
]

const EVENT_TYPES_10 = [
  'legacy_publication_granted',
  'profile_submitted',
  'changes_requested',
  'publication_approved',
  'profile_unpublished',
  'profile_suspended',
  'owner_publication_withdrawn',
  'submission_withdrawn',
  'publication_restored',
  'publication_demoted',
]

describe('M10 — drift guards (fail-loud preconditions)', () => {
  it('requires the full M9 catalog before touching anything', () => {
    expect(m10).toContain("to_regclass('public.master_publication') is null")
    expect(m10).toContain(
      "to_regclass('public.master_publication_events') is null"
    )
    expect(m10).toContain(
      "to_regprocedure('public.is_master_publicly_visible(uuid)') is null"
    )
    expect(m10).toContain("position('is_master_publicly_visible' in v_qual) = 0")
    expect(m10).toContain("position('owner_publication_withdrawn' in v_def) = 0")
  })
  it('refuses when the vocabulary or any M10 object already exists', () => {
    expect(m10).toContain("position('publication_demoted' in v_def) > 0")
    for (const sig of RPC_SIGNATURES) {
      expect(m10).toContain(`to_regprocedure('${sig}') is not null`)
    }
    expect(m10).toContain(
      "to_regprocedure('public.handle_master_material_edit_demotion()') is not null"
    )
    expect(m10).toContain("tgname = 'sauna_masters_material_edit_demotion'")
  })
})

describe('M10 — event vocabulary swap (7 -> 10, superset)', () => {
  it('re-adds mpe_event_type_check with exactly the ten types', () => {
    const swap = m10s.slice(m10s.indexOf('add constraint mpe_event_type_check'))
    for (const t of EVENT_TYPES_10) {
      expect(swap).toContain(`'${t}'`)
    }
  })
})

describe('M10 — RPC posture', () => {
  it('creates all seven RPCs as DEFINER with empty search_path', () => {
    expect(m10s).toContain(
      'create function public.submit_master_profile_for_publication('
    )
    expect(m10s).toContain(
      'create function public.withdraw_master_profile_submission('
    )
    expect(m10s).toContain('create function public.unpublish_master_profile(')
    expect(m10s).toContain(
      'create function public.moderator_approve_master_publication('
    )
    expect(m10s).toContain(
      'create function public.moderator_request_master_publication_changes('
    )
    expect(m10s).toContain(
      'create function public.moderator_suspend_master_publication('
    )
    expect(m10s).toContain(
      'create function public.moderator_restore_master_publication('
    )
    const definer = m10s.match(
      /security definer set search_path = ''/g
    )
    expect(definer?.length).toBe(8) // 7 RPCs + trigger function
  })
  it('gates every RPC on auth.uid() and moderator RPCs on the platform role', () => {
    const notAuth = m10s.match(/'not_authenticated'/g)
    expect(notAuth?.length).toBe(7)
    const modGate = m10s.match(/if not public\.is_platform_moderator\(\) then/g)
    expect(modGate?.length).toBe(4) // approve, changes, suspend, restore
    expect(m10s).toContain("'not_owner'")
    expect(m10s).toContain("'not_authorized'")
  })
  it('serializes every RPC per master with the M4 advisory-lock order', () => {
    const locks = m10s.match(
      /pg_advisory_xact_lock\(hashtextextended\(p_master_id::text, 0\)\)/g
    )
    expect(locks?.length).toBe(7)
    const rowLocks = m10s.match(/for update/g)
    expect(rowLocks && rowLocks.length >= 13).toBe(true)
  })
  it('accepts no caller-supplied user id anywhere', () => {
    expect(m10s).not.toContain('p_user_id')
    expect(m10s).not.toContain('p_actor')
  })
})

describe('M10 — completeness gate (submit)', () => {
  const submit = m10s.slice(
    m10s.indexOf('create function public.submit_master_profile_for_publication'),
    m10s.indexOf('create function public.withdraw_master_profile_submission')
  )
  it('checks the five hard fields with trim rules and the shared bio minimum', () => {
    expect(submit).toContain("coalesce(btrim(v_master.name), '') = ''")
    expect(submit).toContain("coalesce(btrim(v_master.city), '') = ''")
    expect(submit).toContain('coalesce(char_length(btrim(v_master.bio)), 0) < 80')
    expect(submit).toContain("coalesce(btrim(v_master.avatar_url), '') = ''")
    expect(submit).toContain('cardinality(v_master.specialties) < 1')
  })
  it('fails closed with bounded field codes and no private values', () => {
    expect(submit).toContain("'profile_incomplete'")
    expect(submit).toContain("jsonb_build_object('missing', to_jsonb(v_missing))")
    for (const code of ["'name'", "'city'", "'bio'", "'avatar'", "'specialties'"]) {
      expect(submit).toContain(`v_missing || ${code}`)
    }
  })
  it('is the only place that creates a publication row (get-or-create)', () => {
    expect(submit).toContain('on conflict (master_id) do nothing')
    const inserts = m10s.match(/insert into public\.master_publication \(/g)
    expect(inserts?.length).toBe(1)
  })
})

describe('M10 — transition and idempotency codes', () => {
  it('exposes the stable success and already_* codes', () => {
    for (const code of [
      "'submitted'",
      "'already_submitted'",
      "'withdrawn'",
      "'already_draft'",
      "'unpublished'",
      "'already_unpublished'",
      "'published'",
      "'already_published'",
      "'changes_requested'",
      "'already_changes_requested'",
      "'suspended'",
      "'already_suspended'",
      "'restored'",
      "'invalid_transition'",
      "'reason_required'",
      "'master_not_found'",
      "'master_not_approved'",
    ]) {
      expect(m10s).toContain(code)
    }
  })
  it('requires a reason for changes/suspend/restore', () => {
    const required = m10s.match(/'reason_required'/g)
    expect(required?.length).toBe(3)
  })
  it('approve is gated on moderation-approved AND owned masters', () => {
    const approve = m10s.slice(
      m10s.indexOf('create function public.moderator_approve_master_publication'),
      m10s.indexOf(
        'create function public.moderator_request_master_publication_changes'
      )
    )
    expect(approve).toContain("v_master.status <> 'approved'")
    expect(approve).toContain('v_master.user_id is null')
    expect(approve).toContain('publication_reviewed_by = v_actor')
  })
  it('never sets legacy_published anywhere', () => {
    expect(m10s).not.toMatch(/set publication_status = 'legacy_published'/)
    expect(m10s).not.toMatch(/values \([^)]*'legacy_published'/)
  })
  it('owner unpublish cannot exit legacy_published (moderator-only path)', () => {
    const unpub = m10s.slice(
      m10s.indexOf('create function public.unpublish_master_profile'),
      m10s.indexOf('create function public.moderator_approve_master_publication')
    )
    expect(unpub).toContain(
      "v_pub.publication_status = 'legacy_published' and not v_is_mod"
    )
  })
})

describe('M10 — material-edit demotion trigger', () => {
  const fn = m10s.slice(
    m10s.indexOf('create function public.handle_master_material_edit_demotion')
  )
  it('fires only for owner-context edits', () => {
    expect(fn).toContain('new.user_id <> auth.uid()')
    expect(fn).toContain('auth.uid() is null')
  })
  it('compares exactly the owner-editable public presentation fields', () => {
    for (const col of [
      'name',
      'slug',
      'city',
      'bio',
      'avatar_url',
      'cover_image_url',
      'specialties',
      'languages',
      'experience_since_year',
      'social_links',
      'website',
    ]) {
      expect(fn).toContain(`new.${col} is not distinct from old.${col}`)
    }
    expect(fn).not.toContain('old.status')
    expect(fn).not.toContain('old.level')
    expect(fn).not.toContain('old.rating')
    expect(fn).not.toContain('old.origin')
  })
  it('demotes only publicly visible rows and writes exactly one event', () => {
    expect(fn).toContain("publication_status in ('published','legacy_published')")
    expect(fn).toContain("set publication_status = 'submitted'")
    expect(fn).toContain('published_at = null')
    expect(fn).toContain('if found then')
    expect(fn).toContain("'publication_demoted'")
  })
  it('is bound as an AFTER UPDATE row trigger', () => {
    expect(m10s).toContain('after update on public.sauna_masters')
    expect(m10s).toContain(
      'execute function public.handle_master_material_edit_demotion()'
    )
  })
})

describe('M10 — grants and scope hygiene', () => {
  it('grants every RPC to authenticated only and never to anon', () => {
    for (const sig of RPC_SIGNATURES) {
      expect(m10s).toContain(`revoke all on function ${sig}\n  from public, anon;`)
      expect(m10s).toContain(`grant execute on function ${sig}\n  to authenticated;`)
    }
    expect(m10s).not.toMatch(/grant execute[^;]*to anon/)
  })
  it('locks the trigger function down completely', () => {
    expect(m10s).toContain(
      'revoke all on function public.handle_master_material_edit_demotion()\n  from public, anon, authenticated, service_role;'
    )
  })
  it('is transactional, reloads PostgREST and touches nothing else', () => {
    expect(m10s).toContain('begin;')
    expect(m10s).toContain('commit;')
    expect(m10).toContain("notify pgrst, 'reload schema'")
    expect(m10s).not.toContain('update public.sauna_masters')
    expect(m10s).not.toMatch(/alter table public\.master_publication(?!_events)/)
    expect(m10s).not.toContain('drop policy')
    expect(m10s).not.toContain('create policy')
    expect(m10s).not.toContain('guard_master_privileged_columns')
    expect(m10s).not.toContain('email')
  })
})

describe('M10 rollback — honest and guarded', () => {
  it('refuses once the workflow has been used', () => {
    expect(m10r).toContain(
      "('submission_withdrawn','publication_restored','publication_demoted')"
    )
    expect(m10r).toContain(
      "('submitted','changes_requested','published','suspended')"
    )
  })
  it('drops all nine objects and restores the M9 seven-type vocabulary', () => {
    expect(m10rs).toContain(
      'drop trigger sauna_masters_material_edit_demotion on public.sauna_masters'
    )
    expect(m10rs).toContain(
      'drop function public.handle_master_material_edit_demotion()'
    )
    for (const sig of RPC_SIGNATURES) {
      expect(m10rs).toContain(`drop function ${sig}`)
    }
    const restored = m10rs.slice(
      m10rs.indexOf('add constraint mpe_event_type_check')
    )
    expect(restored).toContain("'owner_publication_withdrawn'))")
    expect(restored).not.toContain("'publication_demoted'")
  })
  it('never deletes history or mutates publication rows', () => {
    expect(m10rs).not.toContain('delete from public.master_publication')
    expect(m10rs).not.toMatch(/update public\.master_publication/)
    expect(m10rs).not.toContain('update public.sauna_masters')
  })
})
