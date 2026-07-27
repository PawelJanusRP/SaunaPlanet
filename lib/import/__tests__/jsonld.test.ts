import { describe, expect, it } from 'vitest'
import { extractBusinessFromJsonLd } from '../jsonld'

const LOCAL_BUSINESS = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Sauna Leśna',
  description: 'Fińska sauna nad jeziorem.',
  url: 'https://saunalesna.pl',
  telephone: '+48 600 100 200',
  email: 'mailto:kontakt@saunalesna.pl',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Leśna 5',
    addressLocality: 'Poznań',
    postalCode: '60-001',
    addressCountry: 'PL',
  },
  geo: { '@type': 'GeoCoordinates', latitude: '52.4064', longitude: '16.9252' },
  openingHours: ['Mo-Fr 10:00-22:00'],
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['https://schema.org/Saturday', 'https://schema.org/Sunday'],
      opens: '09:00',
      closes: '23:00',
    },
  ],
  sameAs: ['https://www.facebook.com/saunalesna'],
}

describe('extractBusinessFromJsonLd', () => {
  it('extracts a business from a single JSON-LD object', () => {
    const { business, warnings } = extractBusinessFromJsonLd([JSON.stringify(LOCAL_BUSINESS)])
    expect(warnings).toEqual([])
    expect(business).not.toBeNull()
    expect(business?.name).toBe('Sauna Leśna')
    expect(business?.email).toBe('kontakt@saunalesna.pl')
    expect(business?.telephone).toBe('+48 600 100 200')
    expect(business?.address).toMatchObject({ street: 'Leśna 5', locality: 'Poznań', postalCode: '60-001', country: 'PL' })
    expect(business?.geo).toEqual({ latitude: 52.4064, longitude: 16.9252 })
    expect(business?.openingHours.raw).toEqual(['Mo-Fr 10:00-22:00'])
    expect(business?.openingHours.specifications).toEqual([
      { days: ['Saturday', 'Sunday'], opens: '09:00', closes: '23:00' },
    ])
    expect(business?.sameAs).toEqual(['https://www.facebook.com/saunalesna'])
  })

  it('extracts from a top-level array', () => {
    const blocks = [JSON.stringify([{ '@type': 'WebPage', name: 'Strona' }, LOCAL_BUSINESS])]
    const { business } = extractBusinessFromJsonLd(blocks)
    expect(business?.name).toBe('Sauna Leśna')
  })

  it('extracts from an @graph container', () => {
    const blocks = [
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'BreadcrumbList' }, LOCAL_BUSINESS, { '@type': 'WebSite', name: 'x' }],
      }),
    ]
    const { business } = extractBusinessFromJsonLd(blocks)
    expect(business?.name).toBe('Sauna Leśna')
  })

  it('skips malformed blocks with a warning and still uses valid blocks', () => {
    const { business, warnings } = extractBusinessFromJsonLd(['{not json', JSON.stringify(LOCAL_BUSINESS)])
    expect(warnings).toEqual(['malformed-jsonld-block-skipped'])
    expect(business?.name).toBe('Sauna Leśna')
  })

  it('returns null business without failing when nothing relevant exists', () => {
    const { business, warnings } = extractBusinessFromJsonLd([JSON.stringify({ '@type': 'BreadcrumbList' })])
    expect(business).toBeNull()
    expect(warnings).toEqual([])
  })

  it('prefers LocalBusiness-family nodes over Organization', () => {
    const organization = { '@type': 'Organization', name: 'Holding Sp. z o.o.' }
    const spa = { '@type': 'DaySpa', name: 'Sauna Leśna' }
    const { business } = extractBusinessFromJsonLd([JSON.stringify(organization), JSON.stringify(spa)])
    expect(business?.name).toBe('Sauna Leśna')
    expect(business?.tier).toBe(1)
  })

  it('handles @type arrays and string addresses', () => {
    const node = {
      '@type': ['Place', 'LocalBusiness'],
      name: 'Bania',
      address: 'Górska 1, 34-500 Zakopane',
    }
    const { business } = extractBusinessFromJsonLd([JSON.stringify(node)])
    expect(business?.tier).toBe(1)
    expect(business?.address).toEqual({ raw: 'Górska 1, 34-500 Zakopane' })
  })

  it('ignores unparseable geo values instead of inventing coordinates', () => {
    const node = { '@type': 'LocalBusiness', name: 'X', geo: { latitude: 'abc', longitude: '16.9' } }
    const { business } = extractBusinessFromJsonLd([JSON.stringify(node)])
    expect(business?.geo).toBeUndefined()
  })
})
