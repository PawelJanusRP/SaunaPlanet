// SP-039 Slice 3B1 — claim-token encoding contract (pure).
//
// The authoritative token generation happens in PostgreSQL (pgcrypto) inside
// admin_create_master_claim_invitation; the DB stores only SHA-256(token) as
// bytea and returns the raw token exactly once. These helpers pin the SAME
// base64url encoding for (a) the Node fallback used only if preflight proves
// pgcrypto unavailable, and (b) deterministic unit tests. The raw token is a
// secret: never log it, never persist it outside the one-time RPC result.

import { createHash, randomBytes } from 'node:crypto'

/** RFC 4648 §5 base64url of raw bytes, WITHOUT `=` padding. */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** First 8 base64url chars — NON-secret diagnostic prefix (moderator-only). */
export function tokenPrefix(token: string): string {
  return token.slice(0, 8)
}

/** SHA-256 digest of the token as lowercase hex (matches encode(digest,'hex')). */
export function sha256Hex(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Node fallback generator — ONLY for the documented pgcrypto-unavailable path.
 * 32 CSPRNG bytes -> base64url token; returns the raw token plus its hex digest
 * (the RPC would then receive the server-computed hash instead of generating).
 */
export function generateClaimTokenFallback(): {
  token: string
  prefix: string
  sha256Hex: string
} {
  const token = toBase64Url(randomBytes(32))
  return { token, prefix: tokenPrefix(token), sha256Hex: sha256Hex(token) }
}
