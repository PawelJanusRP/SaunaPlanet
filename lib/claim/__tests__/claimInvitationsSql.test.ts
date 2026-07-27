// SP-039 Slice 3B1 — SQL contract test. Pins the security-relevant text of the
// M0–M5 migrations + rollbacks so the class of regressions the design guards
// against cannot return silently (no live DB in CI — behavioral SQL/RLS runs as
// the in-file verification suites).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
/** Strip `--` line comments so negative assertions test SQL, not documentation. */
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
const S = 'supabase/'

const m0 = read(`${S}2026-07-27_sp039_m0_masters_delete_version.sql`)
const m0r = read(`${S}2026-07-27_sp039_m0_masters_delete_version_rollback.sql`)
const m1 = read(`${S}2026-07-27_sp039_m1_master_origin_guards.sql`)
const m1r = read(`${S}2026-07-27_sp039_m1_master_origin_guards_rollback.sql`)
const m2 = read(`${S}2026-07-27_sp039_m2_claim_invitations.sql`)
const m3 = read(`${S}2026-07-27_sp039_m3_claim_events.sql`)
const m4 = read(`${S}2026-07-27_sp039_m4_admin_rpcs.sql`)
const m4r = read(`${S}2026-07-27_sp039_m4_admin_rpcs_rollback.sql`)
const m5 = read(`${S}2026-07-27_sp039_m5_master_delete_guard.sql`)

describe('M0 — masters_delete versioning preserves behavior', () => {
  it('fails loud unless the live predecessor references is_admin()', () => {
    expect(m0).toContain("position('is_admin' in v_qual) = 0")
    expect(m0).toContain('refusing to silently replace an unknown policy')
    expect(m0).toContain("v_cmd <> 'DELETE'")
  })
  it('recreates the identical admin-only DELETE policy (no widening)', () => {
    expect(m0).toContain('for delete')
    expect(m0).toContain('using (public.is_admin())')
    expect(m0).not.toContain('is_platform_moderator')
    expect(m0r).toContain('using (public.is_admin())')
  })
  it('does not modify is_admin() in M0', () => {
    expect(m0).not.toMatch(/create or replace function public\.is_admin/)
  })
})

describe('M1 — origin column + guard hardening', () => {
  it('adds origin with the two-value check and self_registered default', () => {
    expect(m1).toContain("add column origin text not null default 'self_registered'")
    expect(m1).toContain("check (origin in ('self_registered', 'admin_prepared'))")
  })
  it('PRE-APPLY asserts the current seven-field body before adding origin', () => {
    expect(m1).toContain('is not the SP-039 seven-field body')
    expect(m1).toContain("position('origin' in v_src) > 0")
  })
  it('UPDATE guard protects all seven original fields PLUS origin', () => {
    for (const f of [
      'new.level is distinct from old.level',
      'new.status is distinct from old.status',
      'new.user_id is distinct from old.user_id',
      'new.home_sauna_id is distinct from old.home_sauna_id',
      'new.is_founding_partner is distinct from old.is_founding_partner',
      'new.rating is distinct from old.rating',
      'new.review_count is distinct from old.review_count',
      'new.origin is distinct from old.origin',
    ]) {
      expect(m1).toContain(f)
    }
  })
  it('INSERT guard clamps origin to self_registered for non-moderators', () => {
    expect(m1).toContain("new.origin := 'self_registered'")
    expect(m1).toContain("new.level := 'guest'")
  })
  it('rollback restores the seven-field guard verbatim (no origin)', () => {
    const start = m1r.indexOf('create or replace function public.guard_master_privileged_columns')
    const body = m1r.slice(start, m1r.indexOf('language plpgsql', start))
    expect(body).toContain('new.review_count is distinct from old.review_count')
    expect(body).not.toContain('new.origin')
    // functional rollback must NOT drop the column
    const functional = m1r.slice(0, m1r.indexOf('DATA-LOSS'))
    expect(functional).not.toMatch(/drop column/i)
  })
})

describe('M2 — master_claim_invitations', () => {
  it('status vocabulary is the six MVP values with NO created', () => {
    expect(m2).toContain(
      "check (status in ('ready','sent','opened','claimed','expired','revoked'))"
    )
    expect(stripComments(m2)).not.toMatch(/'created'/)
  })
  it('master_id FK uses ON DELETE RESTRICT; actor FKs use SET NULL', () => {
    expect(m2).toContain('references public.sauna_masters(id) on delete restrict')
    expect(m2).toContain('created_by     uuid references auth.users(id) on delete set null')
    expect(m2).toContain('claimed_by     uuid references auth.users(id) on delete set null')
    expect(m2).toContain('revoked_by     uuid references auth.users(id) on delete set null')
  })
  it('stores only a hash + prefix — NO raw-token column exists', () => {
    expect(m2).toContain('token_hash     bytea')
    expect(m2).toContain('token_prefix   text not null')
    // no plaintext token column (test SQL, not comments)
    const sql = stripComments(m2)
    expect(sql).not.toMatch(/^\s*token\s+text/m)
    expect(sql).not.toMatch(/\braw_token\b/)
  })
  it('active partial unique index over explicit statuses, never now()/expires_at', () => {
    const start = m2.indexOf('create unique index master_claim_invitations_active_uidx')
    const block = m2.slice(start, m2.indexOf(';', start))
    expect(block).toContain("where status in ('ready','sent','opened')")
    expect(block).not.toContain('now(')
    expect(block).not.toContain('expires_at')
  })
  it('usable-token uniqueness is a partial unique index on token_hash', () => {
    expect(m2).toContain('create unique index master_claim_invitations_token_hash_uidx')
    expect(m2).toContain('where token_hash is not null')
  })
  it('pins the core integrity constraints', () => {
    expect(m2).toContain('check (open_count >= 0)')
    expect(m2).toContain('check (expires_at > created_at)')
    expect(m2).toContain("check ((status = 'claimed') = (claimed_by is not null)")
    expect(m2).toContain("check ((status = 'revoked') = (revoked_by is not null)")
    expect(m2).toContain(
      "check (token_hash is not null\n           or status in ('claimed','expired','revoked'))"
    )
  })
  it('enables RLS (not forced) and revokes client grants — default deny', () => {
    expect(m2).toContain('enable row level security')
    expect(m2).not.toContain('force row level security')
    expect(m2).toContain('revoke all on public.master_claim_invitations from anon, authenticated')
    expect(m2).not.toMatch(/create policy .* on public\.master_claim_invitations/)
  })
})

describe('M3 — master_claim_events (append-only)', () => {
  it('has the six Slice-3 event types and no claim events yet', () => {
    for (const e of [
      'profile_prepared',
      'invitation_created',
      'invitation_sent',
      'invitation_revoked',
      'invitation_regenerated',
      'invitation_expired',
    ]) {
      expect(m3).toContain(`'${e}'`)
    }
    expect(m3).not.toContain('claim_succeeded')
  })
  it('parent FKs are SET NULL (events never cascade-deleted)', () => {
    expect(m3).toContain('references public.master_claim_invitations(id) on delete set null')
    expect(m3).toContain('references public.sauna_masters(id) on delete set null')
  })
  it('append-only: moderator SELECT policy only, no write policies', () => {
    expect(m3).toContain('enable row level security')
    expect(m3).toContain('for select')
    expect(m3).toContain('using (public.is_platform_moderator())')
    expect(m3.match(/create policy/g)).toHaveLength(1)
    expect(m3).not.toMatch(/for (insert|update|delete)/)
    expect(m3).toContain('grant select on public.master_claim_events to authenticated')
  })
})

describe('M4 — admin RPCs', () => {
  const fns = [
    'admin_create_master_claim_invitation',
    'admin_mark_master_claim_sent',
    'admin_revoke_master_claim_invitation',
    'admin_regenerate_master_claim_invitation',
    'admin_list_master_claim_invitations',
    'admin_get_master_claim_invitation',
  ]
  it('every function is SECURITY DEFINER with an empty search_path', () => {
    for (const fn of fns) {
      expect(m4).toContain(`create or replace function public.${fn}`)
    }
    // each definition ends with the safe posture
    const defs = m4.match(/security definer[^\n]*set search_path = ''/g) ?? []
    expect(defs.length).toBeGreaterThanOrEqual(fns.length)
  })
  it('generates the token in-DB via qualified pgcrypto (extensions schema)', () => {
    expect(m4).toContain("translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_')")
    expect(m4).toContain("extensions.digest(v_token, 'sha256')")
    expect(m4).toContain('left(v_token, 8)')
  })
  it('uses the approved advisory-lock key derivation', () => {
    expect(m4).toContain('pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0))')
  })
  it('create returns active_invitation_exists and never auto-revokes a live row', () => {
    expect(m4).toContain("'active_invitation_exists'")
    // materialize expired only (expires_at <= now); never revoke on create
    expect(m4).toContain("and expires_at <= now()")
  })
  it('projections never expose token_hash or the raw token', () => {
    // Scope to the list+get function bodies with comments stripped, so the
    // "NEVER returns token_hash" header comments don't trip the assertion.
    const sql = stripComments(m4)
    const listStart = sql.indexOf(
      'create or replace function public.admin_list_master_claim_invitations'
    )
    const revokeStart = sql.indexOf('revoke all on function')
    const projections = sql.slice(listStart, revokeStart)
    expect(projections).not.toContain('token_hash')
    expect(projections).not.toContain('raw_token')
    expect(projections).toContain("'token_prefix'")
  })
  it('raw_token is returned only by create and regenerate', () => {
    expect(m4).toContain("'raw_token',     v_token")
    // exactly the two generators reference v_token in their result
    expect(m4.match(/'raw_token',\s+v_token/g)).toHaveLength(2)
  })
  it('rate limits create/regenerate (30) and sent/revoke (60) per hour', () => {
    expect(m4).toContain('v_recent >= 30')
    expect(m4).toContain('v_recent >= 60')
    expect(m4).toContain("interval '1 hour'")
  })
  it('privileges: revoked from public/anon, execute granted to authenticated', () => {
    expect(m4).toMatch(/revoke all on function public\.admin_create_master_claim_invitation/)
    expect(m4).toMatch(/grant execute on function public\.admin_create_master_claim_invitation.*to authenticated/)
    expect(m4).not.toMatch(/to anon/)
  })
  it('rollback doubles as a feature-disable lever', () => {
    expect(m4r).toContain('FEATURE-DISABLE')
    expect(m4r).toContain('revoke execute on function')
  })
})

describe('M5 — master delete guard', () => {
  it('is a BEFORE DELETE trigger backed by a SECURITY DEFINER function', () => {
    expect(m5).toContain('before delete on public.sauna_masters')
    expect(m5).toContain('create or replace function public.guard_master_delete')
    expect(m5).toContain('security definer set search_path = public')
  })
  it('blocks deletion when owned or when any invitation history exists', () => {
    expect(m5).toContain('old.user_id is not null')
    expect(m5).toContain('from public.master_claim_invitations')
    expect(m5).toContain('where master_id = old.id')
  })
})
