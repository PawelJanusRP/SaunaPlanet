import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BASE_URL =
  'https://www.polskietowarzystwosaunowe.pl/partnerzy/lista-partnerow-obiekty/obiekt'

const START_ID = Number(process.env.PTS_START_ID ?? 1)
const END_ID = Number(process.env.PTS_END_ID ?? 300)

type ImportStatus = 'OK' | 'SKIP' | 'ERROR'

type SaunaRow = {
  pts_id: number
  name: string
  city: string | null
  voivodeship: string | null
  category: string
  pts_type: string | null
  description: string | null
  ceremonies: string | null
  attractions: string | null
  limitations: string | null
  source: string
  source_url: string
  latitude: number
  longitude: number
  status: string
  cover_image_url: string | null
  website: string | null
}

function extractCoverImageUrl(html: string, sourceUrl: string): string | null {
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (ogImage?.[1]) {
    return new URL(ogImage[1], sourceUrl).toString()
  }

  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (img?.[1]) {
    return new URL(img[1], sourceUrl).toString()
  }

  return null
}

function cleanText(value: string | null): string | null {
  if (!value) return null

  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&oacute;/g, 'ó')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()

  return cleaned || null
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ')
}

function extractWebsite(html: string): string | null {
  const field = extractField(html, 'Strona WWW')
  if (!field) return null

  const urls = field.match(/https?:\/\/[^\s,]+/gi)
  if (!urls?.length) return null

  const url = urls.find((value) => {
    const lower = value.toLowerCase()

    return (
      !lower.includes('facebook.com') &&
      !lower.includes('saunowe.pl') &&
      !lower.includes('twitter.com') &&
      !lower.includes('x.com')
    )
  })

  return url ?? urls[0]
}

function extractField(html: string, label: string): string | null {
  const boundaries = [
    'Nazwa:',
    'Lokalizacja:',
    'Strona WWW:',
    'Adres strony:',
    'WWW:',
    'Rodzaj obiektu:',
    'Oferta partnerska:',
    'Ceremonie:',
    'Atrakcje:',
    'Godziny i dni specjalne:',
    'Ograniczenia:',
    'Czy warto odwiedzić\\?:',
    'Powrót do listy',
    '$',
  ].join('|')

  const regex = new RegExp(
    `${label}:\\s*([\\s\\S]*?)(?=(${boundaries}))`,
    'i'
  )

  const match = html.match(regex)
  if (!match) return null

  return cleanText(stripHtml(match[1]))
}

function extractName(html: string): string | null {
  const fromField = extractField(html, 'Nazwa')
  if (fromField) return fromField

  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
  if (!h1) return null

  return cleanText(stripHtml(h1[1]))
}

function parseLocation(location: string | null) {
  if (!location) {
    return {
      city: null,
      voivodeship: null,
    }
  }

  const cleaned = location
    .replace(/^w obiekcie:\s*/i, '')
    .replace(/\s+w obiekcie:\s+/i, ' ')
    .trim()

  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean)

  const woj = parts.find((p) => p.toLowerCase().includes('woj.'))

  // If location is not comma-separated, take the last word group as a weak city fallback.
  // Examples: "AQUA ZDRÓJ Wałbrzych ..." often still contains city at the end.
  const city =
    parts[0] ||
    cleaned
      .replace(/woj\.\s*\S+/i, '')
      .split(/\s+/)
      .slice(-2)
      .join(' ')
      .trim() ||
    null

  return {
    city,
    voivodeship: woj ? woj.replace(/^woj\.\s*/i, '').trim() : null,
  }
}

function mapCategory(type: string | null): string {
  const value = (type ?? '').toLowerCase()

  if (value.includes('hotel')) return 'hotel'
  if (value.includes('spa')) return 'spa'
  if (value.includes('plener')) return 'outdoor'
  if (value.includes('basen')) return 'public_sauna'
  if (value.includes('aquapark')) return 'public_sauna'
  if (value.includes('term')) return 'public_sauna'

  return 'public_sauna'
}

async function logImport(
  ptsId: number,
  status: ImportStatus,
  reason: string,
  saunaName: string | null,
  sourceUrl: string
) {
  const { error } = await supabase.from('pts_import_log').insert({
    pts_id: ptsId,
    status,
    reason,
    sauna_name: saunaName,
    source_url: sourceUrl,
  })

  if (error) {
    console.error('LOG ERROR:', error)
  }
}

async function geocode(city: string | null, name: string) {
  const queries = [
    `${name}, ${city ?? ''}, Polska`,
    city ? `${city}, Polska` : '',
  ]

  for (const q of queries) {
    const trimmed = q.trim()
    if (!trimmed) continue

    const query = encodeURIComponent(trimmed)
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SaunaPlanet MVP import contact: local-development',
      },
    })

    if (!response.ok) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      continue
    }

    const data = (await response.json()) as Array<{
      lat: string
      lon: string
    }>

    if (data.length) {
      return {
        latitude: Number(data[0].lat),
        longitude: Number(data[0].lon),
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return null
}

async function extractWebsiteImageUrl(website: string | null): Promise<string | null> {
  if (!website) return null

  try {
    const response = await fetch(website, {
      headers: {
        'User-Agent': 'Mozilla/5.0 SaunaPlanet demo crawler',
      },
    })

    if (!response.ok) return null

    const html = await response.text()

    const ogImage = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    )

    if (ogImage?.[1]) {
      return new URL(ogImage[1], website).toString()
    }

    return null
  } catch {
    return null
  }
}

async function fetchSauna(id: number): Promise<SaunaRow | null> {
  const sourceUrl = `${BASE_URL}/${id}`
  try {
    const response = await fetch(sourceUrl)

    if (!response.ok) {
      await logImport(id, 'SKIP', `HTTP_${response.status}`, null, sourceUrl)
      return null
    }

    const html = await response.text()
	const website = extractWebsite(html)
	console.log(`Website ${id}: ${website ?? 'none'}`)
    const coverImageUrl = extractCoverImageUrl(html, sourceUrl)
	const websiteImageUrl = await extractWebsiteImageUrl(website)
    
    if (
      html.includes('404') ||
      html.includes('Nie odnaleziono') ||
      html.length < 500
    ) {
      await logImport(id, 'SKIP', 'NOT_FOUND_OR_EMPTY_PAGE', null, sourceUrl)
      return null
    }

    const name = extractName(html)

    if (!name) {
      await logImport(id, 'SKIP', 'NO_NAME', null, sourceUrl)
      return null
    }

    const location = extractField(html, 'Lokalizacja')
    const ptsType = extractField(html, 'Rodzaj obiektu')
    const ceremonies = extractField(html, 'Ceremonie')
    const attractions = extractField(html, 'Atrakcje')
    const limitations = extractField(html, 'Ograniczenia')

    const { city, voivodeship } = parseLocation(location)

    if (!city) {
      console.log(`No city: ${id} ${name}`)
      await logImport(id, 'SKIP', 'NO_CITY', name, sourceUrl)
      return null
    }

    const coords = await geocode(city, name)

    if (!coords) {
      console.log(`No coords: ${id} ${name} ${city ?? ''}`)
      await logImport(id, 'SKIP', 'NO_COORDS', name, sourceUrl)
      return null
    }

    return {
  pts_id: id,
  name,
  city,
  voivodeship,
  category: mapCategory(ptsType),
  pts_type: ptsType,
  description: attractions,
  ceremonies,
  attractions,
  limitations,
  source: 'PTS',
  source_url: sourceUrl,
  latitude: coords.latitude,
  longitude: coords.longitude,
  status: 'active',
  website,
  cover_image_url: websiteImageUrl ?? coverImageUrl,
}

  } catch (error) {
    console.error(`Error ${id}`, error)
    await logImport(
      id,
      'ERROR',
      error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      null,
      sourceUrl
    )
    return null
  }
}

async function run() {
  const startId = START_ID
  const endId = END_ID
  let imported = 0
  let skipped = 0

  console.log(`Import range: ${startId}-${endId}`)

  for (let id = startId; id <= endId; id += 1) {
    try {
      const sauna = await fetchSauna(id)

      if (!sauna) {
        skipped += 1
        console.log(`Skip ${id}`)
        await new Promise((resolve) => setTimeout(resolve, 1200))
        continue
      }

      const { error } = await supabase
        .from('saunas')
        .upsert([sauna], {
          onConflict: 'pts_id',
        })

      if (error) {
        console.error(`UPSERT ERROR ${id}:`, error)
        await logImport(id, 'ERROR', `UPSERT_${error.code ?? 'UNKNOWN'}`, sauna.name, sauna.source_url)
      } else {
        imported += 1
        console.log(`OK ${id}: ${sauna.name}`)
        await logImport(id, 'OK', 'IMPORTED', sauna.name, sauna.source_url)
      }

      await new Promise((resolve) => setTimeout(resolve, 1200))
    } catch (error) {
      skipped += 1
      console.error(`Error ${id}`, error)
      await logImport(
        id,
        'ERROR',
        error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        null,
        `${BASE_URL}/${id}`
      )
    }
  }

  console.log(`Imported ${imported} saunas`)
  console.log(`Skipped ${skipped} entries`)
}

run()
