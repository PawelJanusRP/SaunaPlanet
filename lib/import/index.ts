// SP-038 Smart Facility Import — engine entry point.
//
// Server-only library. Later slices call extractFacilityFromUrl() from a
// rate-limited server action; this module performs no database writes and
// is never exposed directly to the browser.

import { classifyImportUrl } from './classify'
import { extractFromWebsite } from './providers/website'
import type { SafeFetchOptions } from './safeFetch'
import type { ProviderResult, SourceKind } from './types'

export { classifyImportUrl } from './classify'
export { normalizeImportUrl } from './normalizeUrl'
export { safeFetchHtml } from './safeFetch'
export { extractFromWebsite } from './providers/website'
export type * from './types'

type ProviderFn = (normalizedUrl: string, options?: SafeFetchOptions) => Promise<ProviderResult>

/**
 * Provider registry. Adding a source = adding one entry here plus a
 * provider module — the engine, classification and safety layers stay
 * untouched (see docs/SP038_SMART_IMPORT_ARCHITECTURE.md §How to add a provider).
 *
 * Facebook / Instagram / Google Maps intentionally have no provider yet:
 * classification routes them to an explicit unsupported result (Slice 4
 * adds Facebook best-effort and paste-text fallbacks; Google Maps stays
 * unsupported for automatic persistent import by product decision).
 */
const PROVIDERS: Partial<Record<SourceKind, ProviderFn>> = {
  website: extractFromWebsite,
}

/**
 * Classifies, normalizes and extracts a facility draft from a public URL.
 * Always resolves to a typed ProviderResult — expected failures (blocked
 * address, timeout, unsupported source, …) never throw.
 */
export async function extractFacilityFromUrl(rawUrl: string, options: SafeFetchOptions = {}): Promise<ProviderResult> {
  const classified = classifyImportUrl(rawUrl)
  if (classified.url === null) {
    return { ok: false, kind: 'unsupported', requestedUrl: null, code: classified.error ?? 'invalid-url' }
  }
  const provider = PROVIDERS[classified.kind]
  if (!provider) {
    return { ok: false, kind: classified.kind, requestedUrl: classified.url, code: 'unsupported-source' }
  }
  return provider(classified.url, options)
}
