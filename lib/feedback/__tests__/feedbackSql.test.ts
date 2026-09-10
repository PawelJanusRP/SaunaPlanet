// SP-042B — contract tests pinning the M1 feedback migration to the approved
// architecture (docs/SP042_FEEDBACK_ARCHITECTURE.md §6, §11, §12, §16, §23).
// Source-scanning tests: they verify the versioned SQL text; behavioural
// verification runs at the PRE/POST-APPLY cutover per project protocol.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', '2026-09-10_sp042b_feedback_foundation.sql'),
  'utf8'
)
const ROLLBACK = readFileSync(
  join(process.cwd(), 'supabase', '2026-09-10_sp042b_feedback_foundation_rollback.sql'),
  'utf8'
)

describe('SP-042B M1 migration contract', () => {
  it('creates exactly the three approved tables', () => {
    expect(MIGRATION).toContain('create table public.feedback_reports')
    expect(MIGRATION).toContain('create table public.feedback_correction_items')
    expect(MIGRATION).toContain('create table public.feedback_report_events')
    expect(MIGRATION.match(/create table /g)?.length).toBe(3)
  })

  it('is fail-loud DDL: no or-replace, no drop in the forward file', () => {
    expect(MIGRATION).not.toMatch(/create or replace/i)
    expect(MIGRATION).not.toMatch(/drop table/i)
  })

  it('guards against collisions and missing prerequisites', () => {
    expect(MIGRATION).toContain("to_regclass('public.feedback_reports') is not null")
    expect(MIGRATION).toContain("to_regprocedure('public.is_platform_moderator()') is null")
  })

  it('enables RLS on all three tables', () => {
    for (const table of [
      'feedback_reports',
      'feedback_correction_items',
      'feedback_report_events',
    ]) {
      expect(MIGRATION).toContain(`alter table public.${table} enable row level security`)
    }
  })

  it('grants clients NO insert or delete policy anywhere (RPC-only intake)', () => {
    expect(MIGRATION).not.toMatch(/create policy[\s\S]{0,200}?for insert/i)
    expect(MIGRATION).not.toMatch(/create policy[\s\S]{0,200}?for delete/i)
  })

  it('scopes every policy to platform moderation', () => {
    const policies = MIGRATION.match(/create policy[\s\S]+?;/g) ?? []
    expect(policies.length).toBe(4) // 3× select + 1× reports update
    for (const policy of policies) {
      expect(policy).toContain('public.is_platform_moderator()')
      expect(policy).toContain('to authenticated')
    }
  })

  it('revokes client table privileges (belt-and-braces over RLS)', () => {
    expect(MIGRATION).toContain('revoke all on public.feedback_reports from anon')
    expect(MIGRATION).toContain('revoke insert, delete on public.feedback_reports from authenticated')
    expect(MIGRATION).toContain(
      'revoke insert, update, delete on public.feedback_correction_items from authenticated'
    )
    expect(MIGRATION).toContain(
      'revoke insert, update, delete on public.feedback_report_events from authenticated'
    )
  })

  it('pins the full category and event-type vocabularies', () => {
    for (const category of [
      "'name'", "'address'", "'coordinates'", "'website'", "'social_link'",
      "'contact_details'", "'category'", "'opening_info'", "'photo'",
      "'closed'", "'duplicate'", "'other'",
    ]) {
      expect(MIGRATION).toContain(category)
    }
    for (const eventType of [
      "'report_created'", "'status_changed'", "'item_accepted'", "'item_rejected'",
      "'correction_applied'", "'stale_conflict'", "'moderator_override'", "'note_added'",
    ]) {
      expect(MIGRATION).toContain(eventType)
    }
  })

  it('pins the message cap and terminal-state timestamp consistency', () => {
    expect(MIGRATION).toContain('char_length(message) <= 4000')
    expect(MIGRATION).toContain(
      "(status in ('resolved','rejected')) = (resolved_at is not null)"
    )
    expect(MIGRATION).toContain("(status <> 'pending') = (resolved_at is not null)")
  })

  it('stores only an HMAC key hash — no raw network address column', () => {
    expect(MIGRATION).toContain('submitter_key_hash')
    expect(MIGRATION).toMatch(/submitter_key_hash ~ '\^\[0-9a-f\]\{64\}\$'/)
    expect(MIGRATION).not.toMatch(/\binet\b/i)
    expect(MIGRATION).not.toMatch(/ip_address/i)
    expect(MIGRATION).not.toMatch(/user_agent/i)
  })

  it('derives identity from the session, never a caller parameter', () => {
    expect(MIGRATION).toContain('auth.uid()')
    expect(MIGRATION).not.toContain('p_user_id')
    expect(MIGRATION).not.toContain('p_created_by')
  })

  it('implements the approved rolling-window limits', () => {
    expect(MIGRATION).toContain("interval '1 hour'")
    expect(MIGRATION).toContain("interval '24 hours'")
    expect(MIGRATION).toContain('v_count >= 10')
    expect(MIGRATION).toContain('v_count >= 3')
  })

  it('accepts only active facilities and only facility corrections in SP-042B', () => {
    expect(MIGRATION).toContain("v_sauna.status <> 'active'")
    expect(MIGRATION).toContain("p_type is distinct from 'facility_correction'")
  })

  it('never mutates saunas', () => {
    expect(MIGRATION).not.toMatch(/update\s+public\.saunas/i)
    expect(MIGRATION).not.toMatch(/insert\s+into\s+public\.saunas/i)
    expect(MIGRATION).not.toMatch(/delete\s+from\s+public\.saunas/i)
  })

  it('audits creation inside the RPC and status changes via trigger', () => {
    expect(MIGRATION).toContain("'report_created'")
    expect(MIGRATION).toContain('create trigger feedback_reports_status_audit')
    expect(MIGRATION).toContain('create trigger feedback_reports_guard')
  })

  it('follows the SECURITY DEFINER + pinned search_path + revoke/grant posture', () => {
    expect(MIGRATION.match(/security definer/g)?.length).toBe(3) // RPC + 2 trigger fns
    expect(MIGRATION.match(/set search_path = ''/g)?.length).toBe(3)
    expect(MIGRATION).toContain('from public, anon, authenticated, service_role')
    expect(MIGRATION).toMatch(/grant execute on function public\.submit_feedback_report[\s\S]+?to authenticated, service_role/)
  })

  it('gives anon NO EXECUTE anywhere — anonymous intake is server-path only', () => {
    const grants = MIGRATION.match(/grant execute[\s\S]+?;/g) ?? []
    expect(grants.length).toBe(1)
    for (const grant of grants) {
      expect(grant).not.toMatch(/\banon\b/)
    }
  })

  it('pins the anonymous branch to the trusted server JWT context', () => {
    const rpcBody = MIGRATION.slice(MIGRATION.indexOf('create function public.submit_feedback_report'))
    const anonBranch = rpcBody.slice(rpcBody.indexOf('else'), rpcBody.indexOf("interval '24 hours'"))
    expect(anonBranch).toContain("auth.jwt()->>'role'")
    expect(anonBranch).toContain("<> 'service_role'")
  })

  it('returns only stable codes — no identifiers in RPC results', () => {
    const rpcBody = MIGRATION.slice(MIGRATION.indexOf('create function public.submit_feedback_report'))
    expect(rpcBody).not.toMatch(/'report_id',\s*v_report_id/)
    expect(rpcBody).toContain("jsonb_build_object('ok', true, 'code', 'ok')")
  })
})

describe('SP-042B M1 rollback contract', () => {
  it('refuses to drop applied-correction audit history', () => {
    expect(ROLLBACK).toContain("event_type = 'correction_applied'")
    expect(ROLLBACK).toContain('raise exception')
  })

  it('drops children before parents', () => {
    const events = ROLLBACK.indexOf('drop table if exists public.feedback_report_events')
    const items = ROLLBACK.indexOf('drop table if exists public.feedback_correction_items')
    const reports = ROLLBACK.indexOf('drop table if exists public.feedback_reports')
    expect(events).toBeGreaterThan(-1)
    expect(items).toBeGreaterThan(events)
    expect(reports).toBeGreaterThan(items)
  })
})
