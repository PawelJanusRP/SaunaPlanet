import type { MetadataRoute } from 'next'
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { SITE_ORIGIN, localePath } from '@/lib/i18n/seo'

// SP-047 — multilingual sitemap. Each public route is emitted once per locale
// with `alternates.languages` (hreflang) pointing at every locale variant plus
// x-default. Locale-agnostic route names only — entity slugs are appended by
// their own routes; dynamic entity URLs can be layered in later without
// changing this shape.
const PUBLIC_PATHS = ['', '/events', '/masters', '/sauny', '/about']

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []
  for (const path of PUBLIC_PATHS) {
    const languages: Record<string, string> = {}
    for (const l of LOCALES) languages[l] = `${SITE_ORIGIN}${localePath(l, path)}`
    languages['x-default'] = `${SITE_ORIGIN}${localePath(DEFAULT_LOCALE, path)}`
    for (const l of LOCALES) {
      entries.push({
        url: `${SITE_ORIGIN}${localePath(l, path)}`,
        changeFrequency: 'daily',
        priority: path === '' ? 1 : 0.7,
        alternates: { languages },
      })
    }
  }
  return entries
}
