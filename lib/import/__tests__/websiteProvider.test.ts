import { describe, expect, it } from 'vitest'
import { extractFacilityFromUrl } from '../index'
import { extractFromWebsite } from '../providers/website'
import { makeTransport } from './helpers'

const PUBLIC_IP = ['93.184.216.34']

const JSONLD_HTML = `<!doctype html>
<html><head>
<title>Sauna Leśna — strona</title>
<meta property="og:title" content="Sauna Leśna (OG)" />
<meta property="og:description" content="Opis z OG" />
<meta property="og:image" content="/img/cover.jpg" />
<meta property="og:site_name" content="Sauna Leśna" />
<link rel="canonical" href="https://saunalesna.pl/" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Sauna Leśna",
  "description": "Fińska sauna nad jeziorem.",
  "url": "https://saunalesna.pl",
  "telephone": "+48 600 100 200",
  "email": "kontakt@saunalesna.pl",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Leśna 5",
    "addressLocality": "Poznań",
    "postalCode": "60-001",
    "addressCountry": "PL"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 52.4064, "longitude": 16.9252 },
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": "https://schema.org/Monday", "opens": "10:00", "closes": "22:00" }
  ],
  "sameAs": ["https://www.facebook.com/saunalesna"]
}
</script>
</head><body><a href="mailto:biuro@saunalesna.pl">mail</a></body></html>`

const OG_ONLY_HTML = `<!doctype html>
<html><head>
<title>Bania na Górce | Oficjalna strona</title>
<meta property="og:title" content="Bania na Górce" />
<meta property="og:description" content="Sauny i balia w górach." />
<meta property="og:image" content="https://cdn.bania.pl/cover.jpg" />
<meta name="description" content="Meta opis strony." />
</head><body>
<a href="tel:+48 601 202 303">zadzwoń</a>
<a href="https://www.instagram.com/bania.na.gorce">IG</a>
</body></html>`

const BARE_HTML = `<html><head><title>Jakaś strona</title></head><body><p>nic</p></body></html>`

// Deterministic regression fixture for the Lake Hill Mazury structure
// (Slice 3C approved decision): a primary Hotel node with facility-level
// contact/address but NO description, plus a secondary TouristAttraction
// node that carries the sauna-zone description. No og:description and no
// meta description anywhere.
const LAKEHILL_HTML = `<!doctype html>
<html><head>
<meta property="og:title" content="Strefa Saun i Łaźni" />
<meta property="og:image" content="https://cdn.lakehill.example/attractions/1716904034.Projekt bez nazwy (2).jpg" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Hotel","name":"Lake Hill Mazury Resort & Spa",
 "url":"https://www.lakehill.example/atrakcje/strefa-saun",
 "address":{"@type":"PostalAddress","streetAddress":"Turystyczna 15","addressLocality":"Ostróda","postalCode":"14-100","addressCountry":"PL"},
 "geo":{"@type":"GeoCoordinates","latitude":53.7091685,"longitude":19.9438107},
 "telephone":"89 307 50 50","email":"reservation@lakehill.example"}
</script>
<script type="application/ld+json">
{"@type":"TouristAttraction","name":"Strefa Saun i Łaźni","@context":"https://schema.org",
 "url":"https://www.lakehill.example/atrakcje/strefa-saun",
 "description":"Zregeneruj się, oczyść organizm, zrelaksuj zmysły. Skorzystaj z sauny fińskiej i łaźni parowej.",
 "image":["https://cdn.lakehill.example/attractions/other.jpg"]}
</script>
</head><body></body></html>`

function siteTransport(html: string, url = 'https://saunalesna.pl/') {
  const host = new URL(url).hostname
  return makeTransport({ dns: { [host]: PUBLIC_IP }, routes: { [url]: { body: html } } })
}

describe('extractFromWebsite', () => {
  it('prefers JSON-LD with high confidence and full provenance', async () => {
    const result = await extractFromWebsite('https://saunalesna.pl/', { transport: siteTransport(JSONLD_HTML) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result).toBe('ok')
    expect(result.draft.name).toEqual({
      value: 'Sauna Leśna',
      origin: 'jsonld',
      confidence: 'high',
      sourceHint: 'JSON-LD LocalBusiness.name',
    })
    expect(result.draft.description?.origin).toBe('jsonld')
    expect(result.draft.address?.value).toBe('Leśna 5, 60-001 Poznań')
    expect(result.draft.city?.value).toBe('Poznań')
    expect(result.draft.country?.value).toBe('PL')
    expect(result.draft.phone?.value).toBe('+48 600 100 200')
    expect(result.draft.email).toMatchObject({ value: 'kontakt@saunalesna.pl', origin: 'jsonld', confidence: 'high' })
    expect(result.draft.website?.value).toBe('https://saunalesna.pl')
    expect(result.draft.geo?.value).toEqual({ latitude: 52.4064, longitude: 16.9252 })
    expect(result.draft.geo?.confidence).toBe('high')
    expect(result.draft.openingHours?.value.specifications).toEqual([
      { days: ['Monday'], opens: '10:00', closes: '22:00' },
    ])
    expect(result.draft.imageUrl?.origin).toBe('opengraph') // JSON-LD has no image → og:image fallback
    expect(result.draft.imageUrl?.value).toBe('https://saunalesna.pl/img/cover.jpg')
    expect(result.draft.socialLinks?.value).toContain('https://www.facebook.com/saunalesna')
    expect(result.draft.sourceTitle?.value).toBe('Sauna Leśna')
  })

  it('falls back to Open Graph and conservative HTML when JSON-LD is absent', async () => {
    const result = await extractFromWebsite('https://saunalesna.pl/', { transport: siteTransport(OG_ONLY_HTML) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.name).toMatchObject({ value: 'Bania na Górce', origin: 'opengraph', confidence: 'medium' })
    expect(result.draft.description).toMatchObject({ value: 'Sauny i balia w górach.', origin: 'opengraph' })
    expect(result.draft.phone).toMatchObject({ value: '+48 601 202 303', origin: 'html', confidence: 'low' })
    expect(result.draft.imageUrl?.value).toBe('https://cdn.bania.pl/cover.jpg')
    expect(result.draft.socialLinks?.value).toEqual(['https://www.instagram.com/bania.na.gorce'])
    expect(result.draft.website).toMatchObject({ value: 'https://saunalesna.pl/', origin: 'html', confidence: 'low' })
    expect(result.draft.geo).toBeUndefined()
    expect(result.draft.openingHours).toBeUndefined()
  })

  it('degrades to partial with title-tag name on bare pages', async () => {
    const result = await extractFromWebsite('https://saunalesna.pl/', { transport: siteTransport(BARE_HTML) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.name).toMatchObject({ value: 'Jakaś strona', origin: 'html', confidence: 'low' })
    expect(result.result).toBe('ok') // name present (low confidence)
    expect(result.draft.description).toBeUndefined()
  })

  it('propagates typed fetch failures', async () => {
    const transport = makeTransport({ dns: { 'saunalesna.pl': ['10.0.0.1'] }, routes: {} })
    const result = await extractFromWebsite('https://saunalesna.pl/', { transport })
    expect(result).toMatchObject({ ok: false, kind: 'website', code: 'blocked-address' })
  })

  it('reports malformed JSON-LD as a warning, not a failure', async () => {
    const html = `<html><head><title>X</title><script type="application/ld+json">{broken</script></head></html>`
    const result = await extractFromWebsite('https://saunalesna.pl/', { transport: siteTransport(html) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual(['malformed-jsonld-block-skipped'])
  })

  it('fills missing fields from a lower-ranked JSON-LD node (Lake Hill regression)', async () => {
    const result = await extractFromWebsite('https://saunalesna.pl/', {
      transport: siteTransport(LAKEHILL_HTML),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Primary Hotel node wins for every field it carries — never replaced
    // by the more sauna-specific TouristAttraction name.
    expect(result.draft.name).toMatchObject({
      value: 'Lake Hill Mazury Resort & Spa',
      origin: 'jsonld',
      confidence: 'high',
      sourceHint: 'JSON-LD Hotel.name',
    })
    expect(result.draft.phone?.value).toBe('89 307 50 50')
    expect(result.draft.email?.value).toBe('reservation@lakehill.example')
    expect(result.draft.city?.value).toBe('Ostróda')
    expect(result.draft.geo?.value).toEqual({ latitude: 53.7091685, longitude: 19.9438107 })
    // The missing description is filled from the SECONDARY node with
    // node-accurate provenance and medium confidence.
    expect(result.draft.description).toEqual({
      value: 'Zregeneruj się, oczyść organizm, zrelaksuj zmysły. Skorzystaj z sauny fińskiej i łaźni parowej.',
      origin: 'jsonld',
      confidence: 'medium',
      sourceHint: 'JSON-LD TouristAttraction.description',
    })
    // Primary has no image → fallback node image wins over og:image and
    // the og:image URL with a raw space is serialized percent-encoded.
    expect(result.draft.imageUrl?.sourceHint).toBe('JSON-LD TouristAttraction.image')
  })

  it('percent-encodes unsafe characters in og:image URLs (space case)', async () => {
    const html = `<html><head><title>X</title>
      <meta property="og:image" content="https://cdn.example.pl/img/Projekt bez nazwy (2).jpg" />
      </head></html>`
    const result = await extractFromWebsite('https://saunalesna.pl/', { transport: siteTransport(html) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft.imageUrl?.value).toBe(
      'https://cdn.example.pl/img/Projekt%20bez%20nazwy%20(2).jpg'
    )
  })
})

describe('extractFacilityFromUrl (engine routing)', () => {
  it('routes website URLs to the website provider', async () => {
    const result = await extractFacilityFromUrl('https://saunalesna.pl/?utm_source=x', {
      transport: siteTransport(JSONLD_HTML),
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requestedUrl).toBe('https://saunalesna.pl/')
  })

  it('returns unsupported-source for social and maps URLs (no scraping attempted)', async () => {
    const transport = makeTransport({ dns: {}, routes: {} })
    for (const [url, kind] of [
      ['https://www.facebook.com/SaunaPoznan', 'facebook_page'],
      ['https://www.instagram.com/sauna.poznan', 'instagram_profile'],
      ['https://maps.app.goo.gl/AbCdEf', 'google_maps'],
    ] as const) {
      expect(await extractFacilityFromUrl(url, { transport })).toMatchObject({
        ok: false,
        kind,
        code: 'unsupported-source',
      })
    }
  })

  it('returns the normalization error for rejected inputs', async () => {
    expect(await extractFacilityFromUrl('http://insecure.pl')).toMatchObject({
      ok: false,
      kind: 'unsupported',
      code: 'insecure-protocol',
      requestedUrl: null,
    })
  })
})
