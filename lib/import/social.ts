// SP-038 Slice 3C — social-link recognition, normalization and validation.
//
// Pure functions shared by the import pipeline (extracted page links →
// keyed object) and the submission actions (user-edited form values →
// validated saunas.social_links JSONB). HTTPS-only by contract; blank
// values are never stored; unsupported hosts are ignored here but remain
// untouched in import_log.extracted. Shortened URLs are NOT dereferenced.

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'youtube', 'tiktok'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export type SocialLinks = Partial<Record<SocialPlatform, string>>

const PLATFORM_HOSTS: Record<SocialPlatform, string[]> = {
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com', 'instagr.am'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
}

/** Tracking parameters removed during normalization; every other query
 * parameter is meaningful (e.g. facebook.com/profile.php?id=...) and kept. */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|igsh$|igshid$)/i

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

export function platformForHost(host: string): SocialPlatform | null {
  const lower = host.toLowerCase()
  for (const platform of SOCIAL_PLATFORMS) {
    if (PLATFORM_HOSTS[platform].some((d) => hostMatches(lower, d))) return platform
  }
  return null
}

/**
 * Normalizes a social URL: https only, no credentials, default port only,
 * lowercased host, tracking parameters stripped, meaningful path and query
 * preserved. Returns null (never a blank string) for anything invalid.
 */
export function normalizeSocialUrl(raw: string): { platform: SocialPlatform; url: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port && url.port !== '443') return null
  const platform = platformForHost(url.hostname)
  if (platform === null) return null

  url.hostname = url.hostname.toLowerCase()
  url.hash = ''
  const params = [...url.searchParams.keys()]
  for (const key of params) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
  }
  let serialized = url.toString()
  if (url.searchParams.toString() === '') serialized = serialized.replace(/\?$/, '')
  return { platform, url: serialized }
}

/** Extracted page links (string array) → keyed object; first valid link
 * per platform wins, unsupported hosts are skipped. */
export function socialLinksFromUrls(urls: string[]): SocialLinks {
  const result: SocialLinks = {}
  for (const raw of urls) {
    const normalized = normalizeSocialUrl(raw)
    if (normalized && result[normalized.platform] === undefined) {
      result[normalized.platform] = normalized.url
    }
  }
  return result
}

/**
 * Validates user-edited form values for persistence: only known platform
 * keys, each value must normalize to an https URL on a HOST MATCHING ITS
 * KEY (a YouTube URL in the facebook field is dropped, not re-homed).
 * Returns null when nothing valid remains — the column stays NULL rather
 * than holding an empty object.
 */
export function sanitizeSocialLinks(input: Record<string, unknown> | null | undefined): SocialLinks | null {
  if (!input) return null
  const result: SocialLinks = {}
  for (const platform of SOCIAL_PLATFORMS) {
    const value = input[platform]
    if (typeof value !== 'string') continue
    const normalized = normalizeSocialUrl(value)
    if (normalized && normalized.platform === platform) {
      result[platform] = normalized.url
    }
  }
  return Object.keys(result).length > 0 ? result : null
}
