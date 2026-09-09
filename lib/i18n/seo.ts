// SP-047 — international SEO helpers.
//
// Canonical production origin. Every locale URL is canonical to itself and
// declares the supported alternates + an x-default (Polish, the reference).

import type { Metadata } from 'next'
import { LOCALES, DEFAULT_LOCALE, type Locale } from './locales'

export const SITE_ORIGIN = 'https://sauna-planet.pl'
export const metadataBase = new URL(SITE_ORIGIN)

/** Join a locale with a locale-agnostic path ('' or '/masters/x'). */
export function localePath(locale: Locale, path = ''): string {
  const clean = path && !path.startsWith('/') ? `/${path}` : path
  return `/${locale}${clean}`
}

/**
 * Build `alternates` for a public page: canonical = this locale's URL, plus a
 * `languages` map with every supported locale and an `x-default`.
 * `path` is the locale-agnostic path after the locale segment, e.g.
 * '/masters/jan-kowalski' (entity slugs are NOT translated).
 */
export function localizedAlternates(
  locale: Locale,
  path = '',
): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = localePath(l, path)
  languages['x-default'] = localePath(DEFAULT_LOCALE, path)
  return {
    canonical: localePath(locale, path),
    languages,
  }
}
