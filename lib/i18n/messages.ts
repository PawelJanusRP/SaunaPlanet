// SP-047 — message catalog loader.
//
// Catalogs are versioned JSON files under `messages/<locale>/<namespace>.json`.
// One namespace structure is shared across every locale; components consume
// semantic keys via `useTranslations('<namespace>')`. Adding a locale means
// adding a `messages/<locale>/` folder with the same namespaces — no code here
// changes.

import type { Locale } from './locales'
import { DEFAULT_LOCALE } from './locales'

/**
 * Domain namespaces. Kept domain-oriented (not route-file-oriented) so the same
 * catalogs can be reused by the future SP-030 Expo/React Native client.
 */
export const NAMESPACES = [
  'common',
  'nav',
  'about',
  'map',
  'sauna',
  'masters',
  'events',
  'auth',
  'profile',
  'claim',
  'studio',
  'workspace',
  'help',
  'admin',
  'publication',
  'errors',
  'metadata',
] as const

export type Namespace = (typeof NAMESPACES)[number]

type Catalog = Record<string, unknown>

async function loadNamespace(locale: Locale, ns: Namespace): Promise<Catalog> {
  try {
    const mod = await import(`../../messages/${locale}/${ns}.json`)
    return (mod.default ?? mod) as Catalog
  } catch {
    // Deterministic fallback to Polish for an accidentally missing file. In
    // development this is loud (see below); in production users never see raw
    // keys because the reference catalog always resolves.
    if (locale !== DEFAULT_LOCALE) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] missing catalog ${locale}/${ns}.json — falling back to ${DEFAULT_LOCALE}`)
      }
      const fallback = await import(`../../messages/${DEFAULT_LOCALE}/${ns}.json`)
      return (fallback.default ?? fallback) as Catalog
    }
    throw new Error(`[i18n] missing reference catalog ${DEFAULT_LOCALE}/${ns}.json`)
  }
}

/**
 * Compose all namespaces for a locale into the single object next-intl expects
 * (`messages.<namespace>.<key>`).
 */
export async function loadMessages(locale: Locale): Promise<Record<string, Catalog>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, await loadNamespace(locale, ns)] as const),
  )
  return Object.fromEntries(entries)
}
