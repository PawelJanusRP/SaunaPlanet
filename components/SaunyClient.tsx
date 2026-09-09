'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

// DB category codes localized via the `sauna.category.*` catalog keys. The codes
// stay canonical; only labels are translated.
const CATEGORY_CODES = [
  'public_sauna',
  'hotel_sauna',
  'private_sauna',
  'sports_sauna',
  'wellness_sauna',
  'other',
] as const

interface Sauna {
  id: string
  name: string
  city: string | null
  category: string
  thumbnail: string | null
  avgRating: number | null
  reviewCount: number
}

interface Props {
  saunas: Sauna[]
}

export default function SaunyClient({ saunas }: Props) {
  const t = useTranslations('sauna')

  // Internal sentinel for saunas without a city. Kept as a stable, non-localized
  // key so grouping/selection logic never depends on translated text; the label
  // is localized only at render time via `category.other`.
  const OTHER_CITY = '__other__'
  const cityLabel = (city: string) => (city === OTHER_CITY ? t('category.other') : city)

  const cities = [...new Set(saunas.map((s) => s.city || OTHER_CITY))].sort()
  const [selectedCity, setSelectedCity] = useState<string>('all')

  const filtered = selectedCity === 'all'
    ? saunas
    : saunas.filter((s) => (s.city || OTHER_CITY) === selectedCity)

  const grouped = filtered.reduce<Record<string, Sauna[]>>((acc, s) => {
    const city = s.city || OTHER_CITY
    if (!acc[city]) acc[city] = []
    acc[city]!.push(s)
    return acc
  }, {})

  const visibleCities = Object.keys(grouped).sort()

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">{t('list.heading')}</h1>
          <span className="text-sm text-gray-500">{t('list.count', { count: filtered.length })}</span>
        </div>
        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400 sm:w-auto"
        >
          <option value="all">{t('list.allCities')}</option>
          {cities.map((city) => (
            <option key={city} value={city}>{cityLabel(city)}</option>
          ))}
        </select>
      </div>

      {visibleCities.length === 0 ? (
        <p className="text-gray-500">{t('list.empty')}</p>
      ) : (
        <div className="space-y-8">
          {visibleCities.map((city) => (
            <section key={city}>
              {selectedCity === 'all' && (
                <h2 className="mb-3 text-lg font-bold text-gray-700">{cityLabel(city)}</h2>
              )}
              <div className="space-y-3">
                {grouped[city]!.map((s) => (
                  <Link
                    key={s.id}
                    href={`/sauna/${s.id}`}
                    className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:bg-orange-50"
                  >
                    {s.thumbnail ? (
                      <img
                        src={s.thumbnail}
                        alt={s.name}
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-2xl">
                        🧖
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold leading-tight">{s.name}</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {(CATEGORY_CODES as readonly string[]).includes(s.category)
                          ? t(`category.${s.category}`)
                          : s.category}
                      </p>
                      {selectedCity === 'all' && s.city && (
                        <p className="mt-0.5 text-xs text-gray-400">{s.city}</p>
                      )}
                      {s.avgRating !== null && (
                        <p className="mt-1 text-sm font-semibold text-yellow-600">
                          ⭐ {s.avgRating.toFixed(1)}
                          <span className="ml-1 font-normal text-gray-400">({s.reviewCount})</span>
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
