import { describe, expect, it } from 'vitest'
import {
  extractDraftCore,
  IMPORT_RATE_LIMIT,
  toDbSourceKind,
  type DuplicateCandidate,
  type ExtractDraftDeps,
  type ImportLogRecord,
} from '../actionCore'
import { extractFacilityFromUrl } from '../index'
import type { ProviderResult } from '../types'
import { makeTransport } from './helpers'

const HTML_MARKER = 'RAW-HTML-MARKER-9f2c'
const PUBLIC_IP = ['93.184.216.34']

const OK_EXTRACTION: ProviderResult = {
  ok: true,
  kind: 'website',
  requestedUrl: 'https://saunalesna.pl/',
  finalUrl: 'https://saunalesna.pl/',
  draft: {
    name: { value: 'Sauna Leśna', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD LocalBusiness.name' },
    website: { value: 'https://saunalesna.pl', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD LocalBusiness.url' },
    phone: { value: '+48 600 100 200', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD LocalBusiness.telephone' },
    geo: { value: { latitude: 52.4, longitude: 16.9 }, origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD LocalBusiness.geo' },
  },
  warnings: [],
  result: 'ok',
}

type DepsOverrides = Partial<ExtractDraftDeps> & { extraction?: ProviderResult }

function makeDeps(overrides: DepsOverrides = {}) {
  const logs: ImportLogRecord[] = []
  const duplicateCalls: unknown[] = []
  const deps: ExtractDraftDeps = {
    getUserId: overrides.getUserId ?? (async () => 'user-1'),
    countRecentImports: overrides.countRecentImports ?? (async () => 0),
    insertImportLog:
      overrides.insertImportLog ??
      (async (record) => {
        logs.push(record)
      }),
    extract: overrides.extract ?? (async () => overrides.extraction ?? OK_EXTRACTION),
    findDuplicates:
      overrides.findDuplicates ??
      (async (params) => {
        duplicateCalls.push(params)
        return []
      }),
  }
  return { deps, logs, duplicateCalls }
}

describe('extractDraftCore', () => {
  it('rejects unauthenticated callers without logging or fetching', async () => {
    let extracted = false
    const { deps, logs } = makeDeps({
      getUserId: async () => null,
      extract: async () => {
        extracted = true
        return OK_EXTRACTION
      },
    })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result).toMatchObject({ ok: false, code: 'unauthenticated' })
    expect(logs).toEqual([])
    expect(extracted).toBe(false)
  })

  it('allows extraction below the rate limit', async () => {
    const { deps, logs } = makeDeps({ countRecentImports: async () => IMPORT_RATE_LIMIT - 1 })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result.ok).toBe(true)
    expect(logs).toHaveLength(1)
  })

  it('rejects at the rate limit without writing a log row', async () => {
    let extracted = false
    const { deps, logs } = makeDeps({
      countRecentImports: async () => IMPORT_RATE_LIMIT,
      extract: async () => {
        extracted = true
        return OK_EXTRACTION
      },
    })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result).toMatchObject({ ok: false, code: 'rate-limited' })
    expect(logs).toEqual([])
    expect(extracted).toBe(false)
  })

  it('logs failed attempts (they count toward the limit)', async () => {
    const { deps, logs } = makeDeps({
      extraction: { ok: false, kind: 'website', requestedUrl: 'https://saunalesna.pl/', code: 'timeout' },
    })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result).toMatchObject({ ok: false, code: 'fetch-failed' })
    expect(logs).toEqual([
      {
        source_kind: 'website',
        url: 'https://saunalesna.pl/',
        result: 'failed',
        extracted: { appSourceKind: 'website', errorCode: 'timeout' },
      },
    ])
  })

  it('logs blocked attempts as blocked without exposing SSRF details to the client', async () => {
    const { deps, logs } = makeDeps({
      extraction: { ok: false, kind: 'website', requestedUrl: 'https://saunalesna.pl/', code: 'blocked-address' },
    })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result).toMatchObject({ ok: false, code: 'fetch-blocked' })
    expect(JSON.stringify(result)).not.toContain('blocked-address')
    expect(logs[0]).toMatchObject({ result: 'blocked', extracted: { errorCode: 'blocked-address' } })
  })

  it('logs a successful website extraction as ok with the normalized URL', async () => {
    const { deps, logs } = makeDeps()
    const result = await extractDraftCore('https://SaunaLesna.PL/?utm_source=fb&fbclid=x', deps)
    expect(result.ok).toBe(true)
    expect(logs[0].url).toBe('https://saunalesna.pl/') // normalized: lowercase, tracking stripped
    expect(logs[0].result).toBe('ok')
    expect(logs[0].source_kind).toBe('website')
  })

  it('logs partial extractions as partial', async () => {
    const { deps, logs } = makeDeps({
      extraction: { ...OK_EXTRACTION, draft: {}, result: 'partial' },
    })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result).toMatchObject({ ok: true, result: 'partial' })
    expect(logs[0].result).toBe('partial')
  })

  it('logs unsupported sources safely, preserving the app-level kind', async () => {
    const { deps, logs } = makeDeps()
    const result = await extractDraftCore('https://maps.app.goo.gl/AbCdEf', deps)
    expect(result).toMatchObject({
      ok: false,
      code: 'unsupported-source',
      sourceKind: 'google_maps',
      requestedUrl: 'https://maps.app.goo.gl/AbCdEf',
    })
    expect(logs).toEqual([
      {
        source_kind: 'other', // DB vocabulary until the Slice 3 migration
        url: 'https://maps.app.goo.gl/AbCdEf',
        result: 'blocked',
        extracted: { appSourceKind: 'google_maps', reason: 'unsupported-source' },
      },
    ])
  })

  it('maps app source kinds onto the current DB vocabulary', () => {
    expect(toDbSourceKind('website')).toBe('website')
    expect(toDbSourceKind('facebook_page')).toBe('facebook_page')
    expect(toDbSourceKind('facebook_post')).toBe('facebook_page')
    expect(toDbSourceKind('facebook_event')).toBe('facebook_event')
    expect(toDbSourceKind('instagram_profile')).toBe('instagram')
    expect(toDbSourceKind('instagram_post')).toBe('instagram')
    expect(toDbSourceKind('google_maps')).toBe('other')
    expect(toDbSourceKind('unsupported')).toBe('other')
  })

  it('does not log purely local validation failures', async () => {
    const { deps, logs } = makeDeps()
    for (const raw of ['http://insecure.pl', 'not a url', 'https://u:p@x.pl', 'https://x.pl:8080/']) {
      const result = await extractDraftCore(raw, deps)
      expect(result).toMatchObject({ ok: false, code: 'invalid-url' })
    }
    expect(logs).toEqual([])
  })

  it('never returns or persists raw HTML (end-to-end with the real engine)', async () => {
    const html = `<html><head><title>Sauna Górska</title><!-- ${HTML_MARKER} --></head><body>${HTML_MARKER}</body></html>`
    const transport = makeTransport({
      dns: { 'saunagorska.pl': PUBLIC_IP },
      routes: { 'https://saunagorska.pl/': { body: html } },
    })
    const { deps, logs } = makeDeps({
      extract: (url) => extractFacilityFromUrl(url, { transport }),
    })
    const result = await extractDraftCore('https://saunagorska.pl/', deps)
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain(HTML_MARKER)
    expect(JSON.stringify(logs)).not.toContain(HTML_MARKER)
    if (result.ok) expect(result.draft.name?.value).toBe('Sauna Górska')
  })

  it('returns a serializable result (plain JSON round-trip)', async () => {
    const { deps } = makeDeps()
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('runs duplicate detection with the best extracted values', async () => {
    const { deps, duplicateCalls } = makeDeps()
    await extractDraftCore('https://saunalesna.pl/', deps)
    expect(duplicateCalls).toEqual([
      {
        name: 'Sauna Leśna',
        lat: 52.4,
        lng: 16.9,
        website: 'https://saunalesna.pl',
        phone: '+48 600 100 200',
        sourceUrl: 'https://saunalesna.pl/',
      },
    ])
  })

  it('attaches duplicate candidates to the success result', async () => {
    const candidates: DuplicateCandidate[] = [
      { id: 'x', name: 'Sauna Leśna', city: 'Poznań', status: 'active', distance_m: 120, match_reasons: ['name'] },
    ]
    const { deps } = makeDeps({ findDuplicates: async () => candidates })
    const result = await extractDraftCore('https://saunalesna.pl/', deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.duplicates).toEqual(candidates)
  })
})
