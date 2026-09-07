// SP-039 Slice 4A — contract + behavioral tests for the public claim Server
// Actions (app/claim/actions.ts). The static section pins the source-level
// security contract; the behavioral section proves the fail-closed ordering
// with a mocked Supabase client (no network, no database).

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const src = readFileSync('app/claim/actions.ts', 'utf8')

// --- vi.mock factories are hoisted: literals only inside (3B3 lesson). ---
const rpcMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}))

import { claimMasterProfile, inspectMasterClaimInvitation } from '@/app/claim/actions'

const TOKEN = 'B'.repeat(43)

describe('static contract — app/claim/actions.ts', () => {
  it("is a 'use server' module whose exports are ALL async functions", () => {
    expect(src.startsWith("'use server'")).toBe(true)
    const exports = src.match(/^export .*$/gm) ?? []
    for (const line of exports) {
      expect(line).toMatch(/^export async function /)
    }
  })
  it('calls exactly the two M7 public RPCs and nothing else', () => {
    expect(src).toContain("'public_inspect_master_claim_invitation'")
    expect(src).toContain("'public_claim_master_profile'")
    expect((src.match(/\.rpc\(/g) ?? []).length).toBe(2)
    expect(src).not.toContain('admin_')
  })
  it('never touches tables, storage or logging directly', () => {
    expect(src).not.toContain('.from(')
    expect(src).not.toContain('.storage')
    expect(src).not.toContain('console.')
  })
  it('gates every RPC behind the shape validator (fail-closed before I/O)', () => {
    const fns = src.split('export async function').slice(1)
    expect(fns.length).toBe(2)
    for (const body of fns) {
      const gate = body.indexOf('isValidClaimTokenShape')
      const rpc = body.indexOf('.rpc(')
      expect(gate).toBeGreaterThan(-1)
      expect(rpc).toBeGreaterThan(gate)
    }
  })
  it('forwards the token ONLY as the p_token RPC argument', () => {
    // every rawToken usage is the parameter, the shape gate, or p_token
    for (const line of src.split('\n')) {
      if (!line.includes('rawToken')) continue
      const ok =
        line.includes('rawToken: string') ||
        line.includes('isValidClaimTokenShape(rawToken)') ||
        line.includes('p_token: rawToken')
      expect(`${line}`, `unexpected token usage: ${line}`).toSatisfy(() => ok)
    }
    expect(src).not.toContain('${rawToken')
  })
  it('re-exports no types from the server module (Slice 1 Turbopack lesson)', () => {
    expect(src).not.toMatch(/^export type/m)
    expect(src).not.toMatch(/^export \{/m)
  })
})

describe('behavioral — inspection wrapper', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('refuses a malformed token WITHOUT calling the RPC', async () => {
    const res = await inspectMasterClaimInvitation('short')
    expect(res.state).toBe('invalid_or_unknown')
    expect(res.preview).toBeNull()
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('passes a valid-shape token as p_token and sanitizes the payload', async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        code: 'claimable',
        data: {
          master_name: 'Jan Para',
          city: 'Poznań',
          avatar_url: null,
          bio: 'x',
          expires_at: '2026-08-13T10:00:00Z',
          auth_required: true,
          token_prefix: 'leak-me',
        },
      },
      error: null,
    })
    const res = await inspectMasterClaimInvitation(TOKEN)
    expect(rpcMock).toHaveBeenCalledWith('public_inspect_master_claim_invitation', {
      p_token: TOKEN,
    })
    expect(res.state).toBe('claimable')
    expect(res.preview?.masterName).toBe('Jan Para')
    expect(JSON.stringify(res)).not.toContain('leak-me')
  })
  it('maps negative states; transport errors become the RETRYABLE unavailable', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, code: 'revoked' }, error: null })
    expect((await inspectMasterClaimInvitation(TOKEN)).state).toBe('revoked')

    // transport failure is deliberately NOT the terminal generic negative
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await inspectMasterClaimInvitation(TOKEN)
    expect(res.state).toBe('unavailable')
    expect(res.preview).toBeNull()
  })
  it('fails closed when a claimable response has no usable payload', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, code: 'claimable', data: { master_name: ' ' } },
      error: null,
    })
    const res = await inspectMasterClaimInvitation(TOKEN)
    expect(res.state).toBe('invalid_or_unknown')
    expect(res.preview).toBeNull()
  })
})

describe('behavioral — claim wrapper', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('refuses a malformed token WITHOUT calling the RPC', async () => {
    const res = await claimMasterProfile('A+B')
    expect(res).toMatchObject({ ok: false, code: 'invalid_token', masterId: null })
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('returns the master id on success and on the winner-idempotent repeat', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, code: 'claimed', data: { master_id: 'm-1', master_name: 'Jan' } },
      error: null,
    })
    const first = await claimMasterProfile(TOKEN)
    expect(rpcMock).toHaveBeenCalledWith('public_claim_master_profile', {
      p_token: TOKEN,
    })
    expect(first).toMatchObject({ ok: true, code: 'claimed', masterId: 'm-1' })

    rpcMock.mockResolvedValue({
      data: { ok: true, code: 'already_claimed_by_you', data: { master_id: 'm-1' } },
      error: null,
    })
    const repeat = await claimMasterProfile(TOKEN)
    expect(repeat).toMatchObject({
      ok: true,
      code: 'already_claimed_by_you',
      masterId: 'm-1',
    })
  })
  it('maps stable negatives and never fabricates a master id', async () => {
    for (const code of [
      'not_authenticated',
      'expired',
      'revoked',
      'already_claimed',
      'master_not_eligible',
      'user_already_master',
    ]) {
      rpcMock.mockResolvedValue({ data: { ok: false, code }, error: null })
      const res = await claimMasterProfile(TOKEN)
      expect(res).toMatchObject({ ok: false, code, masterId: null })
      expect(res.message.length).toBeGreaterThan(0)
    }
  })
  it('collapses transport errors and unknown codes to unexpected_error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await claimMasterProfile(TOKEN)).code).toBe('unexpected_error')

    rpcMock.mockResolvedValue({ data: { ok: true, code: 'weird' }, error: null })
    const res = await claimMasterProfile(TOKEN)
    expect(res.code).toBe('unexpected_error')
    expect(res.ok).toBe(false)
  })
})
