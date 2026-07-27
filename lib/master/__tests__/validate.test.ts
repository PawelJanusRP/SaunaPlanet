import { describe, expect, it } from 'vitest'
import {
  normalizeCity,
  normalizeLanguages,
  normalizeSpecialties,
  sanitizeWebsiteUrl,
  validateExperienceYear,
} from '../validate'

describe('sanitizeWebsiteUrl', () => {
  it('accepts https URLs and normalizes serialization', () => {
    expect(sanitizeWebsiteUrl('https://saunamistrz.pl/oferta')).toEqual({
      ok: true,
      value: 'https://saunamistrz.pl/oferta',
    })
    expect(sanitizeWebsiteUrl('  https://saunamistrz.pl  ')).toEqual({
      ok: true,
      value: 'https://saunamistrz.pl/',
    })
  })

  it('turns blank into null', () => {
    expect(sanitizeWebsiteUrl('')).toEqual({ ok: true, value: null })
    expect(sanitizeWebsiteUrl('   ')).toEqual({ ok: true, value: null })
    expect(sanitizeWebsiteUrl(null)).toEqual({ ok: true, value: null })
    expect(sanitizeWebsiteUrl(undefined)).toEqual({ ok: true, value: null })
  })

  it('rejects http, credentials, odd ports, malformed input', () => {
    expect(sanitizeWebsiteUrl('http://saunamistrz.pl')).toMatchObject({ ok: false, reason: 'not-https' })
    expect(sanitizeWebsiteUrl('https://u:p@saunamistrz.pl')).toMatchObject({ ok: false, reason: 'credentials' })
    expect(sanitizeWebsiteUrl('https://saunamistrz.pl:8443')).toMatchObject({ ok: false, reason: 'port' })
    expect(sanitizeWebsiteUrl('not a url')).toMatchObject({ ok: false, reason: 'invalid-url' })
  })

  it('accepts the explicit default port', () => {
    expect(sanitizeWebsiteUrl('https://saunamistrz.pl:443/x').ok).toBe(true)
  })
})

describe('normalizeSpecialties', () => {
  it('trims, dedupes and keeps only vocabulary ids', () => {
    expect(
      normalizeSpecialties([' classic-aufguss ', 'classic-aufguss', 'show-aufguss', 'nonsense', ''])
    ).toEqual(['classic-aufguss', 'show-aufguss'])
  })

  it('normalizes empty results to null', () => {
    expect(normalizeSpecialties([])).toBeNull()
    expect(normalizeSpecialties(['nonsense', ''])).toBeNull()
    expect(normalizeSpecialties(null)).toBeNull()
    expect(normalizeSpecialties(undefined)).toBeNull()
  })

  it('caps the item count at 12', () => {
    const all = [
      'classic-aufguss', 'show-aufguss', 'relaxation-ceremony', 'herbal-ceremony',
      'meditation-ceremony', 'peeling-ritual', 'cosmetic-ritual', 'sound-ceremony',
      'themed-ceremony', 'competition-ceremony', 'large-event-hosting', 'training-workshops',
    ]
    expect(normalizeSpecialties([...all, ...all])).toHaveLength(12)
  })
})

describe('normalizeLanguages', () => {
  it('lowercases stable codes and dedupes', () => {
    expect(normalizeLanguages(['PL', 'pl', ' EN '])).toEqual(['pl', 'en'])
  })

  it('rejects invalid codes and empty results become null', () => {
    expect(normalizeLanguages(['polski!', 'x', '123', ''])).toBeNull()
    expect(normalizeLanguages([])).toBeNull()
  })

  it('caps at 8 entries', () => {
    const many = ['pl', 'en', 'de', 'uk', 'cs', 'sk', 'fr', 'es', 'it', 'pt']
    expect(normalizeLanguages(many)).toHaveLength(8)
  })
})

describe('normalizeCity', () => {
  it('collapses whitespace and blanks to null', () => {
    expect(normalizeCity('  Zielona   Góra  ')).toBe('Zielona Góra')
    expect(normalizeCity('   ')).toBeNull()
    expect(normalizeCity(null)).toBeNull()
  })
})

describe('validateExperienceYear', () => {
  it('accepts a valid year and empty as null', () => {
    expect(validateExperienceYear(2018, 2026)).toEqual({ ok: true, value: 2018 })
    expect(validateExperienceYear('2018', 2026)).toEqual({ ok: true, value: 2018 })
    expect(validateExperienceYear(null, 2026)).toEqual({ ok: true, value: null })
    expect(validateExperienceYear('', 2026)).toEqual({ ok: true, value: null })
  })

  it('rejects future years against the ACTUAL current year (app-side rule)', () => {
    expect(validateExperienceYear(2027, 2026)).toMatchObject({ ok: false, reason: 'future' })
    expect(validateExperienceYear(2026, 2026).ok).toBe(true)
  })

  it('rejects pre-1980 and non-integers', () => {
    expect(validateExperienceYear(1979, 2026)).toMatchObject({ ok: false, reason: 'too-early' })
    expect(validateExperienceYear('kiedyś', 2026)).toMatchObject({ ok: false, reason: 'not-a-year' })
    expect(validateExperienceYear(2018.5, 2026)).toMatchObject({ ok: false, reason: 'not-a-year' })
  })
})
