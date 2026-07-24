// SP-038 Slice 2 — extraction-action core.
//
// Pure orchestration with injected dependencies so the full contract
// (auth gate, rolling-hour rate limit, one append-only import_log row per
// accepted operation, source-kind vocabulary mapping, no-raw-HTML) is
// unit-testable without Next.js or Supabase. The server action in
// app/saunas/importActions.ts is a thin wrapper that supplies real deps.

import { classifyImportUrl } from './classify'
import type { FacilityDraft, ImportErrorCode, ProviderResult, SourceKind } from './types'

export const IMPORT_RATE_LIMIT = 10 // accepted operations per rolling hour
export const IMPORT_RATE_WINDOW_MS = 60 * 60 * 1000

/** Database vocabulary of import_log.source_kind (SP-036 CHECK, extended
 * with 'google_maps' by the Slice 3 migration — that migration must be
 * applied before this code is deployed, or google_maps log inserts fail
 * the CHECK). */
export type DbSourceKind =
  | 'facebook_page'
  | 'facebook_event'
  | 'instagram'
  | 'website'
  | 'google_maps'
  | 'other'

/**
 * Maps the application-level source kind onto the database CHECK
 * vocabulary. The application-level kind is additionally preserved inside
 * extracted.appSourceKind so fine-grained provenance is never lost.
 */
export function toDbSourceKind(kind: SourceKind): DbSourceKind {
  switch (kind) {
    case 'website':
      return 'website'
    case 'facebook_page':
    case 'facebook_post':
      return 'facebook_page'
    case 'facebook_event':
      return 'facebook_event'
    case 'instagram_profile':
    case 'instagram_post':
      return 'instagram'
    case 'google_maps':
      return 'google_maps'
    case 'unsupported':
      return 'other'
  }
}

export type ImportLogRecord = {
  source_kind: DbSourceKind
  url: string
  result: 'ok' | 'partial' | 'failed' | 'blocked'
  extracted: Record<string, unknown> | null
}

export type DuplicateCandidate = {
  id: string
  name: string
  city: string | null
  status: string
  distance_m: number | null
  match_reasons: string[]
}

export type ExtractDraftDeps = {
  /** Authenticated user id or null. */
  getUserId(): Promise<string | null>
  /** Count of the caller's import_log rows within the rolling window. */
  countRecentImports(): Promise<number>
  /**
   * Append-only import_log insert (requested_by comes from the session).
   * Returns the new row id, or null when the audit insert failed — the
   * result is then still delivered to the user, only unlinkable (Slice 3).
   */
  insertImportLog(record: ImportLogRecord): Promise<string | null>
  /** Provider engine (lib/import extractFacilityFromUrl in production). */
  extract(normalizedUrl: string): Promise<ProviderResult>
  /** Warn-only duplicate lookup; must degrade to [] on failure. */
  findDuplicates(params: {
    name: string
    lat: number | null
    lng: number | null
    website: string | null
    phone: string | null
    sourceUrl: string | null
  }): Promise<DuplicateCandidate[]>
}

/** User-safe failure codes — internal SSRF details are never exposed. */
export type ExtractDraftFailureCode =
  | 'unauthenticated'
  | 'rate-limited'
  | 'invalid-url'
  | 'unsupported-source'
  | 'fetch-blocked'
  | 'fetch-failed'

export type ExtractDraftSuccess = {
  ok: true
  sourceKind: SourceKind
  requestedUrl: string
  finalUrl: string
  result: 'ok' | 'partial'
  draft: FacilityDraft
  warnings: string[]
  duplicates: DuplicateCandidate[]
  /**
   * id of the import_log row for this operation — used by Slice 3 to link
   * the operation to the submission it produced. null when the audit
   * insert failed (the preview still works; linking is skipped).
   */
  importId: string | null
}

export type ExtractDraftFailure = {
  ok: false
  code: ExtractDraftFailureCode
  message: string
  sourceKind?: SourceKind
  requestedUrl?: string | null
}

export type ExtractDraftResult = ExtractDraftSuccess | ExtractDraftFailure

/** Local validation errors — rejected before any log/fetch, per decision. */
const LOCAL_VALIDATION_CODES: ReadonlySet<ImportErrorCode> = new Set([
  'invalid-url',
  'insecure-protocol',
  'credentials-in-url',
  'blocked-port',
])

/** Fetch-time security refusals → logged as 'blocked'. */
const BLOCKED_FETCH_CODES: ReadonlySet<ImportErrorCode> = new Set([
  'blocked-address',
  'blocked-host',
  'invalid-redirect',
  'insecure-protocol',
  'credentials-in-url',
  'blocked-port',
])

function localValidationMessage(code: ImportErrorCode): string {
  if (code === 'insecure-protocol') {
    return 'Obsługiwane są tylko adresy https:// — podaj bezpieczny adres strony'
  }
  if (code === 'credentials-in-url') return 'Adres nie może zawierać danych logowania'
  return 'Podaj poprawny, pełny adres strony (https://...)'
}

/**
 * The Slice 2 extraction contract:
 * 1. authenticated user only (no log for anonymous calls);
 * 2. local URL validation failures return immediately (no log);
 * 3. rolling-hour rate limit checked against import_log (a rate-limited
 *    attempt is NOT an accepted operation and is not logged);
 * 4. every accepted operation writes exactly ONE append-only import_log
 *    row — ok, partial, failed and blocked all count toward the limit;
 * 5. raw HTML never appears in the result or the log — only the
 *    normalized draft, warnings and typed error metadata.
 */
export async function extractDraftCore(
  rawUrl: string,
  deps: ExtractDraftDeps
): Promise<ExtractDraftResult> {
  const userId = await deps.getUserId()
  if (!userId) {
    return { ok: false, code: 'unauthenticated', message: 'Musisz być zalogowany, aby importować dane' }
  }

  const classified = classifyImportUrl(rawUrl)
  if (classified.url === null) {
    const code = classified.error ?? 'invalid-url'
    if (LOCAL_VALIDATION_CODES.has(code)) {
      return { ok: false, code: 'invalid-url', message: localValidationMessage(code), requestedUrl: null }
    }
    return { ok: false, code: 'invalid-url', message: localValidationMessage('invalid-url'), requestedUrl: null }
  }

  const recent = await deps.countRecentImports()
  if (recent >= IMPORT_RATE_LIMIT) {
    return {
      ok: false,
      code: 'rate-limited',
      message: `Limit ${IMPORT_RATE_LIMIT} importów na godzinę został wykorzystany — spróbuj później`,
      requestedUrl: classified.url,
    }
  }

  const dbKind = toDbSourceKind(classified.kind)

  if (classified.kind !== 'website') {
    await deps.insertImportLog({
      source_kind: dbKind,
      url: classified.url,
      result: 'blocked',
      extracted: { appSourceKind: classified.kind, reason: 'unsupported-source' },
    })
    return {
      ok: false,
      code: 'unsupported-source',
      message: 'Automatyczny import z tego źródła nie jest obsługiwany — możesz wypełnić formularz ręcznie',
      sourceKind: classified.kind,
      requestedUrl: classified.url,
    }
  }

  const extraction = await deps.extract(classified.url)

  if (!extraction.ok) {
    const blocked = BLOCKED_FETCH_CODES.has(extraction.code)
    await deps.insertImportLog({
      source_kind: dbKind,
      url: classified.url,
      result: blocked ? 'blocked' : 'failed',
      extracted: {
        appSourceKind: classified.kind,
        errorCode: extraction.code,
        ...(extraction.status !== undefined ? { httpStatus: extraction.status } : {}),
      },
    })
    return {
      ok: false,
      code: blocked ? 'fetch-blocked' : 'fetch-failed',
      message: blocked
        ? 'Ten adres nie może zostać pobrany — możesz wypełnić formularz ręcznie'
        : 'Nie udało się pobrać danych z tej strony — możesz wypełnić formularz ręcznie',
      sourceKind: classified.kind,
      requestedUrl: classified.url,
    }
  }

  const importId = await deps.insertImportLog({
    source_kind: dbKind,
    url: classified.url,
    result: extraction.result,
    extracted: {
      appSourceKind: classified.kind,
      finalUrl: extraction.finalUrl,
      warnings: extraction.warnings,
      draft: extraction.draft as unknown as Record<string, unknown>,
    },
  })

  const duplicates = await deps.findDuplicates({
    name: extraction.draft.name?.value ?? '',
    lat: extraction.draft.geo?.value.latitude ?? null,
    lng: extraction.draft.geo?.value.longitude ?? null,
    website: extraction.draft.website?.value ?? null,
    phone: extraction.draft.phone?.value ?? null,
    sourceUrl: classified.url,
  })

  return {
    ok: true,
    sourceKind: classified.kind,
    requestedUrl: classified.url,
    finalUrl: extraction.finalUrl,
    result: extraction.result,
    draft: extraction.draft,
    warnings: extraction.warnings,
    duplicates,
    importId,
  }
}
