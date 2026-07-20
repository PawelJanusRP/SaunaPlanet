import { describe, expect, it } from 'vitest'
import { normalizeImportUrl } from '../normalizeUrl'

function normalized(raw: string): string {
  const result = normalizeImportUrl(raw)
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`)
  return result.url
}

describe('normalizeImportUrl', () => {
  it('removes tracking parameters and keeps content parameters', () => {
    expect(normalized('https://example.pl/oferta?utm_source=fb&utm_campaign=x&id=5&fbclid=abc&gclid=1')).toBe(
      'https://example.pl/oferta?id=5'
    )
    expect(normalized('https://example.pl/?page=2&UTM_Medium=mail')).toBe('https://example.pl/?page=2')
  })

  it('lowercases the hostname and removes the default port', () => {
    expect(normalized('https://Example.PL:443/Path')).toBe('https://example.pl/Path')
  })

  it('removes fragments', () => {
    expect(normalized('https://example.pl/kontakt#godziny')).toBe('https://example.pl/kontakt')
  })

  it('normalizes trailing slashes on non-root paths and sorts query params', () => {
    expect(normalized('https://example.pl/sauna/')).toBe('https://example.pl/sauna')
    expect(normalized('https://example.pl/')).toBe('https://example.pl/')
    expect(normalized('https://example.pl/x?b=2&a=1')).toBe('https://example.pl/x?a=1&b=2')
  })

  it('rejects embedded credentials', () => {
    expect(normalizeImportUrl('https://user:secret@example.pl')).toEqual({ ok: false, code: 'credentials-in-url' })
    expect(normalizeImportUrl('https://user@example.pl')).toEqual({ ok: false, code: 'credentials-in-url' })
  })

  it('rejects non-https protocols', () => {
    expect(normalizeImportUrl('http://example.pl')).toEqual({ ok: false, code: 'insecure-protocol' })
    expect(normalizeImportUrl('ftp://example.pl')).toEqual({ ok: false, code: 'insecure-protocol' })
    expect(normalizeImportUrl('data:text/html,hi')).toEqual({ ok: false, code: 'insecure-protocol' })
  })

  it('rejects nonstandard ports and garbage input', () => {
    expect(normalizeImportUrl('https://example.pl:8080/x')).toEqual({ ok: false, code: 'blocked-port' })
    expect(normalizeImportUrl('')).toEqual({ ok: false, code: 'invalid-url' })
    expect(normalizeImportUrl('   ')).toEqual({ ok: false, code: 'invalid-url' })
  })
})
