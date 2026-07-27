// SP-038 Smart Facility Import — shared types.
// See docs/SP038_SMART_IMPORT_ARCHITECTURE.md for the model rationale.

/**
 * Classified kind of a submitted URL. Classification never implies that a
 * source is extractable — it only routes the URL to a provider (or to an
 * explicit unsupported state).
 */
export type SourceKind =
  | 'website'
  | 'facebook_page'
  | 'facebook_post'
  | 'facebook_event'
  | 'instagram_profile'
  | 'instagram_post'
  | 'google_maps'
  | 'unsupported'

export type ClassifiedUrl = {
  kind: SourceKind
  /** Canonical normalized URL, or null when normalization rejected the input. */
  url: string | null
  /** Set when normalization rejected the input (kind is then 'unsupported'). */
  error?: ImportErrorCode
}

/** How a value was obtained. 'inferred' and 'user' are reserved for later slices. */
export type FieldOrigin = 'jsonld' | 'opengraph' | 'metadata' | 'html' | 'inferred' | 'user'

export type FieldConfidence = 'high' | 'medium' | 'low'

/**
 * Every extracted value carries field-level provenance so later slices can
 * show which values came from where and persist the map into
 * import_log.extracted.
 */
export type ExtractedField<T = string> = {
  value: T
  origin: FieldOrigin
  confidence: FieldConfidence
  /** Human-readable pointer to the exact source, e.g. "og:title". */
  sourceHint: string
}

export type OpeningHoursSpecificationDraft = {
  /** Day names as provided by the source (normalized to short English names when recognizable). */
  days: string[]
  opens: string | null
  closes: string | null
}

/**
 * Structured draft for opening hours. `specifications` comes from
 * schema.org openingHoursSpecification; `raw` preserves free-form
 * openingHours strings verbatim. Nothing is invented — the user reviews and
 * edits this in the preview step.
 */
export type OpeningHoursDraft = {
  specifications: OpeningHoursSpecificationDraft[]
  raw: string[]
}

/** Geographic coordinates only when explicitly present in the source. */
export type GeoDraft = { latitude: number; longitude: number }

/**
 * Provider output: a facility draft where every field is optional and every
 * present field carries provenance. Field names mirror the submission
 * contract (app/saunas/actions.ts) plus preview-only extras.
 */
export type FacilityDraft = {
  name?: ExtractedField
  description?: ExtractedField
  address?: ExtractedField
  city?: ExtractedField
  country?: ExtractedField
  phone?: ExtractedField
  email?: ExtractedField
  website?: ExtractedField
  geo?: ExtractedField<GeoDraft>
  openingHours?: ExtractedField<OpeningHoursDraft>
  /** Remote preview image URL — shown as preview only, never downloaded in the MVP. */
  imageUrl?: ExtractedField
  /** Social profile URLs found in the source (preview/provenance only — no DB columns). */
  socialLinks?: ExtractedField<string[]>
  /** Human-readable source page title (og:site_name / <title>). */
  sourceTitle?: ExtractedField
}

export type ProviderSuccess = {
  ok: true
  kind: SourceKind
  /** Normalized URL the user submitted. */
  requestedUrl: string
  /** Final URL after redirects (fetched document). */
  finalUrl: string
  draft: FacilityDraft
  /** Non-fatal issues encountered during extraction (e.g. malformed JSON-LD skipped). */
  warnings: string[]
  /** 'ok' when core fields extracted, 'partial' when extraction was degraded. */
  result: 'ok' | 'partial'
}

export type ImportErrorCode =
  | 'invalid-url'
  | 'insecure-protocol'
  | 'credentials-in-url'
  | 'blocked-port'
  | 'blocked-host'
  | 'blocked-address'
  | 'dns-error'
  | 'too-many-redirects'
  | 'invalid-redirect'
  | 'timeout'
  | 'response-too-large'
  | 'unsupported-content-type'
  | 'http-status'
  | 'network-error'
  | 'unsupported-source'
  | 'no-provider'

export type ProviderFailure = {
  ok: false
  kind: SourceKind
  requestedUrl: string | null
  code: ImportErrorCode
  /** HTTP status when code === 'http-status'. */
  status?: number
}

export type ProviderResult = ProviderSuccess | ProviderFailure
