import type { MetadataRoute } from 'next'
import { LOCALES } from '@/lib/i18n/locales'
import { SITE_ORIGIN, localePath } from '@/lib/i18n/seo'

// SP-047 — multilingual sitemap. Each PLATFORM-CONTROLLED public route is emitted
// once per locale with `alternates.languages` (hreflang) for every locale plus
// an `x-default` that points at the negotiating root (SP-047 §8). Only
// locale-agnostic route names appear here; sensitive areas (auth, admin,
// profile, workspace, studio, claim tokens) are intentionally excluded.
//
// Dynamic entity URLs (masters/sauna/events detail) are NOT enumerated here:
// safe enumeration needs per-entity public-only projections (published masters,
// active saunas, public upcoming events) and is deferred to avoid any risk of
// exposing unpublished/unclaimed/private records via the sitemap. Detail pages
// still carry their own canonical + hreflang via generateMetadata.
const PUBLIC_PATHS = ['', '/events', '/masters', '/sauny', '/about', '/help', '/help/saunamaster']

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []
  for (const path of PUBLIC_PATHS) {
    const languages: Record<string, string> = {}
    for (const l of LOCALES) languages[l] = `${SITE_ORIGIN}${localePath(l, path)}`
    languages['x-default'] = `${SITE_ORIGIN}/`
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
