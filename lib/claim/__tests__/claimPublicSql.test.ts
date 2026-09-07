// SP-039 Slice 4A — SQL contract test for the M7 public claim foundation.
// Pins the security-relevant text of the forward + rollback migrations (no live
// DB in CI — behavioral SQL runs as the cutover verification suites).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
/** Strip `--` line comments so negative assertions test SQL, not documentation. */
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')

const m7 = read('supabase/2026-07-30_sp039_m7_public_claim.sql')
const m7r = read('supabase/2026-07-30_sp039_m7_public_claim_rollback.sql')
const m7s = stripComments(m7)

describe('M7 — drift guards (fail-loud preconditions)', () => {
  it('requires the M3 six-event vocabulary without the claim event', () => {
    expect(m7).toContain("position('invitation_regenerated' in v_check) = 0")
    expect(m7).toContain("position('invitation_claimed' in v_check) > 0")
    expect(m7).toContain('M7 already applied?')
  })
  it('requires the M1 eight-field guard body without a claim arm', () => {
    expect(m7).toContain("position('new.origin' in v_guard) = 0")
    expect(m7).toContain("position('master_claim_invitations' in v_guard) > 0")
  })
  it('requires both new function names to be free (no OR REPLACE takeover)', () => {
    expect(m7).toContain(
      "to_regprocedure('public.public_inspect_master_claim_invitation(text)') is not null"
    )
    expect(m7).toContain(
      "to_regprocedure('public.public_claim_master_profile(text)') is not null"
    )
  })
  it('pins the pgcrypto-in-extensions assumption', () => {
    expect(m7).toContain("extname = 'pgcrypto'")
    expect(m7).toContain("extnamespace = 'extensions'::regnamespace")
  })
})

describe('M7 — event vocabulary extension', () => {
  it('recreates mce_event_type_check as the seven-type superset', () => {
    expect(m7s).toContain('drop constraint mce_event_type_check')
    expect(m7s).toContain("'invitation_claimed'")
    // superset: all six originals retained
    for (const t of [
      'profile_prepared',
      'invitation_created',
      'invitation_sent',
      'invitation_revoked',
      'invitation_regenerated',
      'invitation_expired',
    ]) {
      expect(m7s).toContain(`'${t}'`)
    }
  })
  it('adds no other event names (opened tracking is explicitly deferred)', () => {
    expect(m7s).not.toContain("'invitation_opened'")
    expect(m7s).not.toContain("'invitation_inspected'")
  })
})

describe('M7 — UPDATE guard claim carve-out', () => {
  it('keeps all eight privileged fields', () => {
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
      expect(m7s).toContain(f)
    }
  })
  it('carves out ONLY the data-derived claim transition on user_id', () => {
    expect(m7s).toContain('old.user_id is null')
    expect(m7s).toContain('new.user_id = auth.uid()')
    expect(m7s).toContain("old.origin = 'admin_prepared'")
    expect(m7s).toContain("i.status = 'claimed'")
    expect(m7s).toContain('i.claimed_by = auth.uid()')
    expect(m7s).toContain('i.master_id = old.id')
  })
  it('keeps the approved generic Polish exception message', () => {
    expect(m7).toContain(
      'Pola uprzywilejowane profilu saunamistrza może zmieniać wyłącznie moderacja.'
    )
  })
})

describe('M7 — function definitions and hardening', () => {
  it('creates the two new functions WITHOUT or-replace (fail-loud on collision)', () => {
    expect(m7s).toContain(
      'create function public.public_inspect_master_claim_invitation(p_token text)'
    )
    expect(m7s).toContain(
      'create function public.public_claim_master_profile(p_token text)'
    )
    expect(m7s).not.toContain('create or replace function public.public_inspect')
    expect(m7s).not.toContain('create or replace function public.public_claim')
  })
  it('every function body is SECURITY DEFINER with an empty search_path', () => {
    const defs = m7s.match(/security definer[^;]*set search_path = ''/g) ?? []
    // guard + inspect + claim = 3 definitions
    expect(defs.length).toBe(3)
  })
  it('inspection is STABLE (read-only) and never materializes or writes', () => {
    expect(m7s).toContain("security definer stable set search_path = ''")
    const inspect = m7s.slice(
      m7s.indexOf('create function public.public_inspect_master_claim_invitation'),
      m7s.indexOf('create function public.public_claim_master_profile')
    )
    expect(inspect).not.toContain('update ')
    expect(inspect).not.toContain('insert into')
    expect(inspect).not.toContain('for update')
    expect(inspect).not.toContain('pg_advisory_xact_lock')
  })
  it('both functions pin the exact 43-char base64url token shape', () => {
    const shapeChecks = m7s.match(/\^\[A-Za-z0-9_-\]\{43\}\$/g) ?? []
    expect(shapeChecks.length).toBe(2)
  })
  it('hashes the token server-side with the established digest model', () => {
    const digests = m7s.match(/extensions\.digest\(p_token, 'sha256'\)/g) ?? []
    expect(digests.length).toBe(2)
  })
  it('never leaks the token through an exception message', () => {
    for (const line of m7s.split('\n')) {
      if (line.includes('raise exception')) {
        expect(line).not.toContain('p_token')
      }
    }
  })
})

describe('M7 — atomic claim body', () => {
  const claim = m7s.slice(
    m7s.indexOf('create function public.public_claim_master_profile'),
    m7s.indexOf('revoke all on function')
  )
  it('identifies the claimant ONLY from auth.uid()', () => {
    expect(claim).toContain('v_uid    uuid := auth.uid()')
    expect(claim).not.toContain('p_user')
  })
  it('locks in the M4 order: advisory lock on the master, then row locks', () => {
    const advisory = claim.indexOf(
      'pg_advisory_xact_lock(hashtextextended(v_inv.master_id::text, 0))'
    )
    const invLock = claim.indexOf('for update')
    expect(advisory).toBeGreaterThan(-1)
    expect(invLock).toBeGreaterThan(advisory)
    expect((claim.match(/for update/g) ?? []).length).toBe(2)
  })
  it('materializes an active-but-expired row exactly like the admin RPCs', () => {
    expect(claim).toContain("set status = 'expired'")
    expect(claim).toContain("'invitation_expired'")
    expect(claim).toContain('materialized on claim attempt')
  })
  it('is idempotent for the winner and terminal for everyone else', () => {
    expect(claim).toContain('v_inv.claimed_by = v_uid')
    expect(claim).toContain("'already_claimed_by_you'")
    expect(claim).toContain("'already_claimed'")
  })
  it('re-checks full master eligibility and the one-master-per-user rule', () => {
    expect(claim).toContain('v_master.user_id is not null')
    expect(claim).toContain("v_master.origin <> 'admin_prepared'")
    expect(claim).toContain("v_master.status <> 'pending'")
    expect(claim).toContain('select 1 from public.sauna_masters where user_id = v_uid')
    expect(claim).toContain("'user_already_master'")
  })
  it('claims the invitation BEFORE linking ownership (guard derives from it)', () => {
    const invUpdate = claim.indexOf("set status = 'claimed', claimed_at = now(), claimed_by = v_uid")
    const masterUpdate = claim.indexOf('set user_id = v_uid')
    expect(invUpdate).toBeGreaterThan(-1)
    expect(masterUpdate).toBeGreaterThan(invUpdate)
  })
  it('wraps the pair in a subtransaction with a stable unique-violation outcome', () => {
    expect(claim).toContain('exception when unique_violation then')
    const handler = claim.slice(claim.indexOf('exception when unique_violation'))
    expect(handler).toContain("'user_already_master'")
  })
  it('writes ONE claim event carrying only the non-secret prefix', () => {
    expect(claim).toContain("'invitation_claimed'")
    expect(claim).toContain("jsonb_build_object('token_prefix', v_inv.token_prefix)")
    expect(claim).not.toContain("'raw_token'")
    expect(claim).not.toContain('p_token)')
  })
  it('returns only the stable projection (master id + name)', () => {
    expect(claim).toContain("'master_id',   v_master.id")
    expect(claim).toContain("'master_name', v_master.name")
  })
})

describe('M7 — public inspection projection', () => {
  const inspect = m7s.slice(
    m7s.indexOf('create function public.public_inspect_master_claim_invitation'),
    m7s.indexOf('create function public.public_claim_master_profile')
  )
  it('malformed and unknown tokens share ONE generic negative', () => {
    const generic = inspect.match(/'invalid_or_unknown'/g) ?? []
    expect(generic.length).toBeGreaterThanOrEqual(4)
  })
  it('exposes only the allow-listed landing fields', () => {
    expect(inspect).toContain("'master_name',   v_master.name")
    expect(inspect).toContain("'city',          v_master.city")
    expect(inspect).toContain("'avatar_url',    v_master.avatar_url")
    expect(inspect).toContain("'bio',           v_master.bio")
    expect(inspect).toContain("'expires_at',    v_inv.expires_at")
    expect(inspect).toContain("'auth_required', true")
  })
  it('never returns ids, hashes, actor, delivery or admin fields', () => {
    expect(inspect).not.toContain("'invitation_id'")
    expect(inspect).not.toContain("'master_id'")
    expect(inspect).not.toContain('token_prefix')
    expect(inspect).not.toContain('v_inv.token_hash')
    expect(inspect).not.toContain('admin_note')
    expect(inspect).not.toContain('delivery_')
    expect(inspect).not.toContain('created_by')
    expect(inspect).not.toContain('claimed_by')
  })
})

describe('M7 — grants (separate boundaries)', () => {
  it('strips defaults from every role first (M5 lesson)', () => {
    expect(m7s).toContain(
      'revoke all on function public.public_inspect_master_claim_invitation(text)'
    )
    expect(m7s).toContain(
      'revoke all on function public.public_claim_master_profile(text)'
    )
    const revokes = m7s.match(/from public, anon, authenticated, service_role/g) ?? []
    expect(revokes.length).toBe(2)
  })
  it('grants inspection to anon+authenticated, the mutating claim NEVER to anon', () => {
    expect(m7s).toContain(
      'grant execute on function public.public_inspect_master_claim_invitation(text)\n  to anon, authenticated'
    )
    expect(m7s).toContain(
      'grant execute on function public.public_claim_master_profile(text)\n  to authenticated'
    )
    const claimGrant = m7s.slice(
      m7s.indexOf('grant execute on function public.public_claim_master_profile')
    )
    const claimGrantLine = claimGrant.slice(0, claimGrant.indexOf(';'))
    expect(claimGrantLine).not.toContain('anon')
    expect(claimGrantLine).not.toContain('service_role')
  })
})

describe('M7 — transaction and scope hygiene', () => {
  it('is transactional and reloads PostgREST', () => {
    expect(m7s).toContain('begin;')
    expect(m7s).toContain('commit;')
    expect(m7).toContain("notify pgrst, 'reload schema'")
  })
  it('contains no unrelated DDL (no tables, columns, policies, indexes)', () => {
    expect(m7s).not.toContain('create table')
    expect(m7s).not.toContain('add column')
    expect(m7s).not.toContain('create policy')
    expect(m7s).not.toContain('drop policy')
    expect(m7s).not.toContain('create index')
    expect(m7s).not.toContain('create trigger')
  })
  it('references every relation schema-qualified (empty search_path)', () => {
    // no DML statement may name a claim/master table without the schema prefix
    expect(m7s).not.toMatch(
      /\b(from|update|join|insert into)\s+(master_claim_invitations|master_claim_events|sauna_masters)\b/
    )
    // and the qualified forms are actually used
    expect(m7s).toContain('from public.master_claim_invitations')
    expect(m7s).toContain('update public.master_claim_invitations')
    expect(m7s).toContain('insert into public.master_claim_events')
    expect(m7s).toContain('update public.sauna_masters')
    expect(m7s).toContain('from public.sauna_masters')
  })
})

describe('M7 rollback — honest and guarded', () => {
  it('refuses once any real claim event exists', () => {
    expect(m7r).toContain("event_type = 'invitation_claimed'")
    expect(m7r).toContain('cannot be restored')
  })
  it('drops both functions and restores the M1 guard body verbatim', () => {
    expect(m7r).toContain('drop function public.public_claim_master_profile(text)')
    expect(m7r).toContain(
      'drop function public.public_inspect_master_claim_invitation(text)'
    )
    const restored = stripComments(m7r)
    expect(restored).toContain('new.user_id is distinct from old.user_id')
    expect(restored).not.toContain('master_claim_invitations i')
  })
  it('restores the six-type vocabulary and warns about irreversibility', () => {
    expect(stripComments(m7r)).not.toContain("'invitation_claimed'))")
    expect(m7r).toContain('IMPOSSIBLE after any real claim')
    expect(m7r).toContain('NEVER un-claims ownership')
  })
})
