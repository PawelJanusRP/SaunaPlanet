// SP-038 — JSON-LD business-data extraction.
//
// Accepts JSON-LD supplied as a single object, an array, or an @graph
// container. Malformed blocks are skipped with a warning — a broken block
// never fails the whole import. Values are taken verbatim (normalized
// whitespace only); nothing is invented.

import type { OpeningHoursDraft, OpeningHoursSpecificationDraft } from './types'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

export type JsonLdAddress = {
  street?: string
  locality?: string
  region?: string
  postalCode?: string
  country?: string
  /** Set when the source supplied the address as a plain string. */
  raw?: string
}

export type JsonLdBusiness = {
  types: string[]
  /** 1 = LocalBusiness family, 2 = Place-like, 3 = Organization. */
  tier: 1 | 2 | 3
  name?: string
  description?: string
  url?: string
  telephone?: string
  email?: string
  address?: JsonLdAddress
  geo?: { latitude: number; longitude: number }
  openingHours: OpeningHoursDraft
  image?: string
  sameAs: string[]
}

const TIER1_TYPES = new Set([
  'localbusiness',
  'healthandbeautybusiness',
  'dayspa',
  'healthclub',
  'exercisegym',
  'sportsactivitylocation',
  'publicswimmingpool',
  'hotel',
  'resort',
  'lodgingbusiness',
  'restaurant',
  'entertainmentbusiness',
])
const TIER2_TYPES = new Set(['place', 'touristattraction', 'civicstructure', 'landmarksorhistoricalbuildings'])
const TIER3_TYPES = new Set(['organization'])

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s+/g, ' ').trim()
    return cleaned || undefined
  }
  return undefined
}

function asNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (typeof value === 'string') return asString(value) ? [asString(value) as string] : []
  if (Array.isArray(value)) return value.map((v) => asString(v)).filter((v): v is string => v !== undefined)
  return []
}

/** "https://schema.org/Monday" → "Monday"; short values pass through. */
function normalizeDay(value: string): string {
  const segment = value.split('/').filter(Boolean).pop() ?? value
  return segment.trim()
}

function typeTier(types: string[]): 1 | 2 | 3 | null {
  const lower = types.map((t) => t.toLowerCase())
  if (lower.some((t) => TIER1_TYPES.has(t) || t.endsWith('business'))) return 1
  if (lower.some((t) => TIER2_TYPES.has(t))) return 2
  if (lower.some((t) => TIER3_TYPES.has(t))) return 3
  return null
}

function collectNodes(value: JsonValue, into: JsonObject[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, into)
    return
  }
  if (!isObject(value)) return
  if (value['@type'] !== undefined) into.push(value)
  const graph = value['@graph']
  if (Array.isArray(graph)) collectNodes(graph, into)
}

function parseOpeningHours(node: JsonObject): OpeningHoursDraft {
  const raw = asStringArray(node.openingHours)
  const specifications: OpeningHoursSpecificationDraft[] = []
  const specValue = node.openingHoursSpecification
  const specList = Array.isArray(specValue) ? specValue : specValue !== undefined ? [specValue] : []
  for (const spec of specList) {
    if (!isObject(spec)) continue
    const days = asStringArray(spec.dayOfWeek).map(normalizeDay)
    const opens = asString(spec.opens) ?? null
    const closes = asString(spec.closes) ?? null
    if (days.length > 0 || opens || closes) {
      specifications.push({ days, opens, closes })
    }
  }
  return { specifications, raw }
}

function parseAddress(value: JsonValue | undefined): JsonLdAddress | undefined {
  const raw = asString(value)
  if (raw) return { raw }
  if (!isObject(value)) return undefined
  const country = asString(value.addressCountry) ?? (isObject(value.addressCountry) ? asString(value.addressCountry.name) : undefined)
  const address: JsonLdAddress = {
    street: asString(value.streetAddress),
    locality: asString(value.addressLocality),
    region: asString(value.addressRegion),
    postalCode: asString(value.postalCode),
    country,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

function parseImage(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') return asString(value)
  if (Array.isArray(value)) return parseImage(value[0])
  if (isObject(value)) return asString(value.url)
  return undefined
}

function toBusiness(node: JsonObject): JsonLdBusiness | null {
  const types = asStringArray(node['@type']).map((t) => normalizeDay(t))
  const tier = typeTier(types)
  if (tier === null) return null

  const geoValue = node.geo
  let geo: { latitude: number; longitude: number } | undefined
  if (isObject(geoValue)) {
    const latitude = asNumber(geoValue.latitude)
    const longitude = asNumber(geoValue.longitude)
    if (latitude !== undefined && longitude !== undefined) geo = { latitude, longitude }
  }

  const email = asString(node.email)
  return {
    types,
    tier,
    name: asString(node.name),
    description: asString(node.description),
    url: asString(node.url),
    telephone: asString(node.telephone),
    email: email?.replace(/^mailto:/i, ''),
    address: parseAddress(node.address),
    geo,
    openingHours: parseOpeningHours(node),
    image: parseImage(node.image),
    sameAs: asStringArray(node.sameAs),
  }
}

function filledFieldCount(business: JsonLdBusiness): number {
  let count = 0
  if (business.name) count += 1
  if (business.description) count += 1
  if (business.telephone) count += 1
  if (business.email) count += 1
  if (business.address) count += 1
  if (business.geo) count += 1
  if (business.openingHours.specifications.length > 0 || business.openingHours.raw.length > 0) count += 1
  return count
}

export type JsonLdExtraction = {
  business: JsonLdBusiness | null
  /**
   * Remaining recognized nodes ranked best-first (tier, then filled
   * fields). Used for deterministic per-field fallback (Slice 3C): fields
   * missing on the primary node may be filled from these — the primary
   * selection itself is never changed by them.
   */
  others: JsonLdBusiness[]
  warnings: string[]
}

/**
 * Parses the collected JSON-LD blocks and returns the most relevant
 * business node (best type tier, then most filled fields) plus the
 * remaining recognized nodes in rank order.
 */
export function extractBusinessFromJsonLd(blocks: string[]): JsonLdExtraction {
  const warnings: string[] = []
  const nodes: JsonObject[] = []
  for (const block of blocks) {
    try {
      collectNodes(JSON.parse(block) as JsonValue, nodes)
    } catch {
      warnings.push('malformed-jsonld-block-skipped')
    }
  }

  const recognized: JsonLdBusiness[] = []
  for (const node of nodes) {
    const business = toBusiness(node)
    if (business) recognized.push(business)
  }
  recognized.sort(
    (a, b) => a.tier - b.tier || filledFieldCount(b) - filledFieldCount(a)
  )
  const [best = null, ...others] = recognized
  return { business: best, others, warnings }
}
