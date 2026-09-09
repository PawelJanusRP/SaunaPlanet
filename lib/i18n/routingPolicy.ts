// SP-047 — pure routing-policy helpers shared by proxy.ts and the auth
// callback. Kept side-effect free so the sensitive redirect decisions are unit
// testable without constructing a NextRequest.

import { LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from './locales'

/**
 * Endpoints that must NEVER carry a locale prefix. Their contracts depend on
 * the exact unprefixed path:
 *  - /auth/callback  — the externally configured Supabase redirect URL;
 *  - /claim          — invitation token path + no-index headers + links already
 *                      sent during SP-039P.
 */
export const BARE_PREFIXES = ['/auth/callback', '/claim'] as const

export function isBarePath(pathname: string): boolean {
  return BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function hasLocalePrefix(pathname: string): boolean {
  return LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))
}

/**
 * Legacy compatibility: every historical unprefixed URL represented Polish
 * content, so it PERMANENTLY (308) redirects to its /pl equivalent, preserving
 * path + query. Returns null when no legacy redirect applies:
 *   - the root '/' (it must NEGOTIATE, not force Polish);
 *   - already locale-prefixed paths;
 *   - bare infra endpoints.
 */
export function legacyRedirectPath(
  pathname: string,
  search = '',
): string | null {
  if (pathname === '/') return null
  if (hasLocalePrefix(pathname)) return null
  if (isBarePath(pathname)) return null
  return `/${DEFAULT_LOCALE}${pathname}${search}`
}

/**
 * Post-authentication destination for /auth/callback. Locale is resolved AFTER
 * auth from the preference cookie (falling back to Polish). Claim deep links
 * keep their unprefixed token path; everything else is localized.
 * `next` is assumed already sanitized by sanitizeReturnPath().
 */
export function callbackDestination(next: string, cookieLocale?: string): string {
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  if (next.startsWith('/claim/')) return next
  return `/${locale}${next === '/' ? '' : next}`
}
