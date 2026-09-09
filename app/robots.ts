import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/i18n/seo'

// SP-047 — robots. The /claim subtree is already noindex/no-referrer via
// next.config headers; keep auth/claim/admin out of crawlers here too.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/claim', '/auth', '/pl/admin', '/en/admin', '/de/admin'],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  }
}
