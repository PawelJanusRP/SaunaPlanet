// SP-047 — next-intl routing definition.
//
// Locale prefix is ALWAYS present on canonical URLs (/pl, /en, /de). The root
// `/` and any unprefixed path are handled by proxy.ts (locale negotiation and
// legacy redirects) — see docs/SP047_I18N_ARCHITECTURE.md.

import { defineRouting } from 'next-intl/routing'
import { LOCALES, DEFAULT_LOCALE } from './locales'

/**
 * Preference cookie. It stores the user's last explicit/negotiated locale so a
 * later visit to `/` can honour it. It is a PREFERENCE, never authority over an
 * explicit locale URL (a request to /de/... always renders German).
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Canonical URLs always carry the locale segment.
  localePrefix: 'always',
  // Negotiate via cookie -> Accept-Language -> defaultLocale (Polish).
  localeDetection: true,
  localeCookie: {
    name: LOCALE_COOKIE,
    // ~1 year; a returning visitor keeps their language.
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
})
