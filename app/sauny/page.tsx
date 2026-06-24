import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/server'

const CATEGORY_LABELS: Record<string, string> = {
  public_sauna:   'Sauna publiczna',
  hotel_sauna:    'Sauna hotelowa',
  private_sauna:  'Sauna prywatna',
  sports_sauna:   'Sauna sportowa',
  wellness_sauna: 'Wellness / SPA',
  other:          'Inne',
}

export default async function SaunyPage() {
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('saunas')
    .select(`
      id, name, city, category, cover_image_url, status,
      sauna_photos(image_url),
      sauna_reviews(rating)
    `)
    .eq('status', 'active')
    .order('name')

  const saunas = (raw ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = (s as any).sauna_photos as { image_url: string }[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviews = (s as any).sauna_reviews as { rating: number }[]
    const thumbnail = s.cover_image_url ?? photos?.[0]?.image_url ?? null
    const avgRating =
      reviews && reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null
    return { ...s, thumbnail, avgRating, reviewCount: reviews?.length ?? 0 }
  })

  const grouped = saunas.reduce<Record<string, typeof saunas>>((acc, s) => {
    const city = s.city || 'Inne'
    if (!acc[city]) acc[city] = []
    acc[city]!.push(s)
    return acc
  }, {})

  const cities = Object.keys(grouped).sort()

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl p-4">
        <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
          ← Powrót do mapy
        </Link>

        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">🧖 Sauny</h1>
          <span className="text-sm text-gray-500">{saunas.length} obiektów</span>
        </div>

        {cities.length === 0 ? (
          <p className="text-gray-500">Brak saun.</p>
        ) : (
          <div className="space-y-8">
            {cities.map((city) => (
              <section key={city}>
                <h2 className="mb-3 text-lg font-bold text-gray-700">{city}</h2>
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
                          {CATEGORY_LABELS[s.category] ?? s.category}
                        </p>
                        {s.avgRating !== null ? (
                          <p className="mt-1 text-sm font-semibold text-yellow-600">
                            ⭐ {s.avgRating.toFixed(1)}
                            <span className="ml-1 font-normal text-gray-400">({s.reviewCount})</span>
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
