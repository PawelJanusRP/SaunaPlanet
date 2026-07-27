// SP-039 — application-side validation for the expanded master profile.
//
// The DB pins stable invariants only; these helpers own trimming, blanks,
// dedup, vocabulary membership and the https contract. Empty collections
// normalize to NULL (never an empty array/object in the database).

import { SPECIALTY_IDS } from './specialties'

export const SPECIALTIES_MAX = 12
export const LANGUAGES_MAX = 8
export const EXPERIENCE_YEAR_MIN = 1980

const LANGUAGE_CODE = /^[a-z]{2,8}$/

export type WebsiteValidation =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'invalid-url' | 'not-https' | 'credentials' | 'port' }

/**
 * Website contract: https only, no credentials, default port only, blank
 * becomes null. No remote fetching, no tracking-param stripping — this is
 * a business card, not the importer (deliberately NOT normalizeImportUrl).
 */
export function sanitizeWebsiteUrl(raw: string | null | undefined): WebsiteValidation {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: true, value: null }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not-https' }
  if (url.username || url.password) return { ok: false, reason: 'credentials' }
  if (url.port && url.port !== '443') return { ok: false, reason: 'port' }
  return { ok: true, value: url.toString() }
}

/**
 * Trim, drop blanks, dedupe, keep only known vocabulary ids, cap the
 * count. Empty result -> null (DB stores NULL, never '{}').
 */
export function normalizeSpecialties(input: readonly string[] | null | undefined): string[] | null {
  if (!input) return null
  const seen = new Set<string>()
  for (const raw of input) {
    const id = raw.trim()
    if (!id || !SPECIALTY_IDS.has(id)) continue
    seen.add(id)
    if (seen.size === SPECIALTIES_MAX) break
  }
  return seen.size > 0 ? [...seen] : null
}

/** Lowercase stable codes (^[a-z]{2,8}$), dedupe, cap, empty -> null. */
export function normalizeLanguages(input: readonly string[] | null | undefined): string[] | null {
  if (!input) return null
  const seen = new Set<string>()
  for (const raw of input) {
    const code = raw.trim().toLowerCase()
    if (!LANGUAGE_CODE.test(code)) continue
    seen.add(code)
    if (seen.size === LANGUAGES_MAX) break
  }
  return seen.size > 0 ? [...seen] : null
}

/** Collapse inner whitespace, trim, blank -> null. */
export function normalizeCity(raw: string | null | undefined): string | null {
  const city = (raw ?? '').replace(/\s+/g, ' ').trim()
  return city || null
}

export type ExperienceYearValidation =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'not-a-year' | 'too-early' | 'future' }

/**
 * The DB range is a stable 1980–2100; the APPLICATION rejects future years
 * against the actual current year (approved split — no volatile CHECK).
 */
export function validateExperienceYear(
  raw: number | string | null | undefined,
  currentYear: number = new Date().getFullYear()
): ExperienceYearValidation {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  const year = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(year)) return { ok: false, reason: 'not-a-year' }
  if (year < EXPERIENCE_YEAR_MIN) return { ok: false, reason: 'too-early' }
  if (year > currentYear) return { ok: false, reason: 'future' }
  return { ok: true, value: year }
}
