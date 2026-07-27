// SP-038 — source-type classification.
// Classification only routes a URL to a provider or to an explicit
// unsupported state. It never implies the source is extractable.

import { normalizeImportUrl } from './normalizeUrl'
import type { ClassifiedUrl, SourceKind } from './types'

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

const FACEBOOK_DOMAINS = ['facebook.com', 'fb.com', 'fb.me', 'fb.watch']
const INSTAGRAM_DOMAINS = ['instagram.com', 'instagr.am']
const FACEBOOK_POST_SEGMENTS = new Set(['posts', 'photo', 'photos', 'videos', 'watch', 'reel'])
const FACEBOOK_POST_PAGES = new Set(['permalink.php', 'story.php', 'photo.php', 'watch'])
const INSTAGRAM_POST_SEGMENTS = new Set(['p', 'reel', 'reels', 'tv', 'stories'])

function classifyFacebook(url: URL): SourceKind {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'facebook_page'
  if (segments.includes('events')) return 'facebook_event'
  if (FACEBOOK_POST_PAGES.has(segments[0])) return 'facebook_post'
  if (segments[0] === 'share') return 'facebook_post'
  if (segments.some((s) => FACEBOOK_POST_SEGMENTS.has(s))) return 'facebook_post'
  return 'facebook_page'
}

function classifyInstagram(url: URL): SourceKind {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length > 0 && INSTAGRAM_POST_SEGMENTS.has(segments[0])) return 'instagram_post'
  return 'instagram_profile'
}

function isGoogleMaps(url: URL): boolean {
  const host = url.hostname
  if (host === 'maps.app.goo.gl') return true
  if (host === 'goo.gl' && url.pathname.startsWith('/maps')) return true
  if (host === 'maps.google.com' || host.startsWith('maps.google.')) return true
  // google.<tld>/maps… (including www.)
  const isGoogleHost = host === 'google.com' || host.startsWith('google.') || hostMatches(host, 'google.com') || /^www\.google\.[a-z.]+$/.test(host)
  return isGoogleHost && url.pathname.startsWith('/maps')
}

/**
 * Normalizes and classifies a user-supplied URL.
 * Inputs that fail normalization are classified as 'unsupported' with the
 * normalization error code attached.
 */
export function classifyImportUrl(raw: string): ClassifiedUrl {
  const normalized = normalizeImportUrl(raw)
  if (!normalized.ok) {
    return { kind: 'unsupported', url: null, error: normalized.code }
  }

  const url = new URL(normalized.url)
  const host = url.hostname

  if (FACEBOOK_DOMAINS.some((d) => hostMatches(host, d))) {
    return { kind: classifyFacebook(url), url: normalized.url }
  }
  if (INSTAGRAM_DOMAINS.some((d) => hostMatches(host, d))) {
    return { kind: classifyInstagram(url), url: normalized.url }
  }
  if (isGoogleMaps(url)) {
    return { kind: 'google_maps', url: normalized.url }
  }
  return { kind: 'website', url: normalized.url }
}
