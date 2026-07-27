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

type PickedValue<T> = { value: T; node: JsonLdBusiness; primary: boolean }

/**
 * Slice 3C deterministic per-field merge: the first node (the primary
 * selection, unchanged) always wins; fields it lacks are filled from
 * lower-ranked recognized nodes. Never overwrites, never concatenates.
 */
function pickFromNodes<T>(
  nodes: JsonLdBusiness[],
  get: (b: JsonLdBusiness) => T | undefined
): PickedValue<T> | undefined {
  for (let i = 0; i < nodes.length; i += 1) {
    const value = get(nodes[i])
    if (value !== undefined) return { value, node: nodes[i], primary: i === 0 }
  }
  return undefined
}

/** Provenance for a merged JSON-LD value: the ACTUAL node type + field
 * (e.g. "JSON-LD TouristAttraction.description"); fallback-node values
 * carry confidence medium. */
function jsonLdField<T>(picked: PickedValue<T>, fieldName: string): ExtractedField<T> {
  return field(
    picked.value,
    'jsonld',
    picked.primary ? 'high' : 'medium',
    `JSON-LD ${picked.node.types[0] ?? 'node'}.${fieldName}`
  )
}

function buildDraft(doc: HtmlDocumentMeta, nodes: JsonLdBusiness[], finalUrl: string): FacilityDraft {
  const draft: FacilityDraft = {}

  const name = pickFromNodes(nodes, (b) => b.name)
  if (name) draft.name = jsonLdField(name, 'name')
  else if (doc.meta.get('og:title')) draft.name = field(doc.meta.get('og:title') as string, 'opengraph', 'medium', 'og:title')
  else if (doc.title) draft.name = field(doc.title, 'html', 'low', 'title tag')

  const description = pickFromNodes(nodes, (b) => b.description)
  if (description) draft.description = jsonLdField(description, 'description')
  else if (doc.meta.get('og:description')) {
    draft.description = field(doc.meta.get('og:description') as string, 'opengraph', 'medium', 'og:description')
  } else if (doc.meta.get('description')) {
    draft.description = field(doc.meta.get('description') as string, 'metadata', 'low', 'meta description')
  }

  const address = pickFromNodes(nodes, (b) => composeAddress(b))
  if (address) draft.address = jsonLdField(address, 'address')
  const locality = pickFromNodes(nodes, (b) => b.address?.locality)
  if (locality) draft.city = jsonLdField(locality, 'address.addressLocality')
  const country = pickFromNodes(nodes, (b) => b.address?.country)
  if (country) draft.country = jsonLdField(country, 'address.addressCountry')

  const telephone = pickFromNodes(nodes, (b) => b.telephone)
  if (telephone) draft.phone = jsonLdField(telephone, 'telephone')
  else if (doc.telLinks.length > 0) draft.phone = field(doc.telLinks[0], 'html', 'low', 'tel: link')

  const email = pickFromNodes(nodes, (b) => b.email)
  if (email) draft.email = jsonLdField(email, 'email')
  else if (doc.mailtoLinks.length > 0) draft.email = field(doc.mailtoLinks[0], 'html', 'low', 'mailto: link')

  const url = pickFromNodes(nodes, (b) => b.url)
  if (url) draft.website = jsonLdField(url, 'url')
  else if (doc.canonical) {
    const canonical = absoluteUrl(doc.canonical, finalUrl)
    if (canonical) draft.website = field(canonical, 'metadata', 'high', 'link rel=canonical')
  }
  if (!draft.website && doc.meta.get('og:url')) {
    const ogUrl = absoluteUrl(doc.meta.get('og:url') as string, finalUrl)
    if (ogUrl) draft.website = field(ogUrl, 'opengraph', 'medium', 'og:url')
  }
  if (!draft.website) draft.website = field(finalUrl, 'html', 'low', 'fetched URL')

  const geo = pickFromNodes(nodes, (b) => (b.geo ? validGeo(b.geo.latitude, b.geo.longitude) : undefined))
  if (geo) draft.geo = jsonLdField(geo, 'geo')
  if (!draft.geo) {
    const metaGeo = geoFromMeta(doc)
    if (metaGeo) draft.geo = field(metaGeo, 'metadata', 'medium', 'geo.position / ICBM meta')
  }

  const hours = pickFromNodes(nodes, (b) =>
    b.openingHours.specifications.length > 0 || b.openingHours.raw.length > 0 ? b.openingHours : undefined
  )
  if (hours) draft.openingHours = jsonLdField(hours, 'openingHours')

  const image = pickFromNodes(nodes, (b) => (b.image ? absoluteUrl(b.image, finalUrl) : undefined))
  if (image) draft.imageUrl = jsonLdField(image, 'image')
  if (!draft.imageUrl && doc.meta.get('og:image')) {
    const ogImage = absoluteUrl(doc.meta.get('og:image') as string, finalUrl)
    if (ogImage) draft.imageUrl = field(ogImage, 'opengraph', 'medium', 'og:image')
  }

  const sameAs = [...new Set(nodes.flatMap((b) => b.sameAs))]
  const socialLinks = [...new Set([...sameAs, ...doc.socialLinks])]
  if (socialLinks.length > 0) {
    draft.socialLinks = field(
      socialLinks,
      sameAs.length > 0 ? 'jsonld' : 'html',
      'medium',
      sameAs.length > 0 ? 'JSON-LD sameAs + page links' : 'page links'
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
  const { business, others, warnings } = extractBusinessFromJsonLd(doc.jsonLdBlocks)
  const draft = buildDraft(doc, business ? [business, ...others] : [], fetched.finalUrl)

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
