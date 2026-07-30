// SP-039 Slice 3B1 — claim-token encoding contract (pure reference lib).
//
// TOKEN-GENERATION CONTRACT (approved decision A):
//
//   Variant A — pgcrypto confirmed (the CURRENTLY IMPLEMENTED design): token
//   generation happens ENTIRELY in PostgreSQL inside
//   admin_create_master_claim_invitation / _regenerate_ (extensions.gen_random_bytes
//   + extensions.digest); the DB stores only SHA-256(token) as bytea and returns
//   the raw token exactly once. The helpers here are used ONLY for deterministic
//   unit tests that pin the SAME base64url/SHA-256 encoding.
//
//   Variant B — pgcrypto unavailable (proven by read-only preflight): STOP
//   before applying M4. Do NOT deploy the current RPC and do NOT switch at
//   runtime. The trusted server-to-RPC contract must be REDESIGNED in a separate
//   reviewed change (the RPC would then accept a server-computed hash instead of
//   generating). This module is a TESTED REFERENCE / FALLBACK implementation
//   only — it is NOT wired into any runtime code path and NOT an automatically
//   active parallel token generator while the RPC generates the token itself.
//   (`claimActions.ts` deliberately does not import this module.)
//
// In BOTH variants the browser never generates or submits token material. The
// raw token is a secret: never log it, never persist it outside the one-time
// RPC result.

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
