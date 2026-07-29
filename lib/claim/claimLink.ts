// SP-039 Slice 3B3 — claim-link construction and token-grant parsing (pure).
//
// The raw token appears application-side ONLY on the create/regenerate success
// path; this module centralizes its validation and the claim URL contract so
// the secret is either well-formed and returned once, or the flow FAILS CLOSED
// (null) — malformed payloads are never logged and never partially rendered.

/** Exact current raw-token contract: 32 CSPRNG bytes -> base64url (unpadded). */
export const CLAIM_TOKEN_LENGTH = 43
export const CLAIM_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/

/**
 * Future end-user route contract (Slice 4). 3B3 builds links against it but
 * deliberately does NOT implement the route.
 */
export const CLAIM_ROUTE_PREFIX = '/claim/master/'

export function isValidClaimToken(raw: unknown): raw is string {
  return typeof raw === 'string' && CLAIM_TOKEN_SHAPE.test(raw)
}

/**
 * SERVER-ONLY configuration contract for the public claim origin. Deliberately
 * without the client-bundle env prefix: the value must never ship to the
 * browser, and a missing value must FAIL CLOSED instead of silently pointing a
 * Preview deployment at a guessed (or Production) host. There is NO fallback
 * and NO request-header derivation — explicit configuration or nothing.
 */
export const CLAIM_PUBLIC_ORIGIN_ENV = 'CLAIM_PUBLIC_ORIGIN'

export type ClaimOriginResolution =
  | { ok: true; origin: string }
  | { ok: false; code: 'claim_origin_not_configured' | 'claim_origin_invalid' }

/**
 * Resolves and validates CLAIM_PUBLIC_ORIGIN:
 *  - missing/blank -> claim_origin_not_configured;
 *  - anything that is not an absolute https ROOT origin -> claim_origin_invalid
 *    (rejected: non-https, credentials, any path beyond '/', query, fragment);
 *  - accepted values normalize deterministically to URL.origin (no trailing
 *    slash). Env values never appear in results or logs.
 */
export function resolveClaimPublicOrigin(
  env: Record<string, string | undefined> = process.env
): ClaimOriginResolution {
  const configured = (env[CLAIM_PUBLIC_ORIGIN_ENV] ?? '').trim()
  if (!configured) return { ok: false, code: 'claim_origin_not_configured' }
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    return { ok: false, code: 'claim_origin_invalid' }
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return { ok: false, code: 'claim_origin_invalid' }
  }
  return { ok: true, origin: url.origin }
}

/**
 * Builds the one-time claim URL against an ALREADY-RESOLVED origin (callers
 * must go through resolveClaimPublicOrigin first — there is no default).
 * Fail-closed: any token that is not exactly the expected 43-char base64url
 * shape yields null (no partial links, no URL-encoding surprises — the
 * charset needs no escaping by construction).
 */
export function buildClaimUrl(rawToken: unknown, origin: string): string | null {
  if (!isValidClaimToken(rawToken)) return null
  let normalized: string
  try {
    normalized = new URL(origin).origin
  } catch {
    return null
  }
  return `${normalized}${CLAIM_ROUTE_PREFIX}${rawToken}`
}

/** Parsed one-time grant from the create/regenerate RPC `data` payload. */
export type ClaimTokenGrant = {
  invitationId: string
  tokenPrefix: string
  expiresAt: string
  rawToken: string
  /** Regenerate only: the id of the revoked predecessor (null on create or
   *  when regeneration found no live active row — plain re-issue). */
  revokedInvitationId: string | null
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Fail-closed parser of the create/regenerate success payload
 * ({invitation_id, token_prefix, expires_at, raw_token[, revoked_invitation_id]}).
 * Returns null on ANY shape mismatch — including a token that fails the exact
 * 43-char base64url contract, or a prefix that is not the token's first 8
 * chars. Callers must treat null as "operation may have succeeded server-side;
 * refresh state" and MUST NOT log the payload (it may contain the secret).
 */
export function parseTokenGrant(data: unknown): ClaimTokenGrant | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  const invitationId = d.invitation_id
  const tokenPrefix = d.token_prefix
  const expiresAt = d.expires_at
  const rawToken = d.raw_token
  if (!nonEmptyString(invitationId) || !nonEmptyString(expiresAt)) return null
  if (!isValidClaimToken(rawToken)) return null
  if (!nonEmptyString(tokenPrefix) || rawToken.slice(0, tokenPrefix.length) !== tokenPrefix) {
    return null
  }
  const revoked = d.revoked_invitation_id
  return {
    invitationId,
    tokenPrefix,
    expiresAt,
    rawToken,
    revokedInvitationId: nonEmptyString(revoked) ? revoked : null,
  }
}
