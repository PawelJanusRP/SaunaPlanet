import { describe, expect, it } from 'vitest'
import { fetchFacilityImage, signatureFormat, IMAGE_MAX_BYTES } from '../imageFetch'
import { makeTransport } from './helpers'

const PUBLIC_IP = ['93.184.216.34']

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])

function imageTransport(routes: Record<string, { body: Uint8Array[]; contentType?: string; status?: number; headers?: Record<string, string> }>, dns: Record<string, string[]> = { 'img.example.pl': PUBLIC_IP }) {
  const fakeRoutes: Record<string, { body: Uint8Array[]; headers: Record<string, string>; status?: number }> = {}
  for (const [url, r] of Object.entries(routes)) {
    fakeRoutes[url] = {
      body: r.body,
      status: r.status,
      headers: { 'content-type': r.contentType ?? 'image/jpeg', ...(r.headers ?? {}) },
    }
  }
  return makeTransport({ dns, routes: fakeRoutes })
}

describe('signatureFormat', () => {
  it('recognizes exactly JPEG, PNG and WebP', () => {
    expect(signatureFormat(JPEG)).toBe('jpg')
    expect(signatureFormat(PNG)).toBe('png')
    expect(signatureFormat(WEBP)).toBe('webp')
    expect(signatureFormat(GIF)).toBeNull()
    expect(signatureFormat(new TextEncoder().encode('<svg xmlns="..."/>'))).toBeNull()
    expect(signatureFormat(new Uint8Array([]))).toBeNull()
  })
})

describe('fetchFacilityImage', () => {
  it('accepts JPEG, PNG and WebP with matching declared type and signature', async () => {
    for (const [bytes, contentType, format] of [
      [JPEG, 'image/jpeg', 'jpg'],
      [PNG, 'image/png', 'png'],
      [WEBP, 'image/webp', 'webp'],
    ] as const) {
      const transport = imageTransport({ 'https://img.example.pl/a': { body: [bytes], contentType } })
      const result = await fetchFacilityImage('https://img.example.pl/a', { transport })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.format).toBe(format)
        expect(result.bytes).toEqual(bytes)
      }
    }
  })

  it('rejects SVG and GIF at the content-type gate', async () => {
    for (const contentType of ['image/svg+xml', 'image/gif']) {
      const transport = imageTransport({ 'https://img.example.pl/a': { body: [GIF], contentType } })
      const result = await fetchFacilityImage('https://img.example.pl/a', { transport })
      expect(result).toMatchObject({ ok: false, code: 'unsupported-content-type' })
    }
  })

  it('rejects a declared/signature mismatch (lying Content-Type)', async () => {
    const transport = imageTransport({ 'https://img.example.pl/a': { body: [JPEG], contentType: 'image/png' } })
    const result = await fetchFacilityImage('https://img.example.pl/a', { transport })
    expect(result).toMatchObject({ ok: false, code: 'image-signature-mismatch' })
  })

  it('rejects allowed content-type with a non-image body (e.g. GIF bytes)', async () => {
    const transport = imageTransport({ 'https://img.example.pl/a': { body: [GIF], contentType: 'image/png' } })
    const result = await fetchFacilityImage('https://img.example.pl/a', { transport })
    expect(result).toMatchObject({ ok: false, code: 'unsupported-content-type' })
  })

  it('caps the streamed response size', async () => {
    const big = new Uint8Array(64).fill(0x00)
    big.set([0xff, 0xd8, 0xff])
    const transport = imageTransport({ 'https://img.example.pl/a': { body: [big] } })
    const result = await fetchFacilityImage('https://img.example.pl/a', { transport, maxBytes: 16 })
    expect(result).toMatchObject({ ok: false, code: 'response-too-large' })
    expect(IMAGE_MAX_BYTES).toBe(5_000_000) // documented default
  })

  it('blocks redirects that resolve to private addresses', async () => {
    const transport = imageTransport(
      {
        'https://img.example.pl/a': {
          body: [],
          status: 302,
          headers: { location: 'https://internal.example.pl/secret.jpg' },
        },
      },
      { 'img.example.pl': PUBLIC_IP, 'internal.example.pl': ['10.0.0.1'] }
    )
    const result = await fetchFacilityImage('https://img.example.pl/a', { transport })
    expect(result).toMatchObject({ ok: false, code: 'blocked-address' })
  })

  it('rejects http, credentialed and malformed URLs before any request', async () => {
    const transport = imageTransport({})
    for (const url of ['http://img.example.pl/a', 'https://u:p@img.example.pl/a', 'nope']) {
      const result = await fetchFacilityImage(url, { transport })
      expect(result.ok).toBe(false)
    }
  })

  it('percent-encodes a space in the URL and fetches the encoded target', async () => {
    const log: string[] = []
    const transport = makeTransport(
      {
        dns: { 'img.example.pl': PUBLIC_IP },
        routes: {
          'https://img.example.pl/Projekt%20bez%20nazwy%20(2).jpg': {
            body: [JPEG],
            headers: { 'content-type': 'image/jpeg' },
          },
        },
      },
      log
    )
    const result = await fetchFacilityImage('https://img.example.pl/Projekt bez nazwy (2).jpg', { transport })
    expect(result.ok).toBe(true)
    expect(log[0]).toBe('https://img.example.pl/Projekt%20bez%20nazwy%20(2).jpg')
  })
})
