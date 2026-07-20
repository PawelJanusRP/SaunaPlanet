// SP-038 — official-website import provider.
//
// Extraction preference order (never inventing values):
// 1. JSON-LD business data (high confidence)
// 2. Open Graph (medium)
// 3. standard metadata (medium/low)
// 4. conservative HTML fallbacks: title tag, mailto:/tel: links (low)

import { parseHtmlDocument, type HtmlDocumentMeta } from '../htmlMeta'
import { extractBusinessFromJsonLd, type JsonLdBusiness } from '../jsonld'
import { safeFetchHtml, type SafeFetchOptions } from '../safeFetch'
import type {
  ExtractedField,
  FacilityDraft,
  FieldConfidence,
  FieldOrigin,
  GeoDraft,
  ProviderResult,
} from '../types'

function field<T>(value: T, origin: FieldOrigin, confidence: FieldConfidence, sourceHint: string): ExtractedField<T> {
  return { value, origin, confidence, sourceHint }
}

function composeAddress(business: JsonLdBusiness): string | undefined {
  const address = business.address
  if (!address) return undefined
  if (address.raw) return address.raw
  const cityLine = [address.postalCode, address.locality].filter(Boolean).join(' ')
  const composed = [address.street, cityLine].filter(Boolean).join(', ')
  return composed || undefined
}

function absoluteUrl(candidate: string, base: string): string | undefined {
  try {
    const url = new URL(candidate, base)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function validGeo(latitude: number, longitude: number): GeoDraft | undefined {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined
  if (latitude === 0 && longitude === 0) return undefined
  return { latitude, longitude }
}

/** Parses "52.4;16.9" / "52.4, 16.9" from geo.position / ICBM meta tags. */
function geoFromMeta(doc: HtmlDocumentMeta): GeoDraft | undefined {
  const raw = doc.meta.get('geo.position') ?? doc.meta.get('icbm')
  if (!raw) return undefined
  const parts = raw.split(/[;,]/).map((p) => Number(p.trim()))
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return undefined
  return validGeo(parts[0], parts[1])
}

function buildDraft(doc: HtmlDocumentMeta, business: JsonLdBusiness | null, finalUrl: string): FacilityDraft {
  const draft: FacilityDraft = {}
  const jsonLdHint = business ? `JSON-LD ${business.types[0] ?? 'node'}` : ''

  if (business?.name) draft.name = field(business.name, 'jsonld', 'high', `${jsonLdHint}.name`)
  else if (doc.meta.get('og:title')) draft.name = field(doc.meta.get('og:title') as string, 'opengraph', 'medium', 'og:title')
  else if (doc.title) draft.name = field(doc.title, 'html', 'low', 'title tag')

  if (business?.description) draft.description = field(business.description, 'jsonld', 'high', `${jsonLdHint}.description`)
  else if (doc.meta.get('og:description')) {
    draft.description = field(doc.meta.get('og:description') as string, 'opengraph', 'medium', 'og:description')
  } else if (doc.meta.get('description')) {
    draft.description = field(doc.meta.get('description') as string, 'metadata', 'low', 'meta description')
  }

  const address = business ? composeAddress(business) : undefined
  if (address) draft.address = field(address, 'jsonld', 'high', `${jsonLdHint}.address`)
  if (business?.address?.locality) draft.city = field(business.address.locality, 'jsonld', 'high', `${jsonLdHint}.address.addressLocality`)
  if (business?.address?.country) draft.country = field(business.address.country, 'jsonld', 'high', `${jsonLdHint}.address.addressCountry`)

  if (business?.telephone) draft.phone = field(business.telephone, 'jsonld', 'high', `${jsonLdHint}.telephone`)
  else if (doc.telLinks.length > 0) draft.phone = field(doc.telLinks[0], 'html', 'low', 'tel: link')

  if (business?.email) draft.email = field(business.email, 'jsonld', 'high', `${jsonLdHint}.email`)
  else if (doc.mailtoLinks.length > 0) draft.email = field(doc.mailtoLinks[0], 'html', 'low', 'mailto: link')

  if (business?.url) draft.website = field(business.url, 'jsonld', 'high', `${jsonLdHint}.url`)
  else if (doc.canonical) {
    const canonical = absoluteUrl(doc.canonical, finalUrl)
    if (canonical) draft.website = field(canonical, 'metadata', 'high', 'link rel=canonical')
  }
  if (!draft.website && doc.meta.get('og:url')) {
    const ogUrl = absoluteUrl(doc.meta.get('og:url') as string, finalUrl)
    if (ogUrl) draft.website = field(ogUrl, 'opengraph', 'medium', 'og:url')
  }
  if (!draft.website) draft.website = field(finalUrl, 'html', 'low', 'fetched URL')

  if (business?.geo) {
    const geo = validGeo(business.geo.latitude, business.geo.longitude)
    if (geo) draft.geo = field(geo, 'jsonld', 'high', `${jsonLdHint}.geo`)
  }
  if (!draft.geo) {
    const metaGeo = geoFromMeta(doc)
    if (metaGeo) draft.geo = field(metaGeo, 'metadata', 'medium', 'geo.position / ICBM meta')
  }

  if (business && (business.openingHours.specifications.length > 0 || business.openingHours.raw.length > 0)) {
    draft.openingHours = field(business.openingHours, 'jsonld', 'high', `${jsonLdHint}.openingHours`)
  }

  if (business?.image) {
    const image = absoluteUrl(business.image, finalUrl)
    if (image) draft.imageUrl = field(image, 'jsonld', 'high', `${jsonLdHint}.image`)
  }
  if (!draft.imageUrl && doc.meta.get('og:image')) {
    const image = absoluteUrl(doc.meta.get('og:image') as string, finalUrl)
    if (image) draft.imageUrl = field(image, 'opengraph', 'medium', 'og:image')
  }

  const sameAs = business?.sameAs ?? []
  const socialLinks = [...new Set([...sameAs, ...doc.socialLinks])]
  if (socialLinks.length > 0) {
    draft.socialLinks = field(
      socialLinks,
      sameAs.length > 0 ? 'jsonld' : 'html',
      'medium',
      sameAs.length > 0 ? `${jsonLdHint}.sameAs + page links` : 'page links'
    )
  }

  if (doc.meta.get('og:site_name')) {
    draft.sourceTitle = field(doc.meta.get('og:site_name') as string, 'opengraph', 'medium', 'og:site_name')
  } else if (doc.title) {
    draft.sourceTitle = field(doc.title, 'html', 'low', 'title tag')
  }

  return draft
}

/**
 * Fetches a public facility website and extracts a facility draft with
 * field-level provenance. Never throws for expected failure modes —
 * returns a typed ProviderResult instead.
 */
export async function extractFromWebsite(normalizedUrl: string, options: SafeFetchOptions = {}): Promise<ProviderResult> {
  const fetched = await safeFetchHtml(normalizedUrl, options)
  if (!fetched.ok) {
    return { ok: false, kind: 'website', requestedUrl: normalizedUrl, code: fetched.code, status: fetched.status }
  }

  const doc = parseHtmlDocument(fetched.html)
  const { business, warnings } = extractBusinessFromJsonLd(doc.jsonLdBlocks)
  const draft = buildDraft(doc, business, fetched.finalUrl)

  return {
    ok: true,
    kind: 'website',
    requestedUrl: normalizedUrl,
    finalUrl: fetched.finalUrl,
    draft,
    warnings,
    result: draft.name ? 'ok' : 'partial',
  }
}
