import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/i18n/seo'

// SP-047 — robots. The /claim subtree is already noindex/no-referrer via
// next.config headers; keep auth/claim and the private per-locale areas
// (admin, profile, workspace, studio) out of crawlers here too.
const PRIVATE_SEGMENTS = ['admin', 'profile', 'workspace', 'studio']
const LOCALE_PREFIXES = ['/pl', '/en', '/de']

export default function robots(): MetadataRoute.Robots {
  const disallow = ['/claim', '/auth']
  for (const seg of PRIVATE_SEGMENTS) {
    for (const p of LOCALE_PREFIXES) disallow.push(`${p}/${seg}`)
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow,
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  }
}
