// SP-042B — feedback intake core (docs/SP042_FEEDBACK_ARCHITECTURE.md §5, §9,
// §16). Pure module: no Supabase, no Next.js — importable from client
// components (category list, limits) and unit-testable in isolation. The
// SECURITY DEFINER RPC re-validates every rule server-side; this layer exists
// for friendly, localized errors before the database round-trip.

export const FEEDBACK_MESSAGE_MIN = 10
export const FEEDBACK_MESSAGE_MAX = 4000
export const FEEDBACK_PROPOSED_MAX = 500
export const FEEDBACK_EMAIL_MAX = 254

/** Stable semantic category codes — never localized in the database. */
export const CORRECTION_CATEGORIES = [
  'name',
  'address',
  'coordinates',
  'website',
  'social_link',
  'contact_details',
  'category',
  'opening_info',
  'photo',
  'closed',
  'duplicate',
  'other',
] as const

export type CorrectionCategory = (typeof CORRECTION_CATEGORIES)[number]

/**
 * Categories that accept ONE optional structured proposed value in the MVP
 * (owner decision D3). photo/closed/duplicate/other are message-only — their
 * semantics do not correspond cleanly to a single correctable column
 * (architecture §5).
 */
const STRUCTURED_CATEGORIES: ReadonlySet<CorrectionCategory> = new Set([
  'name',
  'address',
  'coordinates',
  'website',
  'social_link',
  'contact_details',
  'category',
  'opening_info',
])

export function categoryAcceptsProposedValue(category: string): boolean {
  return STRUCTURED_CATEGORIES.has(category as CorrectionCategory)
}

export type FeedbackValidationCode =
  | 'category-required'
  | 'message-too-short'
  | 'message-too-long'
  | 'email-invalid'
  | 'proposed-invalid'
  | 'invalid-input'

/** Stable result codes surfaced by the submit action (RPC codes + transport). */
export const FEEDBACK_ERROR_CODES = [
  'invalid-input',
  'invalid-category',
  'invalid-email',
  'invalid-facility',
  'rate-limited',
  'unavailable',
] as const

export type FeedbackErrorCode = (typeof FEEDBACK_ERROR_CODES)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CorrectionFormInput = {
  saunaId: string
  category: string
  message: string
  proposedValue?: string | null
  contactEmail?: string | null
}

/** JSON value the RPC receives as p_proposed_value. */
export type ProposedValueJson = string | { lat: number; lng: number }

export type ValidatedCorrection = {
  saunaId: string
  category: CorrectionCategory
  message: string
  proposedValue: ProposedValueJson | null
  contactEmail: string | null
}

export type ValidationResult =
  | { ok: true; value: ValidatedCorrection }
  | { ok: false; code: FeedbackValidationCode }

/**
 * Parse a user-typed coordinate pair ("52.40637, 16.92517" — comma, semicolon
 * or whitespace separated). Returns null for anything that is not two finite
 * numbers in range; 0,0 is rejected (SP-038 §8 rule).
 */
export function parseCoordinatesInput(raw: string): { lat: number; lng: number } | null {
  const parts = raw.trim().split(/[,;\s]+/).filter(Boolean)
  if (parts.length !== 2) return null
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

export function validateCorrectionInput(input: CorrectionFormInput): ValidationResult {
  if (typeof input.saunaId !== 'string' || !UUID_RE.test(input.saunaId)) {
    return { ok: false, code: 'invalid-input' }
  }

  if (!CORRECTION_CATEGORIES.includes(input.category as CorrectionCategory)) {
    return { ok: false, code: 'category-required' }
  }
  const category = input.category as CorrectionCategory

  const message = (input.message ?? '').trim()
  if (message.length < FEEDBACK_MESSAGE_MIN) {
    return { ok: false, code: 'message-too-short' }
  }
  if (message.length > FEEDBACK_MESSAGE_MAX) {
    return { ok: false, code: 'message-too-long' }
  }

  const emailRaw = (input.contactEmail ?? '').trim()
  let contactEmail: string | null = null
  if (emailRaw !== '') {
    if (emailRaw.length > FEEDBACK_EMAIL_MAX || !EMAIL_RE.test(emailRaw)) {
      return { ok: false, code: 'email-invalid' }
    }
    contactEmail = emailRaw
  }

  const proposedRaw = (input.proposedValue ?? '').trim()
  let proposedValue: ProposedValueJson | null = null
  if (proposedRaw !== '') {
    if (!categoryAcceptsProposedValue(category)) {
      // the form never shows the input for these categories
      return { ok: false, code: 'invalid-input' }
    }
    if (category === 'coordinates') {
      const coords = parseCoordinatesInput(proposedRaw)
      if (!coords) return { ok: false, code: 'proposed-invalid' }
      proposedValue = coords
    } else {
      if (proposedRaw.length > FEEDBACK_PROPOSED_MAX) {
        return { ok: false, code: 'proposed-invalid' }
      }
      proposedValue = proposedRaw
    }
  }

  return {
    ok: true,
    value: { saunaId: input.saunaId, category, message, proposedValue, contactEmail },
  }
}
