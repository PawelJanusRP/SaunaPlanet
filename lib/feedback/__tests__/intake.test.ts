import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CORRECTION_CATEGORIES,
  FEEDBACK_ERROR_CODES,
  FEEDBACK_MESSAGE_MAX,
  categoryAcceptsProposedValue,
  parseCoordinatesInput,
  validateCorrectionInput,
} from '../intake'

const SAUNA_ID = '3e206471-1111-2222-3333-444455556666'

const base = {
  saunaId: SAUNA_ID,
  category: 'address',
  message: 'The address of this facility is wrong.',
}

describe('validateCorrectionInput', () => {
  it('accepts a minimal valid correction', () => {
    const r = validateCorrectionInput(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.category).toBe('address')
      expect(r.value.proposedValue).toBeNull()
      expect(r.value.contactEmail).toBeNull()
    }
  })

  it('rejects a non-UUID sauna id', () => {
    const r = validateCorrectionInput({ ...base, saunaId: 'not-a-uuid' })
    expect(r).toEqual({ ok: false, code: 'invalid-input' })
  })

  it('rejects an unknown category', () => {
    const r = validateCorrectionInput({ ...base, category: 'hacked' })
    expect(r).toEqual({ ok: false, code: 'category-required' })
  })

  it('accepts every canonical category', () => {
    for (const category of CORRECTION_CATEGORIES) {
      expect(validateCorrectionInput({ ...base, category }).ok).toBe(true)
    }
  })

  it('rejects too-short and too-long messages', () => {
    expect(validateCorrectionInput({ ...base, message: 'short' })).toEqual({
      ok: false,
      code: 'message-too-short',
    })
    expect(
      validateCorrectionInput({ ...base, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) })
    ).toEqual({ ok: false, code: 'message-too-long' })
  })

  it('trims and normalizes an optional contact email', () => {
    const r = validateCorrectionInput({ ...base, contactEmail: '  user@example.com  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.contactEmail).toBe('user@example.com')
  })

  it('rejects malformed emails', () => {
    for (const bad of ['nope', 'a@b', 'with space@example.com', '@example.com']) {
      expect(validateCorrectionInput({ ...base, contactEmail: bad })).toEqual({
        ok: false,
        code: 'email-invalid',
      })
    }
  })

  it('empty email means null, not an error', () => {
    const r = validateCorrectionInput({ ...base, contactEmail: '   ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.contactEmail).toBeNull()
  })

  it('carries a text proposed value for mapped categories', () => {
    const r = validateCorrectionInput({ ...base, proposedValue: ' Poznańska 12 ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.proposedValue).toBe('Poznańska 12')
  })

  it('rejects a proposed value on message-only categories', () => {
    for (const category of ['photo', 'closed', 'duplicate', 'other']) {
      expect(categoryAcceptsProposedValue(category)).toBe(false)
      expect(validateCorrectionInput({ ...base, category, proposedValue: 'x' })).toEqual({
        ok: false,
        code: 'invalid-input',
      })
    }
  })

  it('rejects an oversized proposed value', () => {
    expect(validateCorrectionInput({ ...base, proposedValue: 'x'.repeat(501) })).toEqual({
      ok: false,
      code: 'proposed-invalid',
    })
  })

  it('parses coordinates into a structured pair', () => {
    const r = validateCorrectionInput({
      ...base,
      category: 'coordinates',
      proposedValue: '52.40637, 16.92517',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.proposedValue).toEqual({ lat: 52.40637, lng: 16.92517 })
  })

  it('rejects malformed coordinates', () => {
    for (const bad of ['52.4', 'abc, def', '95, 10', '10, 190', '0, 0', '1,2,3']) {
      expect(
        validateCorrectionInput({ ...base, category: 'coordinates', proposedValue: bad })
      ).toEqual({ ok: false, code: 'proposed-invalid' })
    }
  })
})

describe('parseCoordinatesInput', () => {
  it('accepts comma, semicolon and whitespace separators', () => {
    expect(parseCoordinatesInput('52.1, 16.9')).toEqual({ lat: 52.1, lng: 16.9 })
    expect(parseCoordinatesInput('52.1; 16.9')).toEqual({ lat: 52.1, lng: 16.9 })
    expect(parseCoordinatesInput('52.1 16.9')).toEqual({ lat: 52.1, lng: 16.9 })
  })

  it('rejects 0,0 and out-of-range values', () => {
    expect(parseCoordinatesInput('0, 0')).toBeNull()
    expect(parseCoordinatesInput('-91, 10')).toBeNull()
    expect(parseCoordinatesInput('10, 181')).toBeNull()
  })
})

describe('result-code and label localization coverage', () => {
  const locales = ['pl', 'en', 'de'] as const

  const catalog = (locale: string) =>
    JSON.parse(
      readFileSync(join(process.cwd(), 'messages', locale, 'feedback.json'), 'utf8')
    ) as Record<string, Record<string, unknown>>

  it.each(locales)('%s catalog localizes every action result code', (locale) => {
    const errors = (catalog(locale).form as Record<string, Record<string, string>>).errors
    for (const code of FEEDBACK_ERROR_CODES) {
      expect(errors[code], `${locale} form.errors.${code}`).toBeTruthy()
    }
  })

  it.each(locales)('%s catalog localizes every correction category', (locale) => {
    const categories = catalog(locale).categories as Record<string, string>
    for (const category of CORRECTION_CATEGORIES) {
      expect(categories[category], `${locale} categories.${category}`).toBeTruthy()
    }
  })

  it.each(locales)('%s catalog localizes every validation code', (locale) => {
    const validation = (catalog(locale).form as Record<string, Record<string, string>>).validation
    for (const code of [
      'category-required',
      'message-too-short',
      'message-too-long',
      'email-invalid',
      'proposed-invalid',
      'invalid-input',
    ]) {
      expect(validation[code], `${locale} form.validation.${code}`).toBeTruthy()
    }
  })
})
