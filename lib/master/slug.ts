// SP-039 — public master-profile slug: folding, normalization, validation.
//
// The DATABASE pins only the stable invariants (lowercase shape, length,
// case-insensitive uniqueness). Everything vocabulary-shaped lives here:
// reserved words, diacritic folding, suggestions. The canonical stored
// form is always the output of slugify().

/** Slug shape mirrored from the sauna_masters_slug_shape CHECK. */
export const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MIN = 3
export const SLUG_MAX = 40

/** Route segments and platform words a profile must never shadow. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'auth', 'events', 'event', 'login', 'logout', 'masters',
  'master', 'moderation', 'new', 'edit', 'profile', 'register', 'sauna',
  'saunas', 'sauny', 'settings', 'studio', 'submit', 'workspace', 'm',
  'me', 'null', 'undefined', 'search', 'about', 'kontakt', 'contact',
])

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the route parameter should be treated as a UUID id lookup. */
export function isUuid(value: string): boolean {
  return UUID_SHAPE.test(value)
}

/**
 * Folds Polish diacritics and lowercases — the exact behavior previously
 * local to FacilityCombobox (which now imports this): NFD strip of
 * combining marks plus the ł special case (ł does not decompose in NFD).
 */
export function foldPolishDiacritics(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
}

/**
 * Derives a canonical slug candidate from free text: fold, replace every
 * non [a-z0-9] run with a single hyphen, trim edge hyphens, cap at 40.
 * May return a string that is still too short — callers validate.
 */
export function slugify(input: string): string {
  return foldPolishDiacritics(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
}

export type SlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: 'too-short' | 'too-long' | 'invalid-shape' | 'reserved' | 'uuid-like' }

/**
 * Validates an ALREADY canonical slug (the form normalizes via slugify
 * first). UUID-shaped values are rejected — they would be shadowed by the
 * id arm of the /masters/[idOrSlug] dual lookup.
 */
export function validateSlug(raw: string): SlugValidation {
  const slug = raw.trim().toLowerCase()
  if (slug.length < SLUG_MIN) return { ok: false, reason: 'too-short' }
  if (slug.length > SLUG_MAX) return { ok: false, reason: 'too-long' }
  if (!SLUG_SHAPE.test(slug)) return { ok: false, reason: 'invalid-shape' }
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: 'reserved' }
  if (isUuid(slug)) return { ok: false, reason: 'uuid-like' }
  return { ok: true, slug }
}

/**
 * Collision suggestion: "jan-kowalski" -> "jan-kowalski-2" (or -3, ...),
 * trimming the base so the result never exceeds SLUG_MAX.
 */
export function slugWithSuffix(slug: string, n: number): string {
  const suffix = `-${n}`
  const base = slug.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '')
  return `${base}${suffix}`
}
