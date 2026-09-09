// SP-047E3 — locale-aware currency + international SEO contracts.

import { describe, expect, it } from 'vitest'
import { localizedAlternates, SITE_ORIGIN } from '../seo'
import { formatEventPrice } from '../formatPrice'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'

// Minimal stand-in for the next-intl formatter's `number` method. Cast to the
// helper's parameter type (next-intl's `number` is overloaded).
const fmt = {
  number: (n: number, opts?: Intl.NumberFormatOptions) =>
    `${n.toFixed(2)} ${opts?.currency ?? ''}`.trim(),
} as unknown as Parameters<typeof formatEventPrice>[0]

describe('formatEventPrice — clean numbers localized as PLN, UGC verbatim', () => {
  it('formats a clean numeric price as PLN via the formatter', () => {
    expect(formatEventPrice(fmt, '50')).toBe('50.00 PLN')
    expect(formatEventPrice(fmt, '49,90')).toBe('49.90 PLN')
  })
  it('passes free-text prices through unchanged (no currency assumption)', () => {
    expect(formatEventPrice(fmt, 'wstęp wolny')).toBe('wstęp wolny')
    expect(formatEventPrice(fmt, '50 zł')).toBe('50 zł')
    expect(formatEventPrice(fmt, '50-80')).toBe('50-80')
  })
  it('treats null/empty as no price', () => {
    expect(formatEventPrice(fmt, null)).toBeNull()
    expect(formatEventPrice(fmt, '   ')).toBeNull()
  })
})

describe('localizedAlternates — per-locale canonical + hreflang + x-default', () => {
  it('canonical points at the CURRENT locale variant of the same entity', () => {
    expect(localizedAlternates('en', '/masters/jan-kowalski').canonical).toBe('/en/masters/jan-kowalski')
    expect(localizedAlternates('de', '/sauna/uuid').canonical).toBe('/de/sauna/uuid')
    expect(localizedAlternates('pl', '').canonical).toBe('/pl')
  })
  it('declares pl/en/de alternates for the SAME (untranslated) slug', () => {
    const langs = localizedAlternates('en', '/masters/jan-kowalski').languages as Record<string, string>
    expect(langs.pl).toBe('/pl/masters/jan-kowalski')
    expect(langs.en).toBe('/en/masters/jan-kowalski')
    expect(langs.de).toBe('/de/masters/jan-kowalski')
  })
  it('x-default is the negotiating root, never /pl', () => {
    const langs = localizedAlternates('de', '/events/1').languages as Record<string, string>
    expect(langs['x-default']).toBe('/')
  })
})

describe('sitemap — localized public routes only, no sensitive areas', () => {
  const entries = sitemap()
  it('includes each public route in all three locales + the Help hub', () => {
    const urls = entries.map((e) => e.url)
    for (const loc of ['pl', 'en', 'de']) {
      expect(urls).toContain(`${SITE_ORIGIN}/${loc}`)
      expect(urls).toContain(`${SITE_ORIGIN}/${loc}/masters`)
      expect(urls).toContain(`${SITE_ORIGIN}/${loc}/help`)
    }
  })
  it('never exposes auth/admin/profile/workspace/studio/claim', () => {
    for (const e of entries) {
      expect(e.url).not.toMatch(/\/(auth|admin|profile|workspace|studio|claim)(\/|$)/)
    }
  })
  it('every entry carries an x-default pointing at the root', () => {
    for (const e of entries) {
      const langs = e.alternates?.languages as Record<string, string> | undefined
      expect(langs?.['x-default']).toBe(`${SITE_ORIGIN}/`)
    }
  })
})

describe('robots — private areas disallowed', () => {
  const rules = robots()
  it('disallows claim/auth and the private per-locale areas', () => {
    const disallow = (rules.rules as { disallow: string[] }).disallow
    expect(disallow).toContain('/claim')
    expect(disallow).toContain('/auth')
    for (const loc of ['pl', 'en', 'de']) {
      for (const seg of ['admin', 'profile', 'workspace', 'studio']) {
        expect(disallow).toContain(`/${loc}/${seg}`)
      }
    }
  })
  it('references the sitemap', () => {
    expect(rules.sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`)
  })
})
