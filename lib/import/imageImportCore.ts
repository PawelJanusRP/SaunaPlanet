// SP-038 Slice 3C — post-submission image-import orchestration (DI core).
//
// Contract (approved decision 4): runs ONLY after the facility submission
// succeeded and the import log is linked; the client supplies identifiers
// only — the remote URL is read server-side from the caller-owned
// import_log row. Every failure is a structured, user-safe no-op: a
// facility submission never becomes failed because its image did.

import { createHash } from 'node:crypto'
import type { ImageFetchResult } from './imageFetch'

export type ImageImportFailureReason =
  | 'not-available'
  | 'fetch-failed'
  | 'unsupported-image'
  | 'upload-failed'
  | 'attach-failed'

export type ImageImportResult =
  | { ok: true; photoId: string; publicUrl: string; coverSet: boolean }
  | { ok: false; reason: ImageImportFailureReason; message: string }

export type ImageImportDeps = {
  getUserId(): Promise<string | null>
  /**
   * The caller-owned import_log row (RLS own-row SELECT): its linked
   * sauna_id and the extracted image URL. null = not found / not owned.
   */
  getImportRecord(importId: string): Promise<{ saunaId: string | null; imageUrl: string | null } | null>
  fetchImage(url: string): Promise<ImageFetchResult>
  /**
   * Uploads verified bytes to the given bucket path WITHOUT overwriting
   * (upsert must be false). Returns the public URL or null on failure.
   */
  uploadImage(path: string, bytes: Uint8Array, contentType: string): Promise<string | null>
  /** attach_imported_photo RPC; returns the new photo id or null. */
  attachPhoto(saunaId: string, publicUrl: string, sourceUrl: string): Promise<string | null>
  /** Atomic conditional cover set (cover_image_url IS NULL predicate). */
  setCoverIfEmpty(saunaId: string, publicUrl: string): Promise<boolean>
}

const MESSAGES: Record<ImageImportFailureReason, string> = {
  'not-available': 'Zdjęcie ze strony nie jest dostępne do importu',
  'fetch-failed': 'Nie udało się pobrać zdjęcia ze strony źródłowej',
  'unsupported-image': 'Format zdjęcia nie jest obsługiwany (JPEG, PNG lub WebP)',
  'upload-failed': 'Nie udało się zapisać zdjęcia w SaunaPlanet',
  'attach-failed': 'Nie udało się dołączyć zdjęcia do zgłoszenia',
}

function failure(reason: ImageImportFailureReason): ImageImportResult {
  return { ok: false, reason, message: MESSAGES[reason] }
}

/** SSRF/security refusals surface as a generic fetch failure — internal
 * network policy details never reach the client. */
const UNSUPPORTED_IMAGE_CODES = new Set(['unsupported-content-type', 'image-signature-mismatch'])

export async function importSubmissionImageCore(
  importId: string,
  saunaId: string,
  deps: ImageImportDeps
): Promise<ImageImportResult> {
  const userId = await deps.getUserId()
  if (!userId) return failure('not-available')

  const record = await deps.getImportRecord(importId)
  // The log must be the caller's own AND already linked to exactly this
  // pending sauna — linking is the trust anchor (RPC-verified ownership).
  if (!record || record.saunaId !== saunaId) return failure('not-available')
  if (!record.imageUrl) return failure('not-available')

  const image = await deps.fetchImage(record.imageUrl)
  if (!image.ok) {
    return UNSUPPORTED_IMAGE_CODES.has(image.code)
      ? failure('unsupported-image')
      : failure('fetch-failed')
  }

  const hash = createHash('sha256').update(image.bytes).digest('hex').slice(0, 16)
  const path = `imported/${saunaId}/og-${hash}.${image.format}`

  const publicUrl = await deps.uploadImage(path, image.bytes, image.contentType)
  if (!publicUrl) return failure('upload-failed')

  const photoId = await deps.attachPhoto(saunaId, publicUrl, record.imageUrl)
  if (!photoId) return failure('attach-failed')

  const coverSet = await deps.setCoverIfEmpty(saunaId, publicUrl)
  return { ok: true, photoId, publicUrl, coverSet }
}
