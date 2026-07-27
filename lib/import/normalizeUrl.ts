// SP-038 — canonical URL normalization.
// Pure string work: no DNS, no network, no redirect following.

import type { ImportErrorCode } from './types'

export type NormalizeSuccess = { ok: true; url: string }
export type NormalizeFailure = { ok: false; code: ImportErrorCode }
export type NormalizeResult = NormalizeSuccess | NormalizeFailure

/**
 * Query parameters that only track the visitor and never identify content.
 * Exact names plus the utm_* prefix family.
 */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'dclid',
  'twclid',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'hsctatracking',
  'yclid',
])

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)
}

/**
 * Normalizes a user-supplied URL into a canonical https form used for
 * classification, fetching and duplicate matching.
 *
 * Rules:
 * - https only (http is rejected, not silently upgraded — documented decision);
 * - embedded credentials rejected;
 * - hostname lowercased (URL API also applies IDN → punycode);
 * - default port removed; any non-443 port is rejected here so the fetcher
 *   never sees it;
 * - fragment removed;
 * - tracking parameters removed, remaining parameters kept and sorted for a
 *   deterministic canonical form;
 * - trailing slash removed on non-root paths.
 */
export function normalizeImportUrl(raw: string): NormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, code: 'invalid-url' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, code: 'invalid-url' }
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, code: 'credentials-in-url' }
  }
  if (url.protocol !== 'https:') {
    // http:, ftp:, javascript:, data:, mailto:, file: … all land here.
    return { ok: false, code: 'insecure-protocol' }
  }
  if (url.port !== '' && url.port !== '443') {
    return { ok: false, code: 'blocked-port' }
  }
  if (url.hostname === '') return { ok: false, code: 'invalid-url' }

  url.port = ''
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()

  const kept = [...url.searchParams.entries()].filter(([name]) => !isTrackingParam(name))
  kept.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)))
  url.search = ''
  for (const [name, value] of kept) url.searchParams.append(name, value)

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '')
    if (url.pathname === '') url.pathname = '/'
  }

  return { ok: true, url: url.toString() }
}
