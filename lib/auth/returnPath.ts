// SP-039 Slice 4B — auth-callback return-path allow-list (pure).
//
// The callback previously redirected to any `?next=` value prefixed with the
// deployment origin. This sanitizer makes the surface explicit and fail-closed:
// only known internal, path-only destinations are ever returned; EVERYTHING
// else collapses to '/'. The claim route is allow-listed because the invitation
// token legitimately lives in its PATH segment — but no SaunaPlanet code ever
// generates a `next` value containing it (the claim flow authenticates inline
// and never leaves the page); accepting it here is defense-in-depth for a user
// arriving with a legitimate deep link, not a transport we create.

/** Path-only claim route: /claim/master/<43-char base64url token>. */
const CLAIM_RETURN_PATH = /^\/claim\/master\/[A-Za-z0-9_-]{43}$/

/** Exact internal destinations the callback may return to. */
const EXACT_RETURN_PATHS = new Set(['/', '/studio'])

export const FALLBACK_RETURN_PATH = '/'

/**
 * Narrow an untrusted `next` value to a safe internal path.
 * Rejects (falling back to '/'): non-strings, empty or oversized values,
 * anything not starting with a single '/', protocol-relative '//',
 * backslashes, traversal, query strings, fragments, whitespace/control
 * characters, and ALL percent-encoding (no allow-listed destination needs it,
 * so any encoded value is an evasion attempt by definition).
 */
export function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) {
    return FALLBACK_RETURN_PATH
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) return FALLBACK_RETURN_PATH
  if (
    raw.includes('\\') ||
    raw.includes('..') ||
    raw.includes('?') ||
    raw.includes('#') ||
    raw.includes('%') ||
    /[\u0000-\u001f\u007f\s]/.test(raw)
  ) {
    return FALLBACK_RETURN_PATH
  }
  if (EXACT_RETURN_PATHS.has(raw)) return raw
  if (CLAIM_RETURN_PATH.test(raw)) return raw
  return FALLBACK_RETURN_PATH
}
