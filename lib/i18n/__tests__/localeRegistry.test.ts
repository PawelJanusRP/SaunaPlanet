// SP-047 — the supported-locale registry is the single source of truth.

import { describe, expect, it } from 'vitest'
import {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  HTML_LANG,
  INTL_LOCALE,
  isLocale,
} from '../locales'
import { routing } from '../routing'

describe('locale registry', () => {
  it('ships exactly the supported production locales', () => {
    expect([...LOCALES]).toEqual(['pl', 'en', 'de'])
  })
  it('uses Polish as the deterministic default/fallback', () => {
    expect(DEFAULT_LOCALE).toBe('pl')
    expect(routing.defaultLocale).toBe('pl')
    expect([...routing.locales]).toEqual([...LOCALES])
  })
  it('has a label, html lang and Intl tag for every locale', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy()
      expect(HTML_LANG[locale]).toBeTruthy()
      expect(INTL_LOCALE[locale]).toContain('-')
    }
  })
  it('validates locale codes', () => {
    expect(isLocale('pl')).toBe(true)
    expect(isLocale('de')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
