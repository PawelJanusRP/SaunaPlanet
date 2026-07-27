import { describe, expect, it } from 'vitest'
import {
  foldPolishDiacritics,
  isUuid,
  RESERVED_SLUGS,
  SLUG_MAX,
  slugify,
  slugWithSuffix,
  validateSlug,
} from '../slug'

describe('foldPolishDiacritics', () => {
  it('folds every Polish diacritic and lowercases', () => {
    expect(foldPolishDiacritics('ŻÓŁĆ gęślą jaźń')).toBe('zolc gesla jazn')
    expect(foldPolishDiacritics('Łukasz ŁĄKA')).toBe('lukasz laka')
  })
})

describe('slugify', () => {
  it('produces canonical slugs from Polish names', () => {
    expect(slugify('Łukasz Żółty')).toBe('lukasz-zolty')
    expect(slugify('Jan  KOWALSKI')).toBe('jan-kowalski')
  })

  it('collapses separators and trims edges', () => {
    expect(slugify('  --jan__kowalski--  ')).toBe('jan-kowalski')
    expect(slugify('a...b,,,c')).toBe('a-b-c')
  })

  it('caps length at 40 without a trailing hyphen', () => {
    const long = slugify('a'.repeat(39) + ' bcdef')
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
    expect(long.endsWith('-')).toBe(false)
  })
})

describe('validateSlug', () => {
  it('accepts canonical slugs', () => {
    expect(validateSlug('jan-kowalski')).toEqual({ ok: true, slug: 'jan-kowalski' })
    expect(validateSlug('abc')).toEqual({ ok: true, slug: 'abc' })
  })

  it('lowercases before validating (case-insensitive contract)', () => {
    expect(validateSlug('Jan-Kowalski')).toEqual({ ok: true, slug: 'jan-kowalski' })
  })

  it('rejects bad shapes', () => {
    expect(validateSlug('ab')).toMatchObject({ ok: false, reason: 'too-short' })
    expect(validateSlug('a'.repeat(41))).toMatchObject({ ok: false, reason: 'too-long' })
    expect(validateSlug('-abc')).toMatchObject({ ok: false, reason: 'invalid-shape' })
    expect(validateSlug('abc-')).toMatchObject({ ok: false, reason: 'invalid-shape' })
    expect(validateSlug('a--b-c')).toMatchObject({ ok: false, reason: 'invalid-shape' })
    expect(validateSlug('żółty')).toMatchObject({ ok: false, reason: 'invalid-shape' })
    expect(validateSlug('jan kowalski')).toMatchObject({ ok: false, reason: 'invalid-shape' })
  })

  it('rejects reserved route words', () => {
    for (const word of ['admin', 'studio', 'masters', 'api', 'submit']) {
      expect(RESERVED_SLUGS.has(word)).toBe(true)
      expect(validateSlug(word)).toMatchObject({ ok: false, reason: 'reserved' })
    }
  })

  it('rejects UUID-shaped slugs (they would be shadowed by id lookup)', () => {
    expect(validateSlug('b014b217-54c5-4924-b8f0-009837d0844f')).toMatchObject({
      ok: false,
      reason: 'uuid-like',
    })
  })
})

describe('isUuid', () => {
  it('routes UUIDs to id lookup and everything else to slug lookup', () => {
    expect(isUuid('b014b217-54c5-4924-b8f0-009837d0844f')).toBe(true)
    expect(isUuid('B014B217-54C5-4924-B8F0-009837D0844F')).toBe(true)
    expect(isUuid('jan-kowalski')).toBe(false)
    expect(isUuid('b014b217')).toBe(false)
  })
})

describe('slugWithSuffix', () => {
  it('appends the collision suffix', () => {
    expect(slugWithSuffix('jan-kowalski', 2)).toBe('jan-kowalski-2')
    expect(slugWithSuffix('jan-kowalski', 10)).toBe('jan-kowalski-10')
  })

  it('never exceeds the maximum length', () => {
    const base = 'a'.repeat(40)
    const suggested = slugWithSuffix(base, 2)
    expect(suggested.length).toBeLessThanOrEqual(SLUG_MAX)
    expect(suggested.endsWith('-2')).toBe(true)
  })
})
