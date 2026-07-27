import { describe, expect, it } from 'vitest'
import { safeFetchHtml } from '../safeFetch'
import { makeTransport } from './helpers'

const PUBLIC_IP = ['93.184.216.34']

describe('safeFetchHtml', () => {
  it('fetches a public HTML page', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: { 'https://example.pl/': { body: '<html><title>Sauna</title></html>' } },
    })
    const result = await safeFetchHtml('https://example.pl/', { transport })
    expect(result).toMatchObject({ ok: true, status: 200, finalUrl: 'https://example.pl/' })
    if (result.ok) expect(result.html).toContain('Sauna')
  })

  it('blocks hosts that resolve to private addresses', async () => {
    const transport = makeTransport({ dns: { 'evil.example.pl': ['10.0.0.5'] }, routes: {} })
    expect(await safeFetchHtml('https://evil.example.pl/', { transport })).toEqual({
      ok: false,
      code: 'blocked-address',
    })
  })

  it('blocks hosts where ANY resolved address is private (rebinding-style split answers)', async () => {
    const transport = makeTransport({
      dns: { 'split.example.pl': ['93.184.216.34', '192.168.0.10'] },
      routes: {},
    })
    expect(await safeFetchHtml('https://split.example.pl/', { transport })).toEqual({
      ok: false,
      code: 'blocked-address',
    })
  })

  it('rejects localhost and private IP literals without touching the network', async () => {
    const transport = makeTransport({ dns: {}, routes: {} })
    expect(await safeFetchHtml('https://localhost/x', { transport })).toEqual({ ok: false, code: 'blocked-host' })
    expect(await safeFetchHtml('https://127.0.0.1/x', { transport })).toEqual({ ok: false, code: 'blocked-address' })
    expect(await safeFetchHtml('http://example.pl/', { transport })).toEqual({ ok: false, code: 'insecure-protocol' })
    expect(await safeFetchHtml('https://u:p@example.pl/', { transport })).toEqual({
      ok: false,
      code: 'credentials-in-url',
    })
  })

  it('follows a valid redirect and returns the final URL', async () => {
    const transport = makeTransport({
      dns: { 'old.example.pl': PUBLIC_IP, 'new.example.pl': PUBLIC_IP },
      routes: {
        'https://old.example.pl/': { status: 301, headers: { location: 'https://new.example.pl/sauna' } },
        'https://new.example.pl/sauna': { body: '<html>ok</html>' },
      },
    })
    const result = await safeFetchHtml('https://old.example.pl/', { transport })
    expect(result).toMatchObject({ ok: true, finalUrl: 'https://new.example.pl/sauna' })
  })

  it('rejects a redirect to a private destination', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP, 'internal.example.pl': ['192.168.1.10'] },
      routes: {
        'https://example.pl/': { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } },
        'https://example.pl/dns': { status: 302, headers: { location: 'https://internal.example.pl/' } },
      },
    })
    expect(await safeFetchHtml('https://example.pl/', { transport })).toEqual({ ok: false, code: 'invalid-redirect' })
    expect(await safeFetchHtml('https://example.pl/dns', { transport })).toEqual({
      ok: false,
      code: 'blocked-address',
    })
  })

  it('rejects a redirect downgrading to http', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: { 'https://example.pl/': { status: 301, headers: { location: 'http://example.pl/' } } },
    })
    expect(await safeFetchHtml('https://example.pl/', { transport })).toEqual({ ok: false, code: 'invalid-redirect' })
  })

  it('enforces the redirect limit', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: {
        'https://example.pl/1': { status: 302, headers: { location: 'https://example.pl/2' } },
        'https://example.pl/2': { status: 302, headers: { location: 'https://example.pl/3' } },
        'https://example.pl/3': { status: 302, headers: { location: 'https://example.pl/4' } },
        'https://example.pl/4': { status: 302, headers: { location: 'https://example.pl/5' } },
      },
    })
    expect(await safeFetchHtml('https://example.pl/1', { transport, maxRedirects: 3 })).toEqual({
      ok: false,
      code: 'too-many-redirects',
    })
  })

  it('rejects oversized responses (streamed body over the cap)', async () => {
    const bigChunk = new TextEncoder().encode('x'.repeat(600))
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: { 'https://example.pl/': { body: [bigChunk, bigChunk] } },
    })
    expect(await safeFetchHtml('https://example.pl/', { transport, maxBytes: 1000 })).toEqual({
      ok: false,
      code: 'response-too-large',
    })
  })

  it('rejects oversized responses early via content-length', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: { 'https://example.pl/': { headers: { 'content-length': '5000000' }, body: 'small' } },
    })
    expect(await safeFetchHtml('https://example.pl/', { transport, maxBytes: 1000 })).toEqual({
      ok: false,
      code: 'response-too-large',
    })
  })

  it('rejects unsupported content types', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: {
        'https://example.pl/api': { headers: { 'content-type': 'application/json' }, body: '{}' },
        'https://example.pl/img': { headers: { 'content-type': 'image/png' }, body: 'PNG' },
      },
    })
    expect(await safeFetchHtml('https://example.pl/api', { transport })).toEqual({
      ok: false,
      code: 'unsupported-content-type',
    })
    expect(await safeFetchHtml('https://example.pl/img', { transport })).toEqual({
      ok: false,
      code: 'unsupported-content-type',
    })
  })

  it('returns http-status for non-2xx responses', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: { 'https://example.pl/missing': { status: 404, body: 'nope' } },
    })
    expect(await safeFetchHtml('https://example.pl/missing', { transport })).toEqual({
      ok: false,
      code: 'http-status',
      status: 404,
    })
  })

  it('times out hung requests', async () => {
    const transport = makeTransport({
      dns: { 'example.pl': PUBLIC_IP },
      routes: { 'https://example.pl/slow': { hang: true } },
    })
    expect(await safeFetchHtml('https://example.pl/slow', { transport, timeoutMs: 30 })).toEqual({
      ok: false,
      code: 'timeout',
    })
  })

  it('returns dns-error when resolution fails', async () => {
    const transport = makeTransport({ dns: {}, routes: {} })
    expect(await safeFetchHtml('https://unknown.example.pl/', { transport })).toEqual({
      ok: false,
      code: 'dns-error',
    })
  })
})
