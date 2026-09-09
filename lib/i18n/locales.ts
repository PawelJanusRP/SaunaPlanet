// SP-047 — Supported locale registry (single source of truth).
//
// Adding a new language is a catalog task, not a routing refactor:
//   1. add the BCP-47 code here (e.g. 'sv');
//   2. add `messages/<code>/*.json`;
//   3. everything else (routing, negotiation, selector, SEO) derives from
//      this registry automatically.
//
// Do NOT hardcode locale lists anywhere else — import from this module.

export const LOCALES = ['pl', 'en', 'de'] as const

export type Locale = (typeof LOCALES)[number]

/** Reference / fallback language. Polish is the authored source catalog. */
export const DEFAULT_LOCALE: Locale = 'pl'

/**
 * Human-readable language names, in the language itself (autonyms). We prefer
 * language names over country flags as the semantic identifier for the
 * language selector.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  pl: 'Polski',
  en: 'English',
  de: 'Deutsch',
}

/** `<html lang>` value per locale (kept explicit for future region subtags). */
export const HTML_LANG: Record<Locale, string> = {
  pl: 'pl',
  en: 'en',
  de: 'de',
}

/** BCP-47 tag used for `Intl` date/number/currency formatting. */
export const INTL_LOCALE: Record<Locale, string> = {
  pl: 'pl-PL',
  en: 'en-GB',
  de: 'de-DE',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
