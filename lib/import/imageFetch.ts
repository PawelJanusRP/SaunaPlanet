// SP-038 Slice 3C — SSRF-safe facility-image fetch profile.
//
// Reuses the exact networking policy of safeFetchBytes (https-only,
// pinned lookup, per-hop redirect validation, deadline, streamed cap) and
// adds image-specific validation: an allowlist of three formats, a 5 MB
// cap, and DOUBLE verification — the declared Content-Type and the binary
// magic signature must both identify the SAME allowed format. SVG and GIF
// are rejected (content-type gate + no matching signature). The verified
// format — never the remote URL — decides the stored file extension.

import { mimeOf, safeFetchBytes, type SafeFetchOptions } from './safeFetch'
import type { ImportErrorCode } from './types'

export const IMAGE_MAX_BYTES = 5_000_000

export type VerifiedImageFormat = 'jpg' | 'png' | 'webp'

const IMAGE_CONTENT_TYPES: Record<string, VerifiedImageFormat> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type ImageFetchErrorCode = ImportErrorCode | 'image-signature-mismatch'

export type FetchedImage = {
  ok: true
  bytes: Uint8Array
  format: VerifiedImageFormat
  /** Canonical content type for the verified format (what we store). */
  contentType: string
  finalUrl: string
}

export type ImageFetchFailure = { ok: false; code: ImageFetchErrorCode }

export type ImageFetchResult = FetchedImage | ImageFetchFailure

/** Format from binary magic bytes; null = not one of the three allowed. */
export function signatureFormat(bytes: Uint8Array): VerifiedImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) {
    return 'webp'
  }
  return null
}

const CANONICAL_CONTENT_TYPE: Record<VerifiedImageFormat, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Fetches and verifies a remote facility image. The URL goes through
 * standards-based WHATWG parsing/serialization (spaces and other unsafe
 * characters get percent-encoded; existing escapes are preserved, the
 * host is never altered); credentials/http/odd ports/private targets are
 * rejected by the shared policy.
 */
export async function fetchFacilityImage(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<ImageFetchResult> {
  let normalized: string
  try {
    normalized = new URL(rawUrl.trim()).toString()
  } catch {
    return { ok: false, code: 'invalid-url' }
  }

  const fetched = await safeFetchBytes(normalized, Object.keys(IMAGE_CONTENT_TYPES), {
    ...options,
    maxBytes: options.maxBytes ?? IMAGE_MAX_BYTES,
    accept: 'image/jpeg,image/png,image/webp',
  })
  if (!fetched.ok) return fetched

  const declared = IMAGE_CONTENT_TYPES[mimeOf(fetched.contentType) ?? ''] ?? null
  const actual = signatureFormat(fetched.bytes)
  if (actual === null) return { ok: false, code: 'unsupported-content-type' }
  if (declared === null || declared !== actual) {
    return { ok: false, code: 'image-signature-mismatch' }
  }

  return {
    ok: true,
    bytes: fetched.bytes,
    format: actual,
    contentType: CANONICAL_CONTENT_TYPE[actual],
    finalUrl: fetched.finalUrl,
  }
}
