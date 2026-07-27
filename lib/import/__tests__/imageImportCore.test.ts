import { describe, expect, it } from 'vitest'
import { importSubmissionImageCore, type ImageImportDeps } from '../imageImportCore'
import type { ImageFetchResult } from '../imageFetch'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03])

const FETCH_OK: ImageFetchResult = {
  ok: true,
  bytes: JPEG,
  format: 'jpg',
  contentType: 'image/jpeg',
  finalUrl: 'https://img.example.pl/a.jpg',
}

type Calls = { fetch: string[]; upload: string[]; attach: string[]; cover: string[] }

function makeDeps(overrides: Partial<ImageImportDeps> = {}) {
  const calls: Calls = { fetch: [], upload: [], attach: [], cover: [] }
  const deps: ImageImportDeps = {
    getUserId: overrides.getUserId ?? (async () => 'user-1'),
    getImportRecord:
      overrides.getImportRecord ??
      (async () => ({ saunaId: 'sauna-1', imageUrl: 'https://img.example.pl/a.jpg' })),
    fetchImage:
      overrides.fetchImage ??
      (async (url) => {
        calls.fetch.push(url)
        return FETCH_OK
      }),
    uploadImage:
      overrides.uploadImage ??
      (async (path) => {
        calls.upload.push(path)
        return `https://storage.example/public/sauna-images/${path}`
      }),
    attachPhoto:
      overrides.attachPhoto ??
      (async (saunaId, publicUrl) => {
        calls.attach.push(`${saunaId}|${publicUrl}`)
        return 'photo-1'
      }),
    setCoverIfEmpty:
      overrides.setCoverIfEmpty ??
      (async (saunaId) => {
        calls.cover.push(saunaId)
        return true
      }),
  }
  return { deps, calls }
}

describe('importSubmissionImageCore', () => {
  it('imports, attaches and sets the empty cover on the happy path', async () => {
    const { deps, calls } = makeDeps()
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: true, photoId: 'photo-1', coverSet: true })
    // Server-side URL retrieval: the fetch used the LOG's URL, not client input.
    expect(calls.fetch).toEqual(['https://img.example.pl/a.jpg'])
    // Filename: verified bytes hash + verified extension, under imported/.
    expect(calls.upload).toHaveLength(1)
    expect(calls.upload[0]).toMatch(/^imported\/sauna-1\/og-[0-9a-f]{16}\.jpg$/)
    expect(calls.attach[0]).toContain('sauna-1|https://storage.example/')
  })

  it('reports coverSet false without failing when a cover already exists', async () => {
    const { deps } = makeDeps({ setCoverIfEmpty: async () => false })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: true, coverSet: false })
  })

  it('refuses anonymous callers without touching the network', async () => {
    const { deps, calls } = makeDeps({ getUserId: async () => null })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: false, reason: 'not-available' })
    expect(calls.fetch).toEqual([])
  })

  it('refuses when the log is missing, unowned or not linked to this sauna', async () => {
    for (const record of [
      null,
      { saunaId: null, imageUrl: 'https://img.example.pl/a.jpg' },
      { saunaId: 'sauna-OTHER', imageUrl: 'https://img.example.pl/a.jpg' },
    ]) {
      const { deps, calls } = makeDeps({ getImportRecord: async () => record })
      const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
      expect(result).toMatchObject({ ok: false, reason: 'not-available' })
      expect(calls.fetch).toEqual([])
    }
  })

  it('refuses when the log has no extracted image', async () => {
    const { deps } = makeDeps({ getImportRecord: async () => ({ saunaId: 'sauna-1', imageUrl: null }) })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: false, reason: 'not-available' })
  })

  it('maps SSRF/security refusals to a generic fetch failure without leaking codes', async () => {
    const { deps, calls } = makeDeps({ fetchImage: async () => ({ ok: false, code: 'blocked-address' }) })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: false, reason: 'fetch-failed' })
    if (!result.ok) expect(result.message).not.toContain('blocked-address')
    expect(calls.upload).toEqual([])
  })

  it('maps format problems to unsupported-image', async () => {
    for (const code of ['unsupported-content-type', 'image-signature-mismatch'] as const) {
      const { deps } = makeDeps({ fetchImage: async () => ({ ok: false, code }) })
      const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
      expect(result).toMatchObject({ ok: false, reason: 'unsupported-image' })
    }
  })

  it('stops at upload failure without attaching or touching the cover', async () => {
    const { deps, calls } = makeDeps({ uploadImage: async () => null })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: false, reason: 'upload-failed' })
    expect(calls.attach).toEqual([])
    expect(calls.cover).toEqual([])
  })

  it('stops at attach failure without touching the cover', async () => {
    const { deps, calls } = makeDeps({ attachPhoto: async () => null })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result).toMatchObject({ ok: false, reason: 'attach-failed' })
    expect(calls.cover).toEqual([])
  })

  it('every failure is a structured user-safe result (facility submission unaffected)', async () => {
    const { deps } = makeDeps({ fetchImage: async () => ({ ok: false, code: 'timeout' }) })
    const result = await importSubmissionImageCore('log-1', 'sauna-1', deps)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.message).toBe('string')
      expect(result.message.length).toBeGreaterThan(0)
    }
  })
})
