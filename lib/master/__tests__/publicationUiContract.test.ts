// SP-039 Slice 4C2-App — application-boundary contracts for the publication
// UI, enforced by scanning the source tree (node env; no rendering):
//   * no direct writes to the publication tables anywhere in the app;
//   * the M10 RPC names live ONLY in the central contract module;
//   * the M9 visibility helper is called ONLY through the server boundary;
//   * no service-role usage; no claim-token fields in publication UI.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLICATION_TRANSITION_RPCS } from '../publicationTransitions'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const sources = [...walk('app'), ...walk('components'), ...walk('lib')].map(
  (path) => ({ path: path.replace(/\\/g, '/'), text: readFileSync(path, 'utf8') })
)
const nonTestSources = sources.filter((f) => !f.path.includes('__tests__'))

describe('publication tables are read-only from the app', () => {
  it('no file reading master_publication* also writes anywhere', () => {
    const offenders = nonTestSources.filter(
      (f) =>
        (f.text.includes("from('master_publication')") ||
          f.text.includes("from('master_publication_events')")) &&
        /\.(insert|update|upsert|delete)\(/.test(f.text)
    )
    expect(offenders.map((f) => f.path)).toEqual([])
  })
})

describe('RPC names are centralized', () => {
  it('the seven M10 names appear only in the contract module', () => {
    for (const name of Object.values(PUBLICATION_TRANSITION_RPCS)) {
      const offenders = nonTestSources.filter(
        (f) =>
          f.text.includes(`'${name}'`) &&
          f.path !== 'lib/master/publicationTransitions.ts'
      )
      expect(offenders.map((f) => f.path)).toEqual([])
    }
  })
  it('the M9 visibility helper is called only via the server boundary', () => {
    const offenders = nonTestSources.filter(
      (f) =>
        f.text.includes("'is_master_publicly_visible'") &&
        f.path !== 'lib/master/publicationServer.ts'
    )
    expect(offenders.map((f) => f.path)).toEqual([])
  })
})

describe('privilege and secrecy hygiene', () => {
  it('no service-role usage anywhere in the app sources', () => {
    const offenders = nonTestSources.filter((f) =>
      /service_role|SERVICE_ROLE/.test(f.text)
    )
    expect(offenders.map((f) => f.path)).toEqual([])
  })
  it('publication UI never touches claim-token fields', () => {
    const publicationUi = nonTestSources.filter(
      (f) =>
        f.path.includes('/publication') ||
        f.path.includes('Publication') ||
        f.path.includes('publicationView') ||
        f.path.includes('publicationServer')
    )
    expect(publicationUi.length).toBeGreaterThanOrEqual(8)
    for (const f of publicationUi) {
      expect(f.text, f.path).not.toMatch(/token_hash|token_prefix|raw_token/)
    }
  })
  it('the moderator note field is bounded to the database contract', () => {
    const controls = readFileSync(
      'components/admin/PublicationModerationControls.tsx',
      'utf8'
    )
    expect(controls).toContain('maxLength={2000}')
  })
})

describe('owner actions never accept a master id from the client', () => {
  it('owner publication actions resolve the id from auth only', () => {
    const actions = readFileSync('app/(main)/studio/publicationActions.ts', 'utf8')
    expect(actions).toContain("eq('user_id', user.id)")
    expect(actions).not.toMatch(/masterId\s*:/)
    expect(actions).not.toMatch(/p_master_id/)
  })
})
