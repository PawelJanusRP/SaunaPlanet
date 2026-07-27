// SP-039 D1 — pure patch builder for the own-profile update.
//
// Extracted from the server action so the whole validation/message layer
// is deterministic and unit-tested, and so the action can RETURN errors
// instead of throwing them (Next.js strips thrown server-action messages
// in production builds — same convention as app/saunas/actions.ts).

import { sanitizeSocialLinks } from '../import/social'
import { validateSlug } from './slug'
import {
  normalizeCity,
  normalizeLanguages,
  normalizeSpecialties,
  sanitizeWebsiteUrl,
  validateExperienceYear,
} from './validate'

/**
 * Explicit payload: a field that is `undefined` is NOT touched; an
 * explicit `null` (or blank) clears it.
 */
export type OwnMasterProfileUpdate = {
  name?: string
  bio?: string | null
  slug?: string | null
  city?: string | null
  specialties?: string[] | null
  languages?: string[] | null
  experienceSinceYear?: number | null
  socialLinks?: Record<string, string> | null
  website?: string | null
}

const WEBSITE_ERRORS: Record<string, string> = {
  'invalid-url': 'Podaj poprawny adres strony (https://...)',
  'not-https': 'Strona WWW musi używać https://',
  credentials: 'Adres strony nie może zawierać danych logowania',
  port: 'Adres strony nie może używać niestandardowego portu',
}

const SLUG_ERRORS: Record<string, string> = {
  'too-short': 'Adres profilu musi mieć co najmniej 3 znaki',
  'too-long': 'Adres profilu może mieć najwyżej 40 znaków',
  'invalid-shape': 'Adres profilu może zawierać tylko małe litery, cyfry i pojedyncze myślniki',
  reserved: 'Ten adres profilu jest zarezerwowany — wybierz inny',
  'uuid-like': 'Ten adres profilu wygląda jak identyfikator techniczny — wybierz inny',
}

export type ProfilePatchResult =
  | { ok: true; patch: Record<string, unknown>; requestedSlug: string | null }
  | { ok: false; error: string }

export function buildOwnMasterProfilePatch(data: OwnMasterProfileUpdate): ProfilePatchResult {
  const patch: Record<string, unknown> = {}

  if (data.name !== undefined) {
    if (!data.name.trim()) return { ok: false, error: 'Imię i nazwisko nie może być puste' }
    patch.name = data.name.trim()
  }
  if (data.bio !== undefined) patch.bio = data.bio?.trim() || null
  if (data.city !== undefined) patch.city = normalizeCity(data.city)
  if (data.specialties !== undefined) patch.specialties = normalizeSpecialties(data.specialties)
  if (data.languages !== undefined) patch.languages = normalizeLanguages(data.languages)
  if (data.socialLinks !== undefined) patch.social_links = sanitizeSocialLinks(data.socialLinks)

  if (data.website !== undefined) {
    const website = sanitizeWebsiteUrl(data.website)
    if (!website.ok) return { ok: false, error: WEBSITE_ERRORS[website.reason] }
    patch.website = website.value
  }

  if (data.experienceSinceYear !== undefined) {
    const year = validateExperienceYear(data.experienceSinceYear)
    if (!year.ok) {
      return {
        ok: false,
        error:
          year.reason === 'future'
            ? 'Rok rozpoczęcia nie może być w przyszłości'
            : 'Podaj poprawny rok rozpoczęcia (od 1980)',
      }
    }
    patch.experience_since_year = year.value
  }

  let requestedSlug: string | null = null
  if (data.slug !== undefined) {
    if (data.slug === null || data.slug.trim() === '') {
      patch.slug = null
    } else {
      const validated = validateSlug(data.slug)
      if (!validated.ok) return { ok: false, error: SLUG_ERRORS[validated.reason] }
      requestedSlug = validated.slug
      patch.slug = validated.slug
    }
  }

  return { ok: true, patch, requestedSlug }
}
