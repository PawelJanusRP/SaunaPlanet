import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import AddReviewForm from '@/components/AddReviewForm'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function SaunaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: sauna } = await supabase
    .from('saunas')
    .select('*')
    .eq('id', id)
    .single()

  if (!sauna) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Nie znaleziono sauny</h1>

        <Link href="/" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          Powrót
        </Link>
      </div>
    )
  }

  const { data: photos } = await supabase
    .from('sauna_photos')
    .select('image_url')
    .eq('sauna_id', id)
    .order('created_at', { ascending: true })

  const { data: events } = await supabase
    .from('sauna_events')
    .select('*')
    .eq('sauna_id', id)
    .eq('status', 'active')
    .order('event_date', { ascending: true })

  const { data: reviews } = await supabase
    .from('sauna_reviews')
    .select('*')
    .eq('sauna_id', id)
    .order('created_at', { ascending: false })

  const averageRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null

  const mainImage = photos?.[0]?.image_url ?? sauna.cover_image_url

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2">
        ← Powrót do mapy
      </Link>

      <h1 className="mb-2 text-3xl font-bold">{sauna.name}</h1>

      {averageRating && (
        <div className="mb-4 text-lg font-semibold text-yellow-600">
          ⭐ {averageRating.toFixed(1)} ({reviews?.length} opinii)
        </div>
      )}

      {mainImage && (
        <img
          src={mainImage}
          alt={sauna.name}
          className="mb-4 h-96 w-full rounded-2xl object-cover"
        />
      )}

      {photos && photos.length > 1 && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {photos.slice(1).map((photo) => (
            <img
              key={photo.image_url}
              src={photo.image_url}
              alt={sauna.name}
              className="h-32 w-full rounded-xl object-cover"
            />
          ))}
        </div>
      )}

      <div className="mb-2 text-gray-600">{sauna.city}</div>

      <div className="mb-6 text-gray-700">{sauna.description}</div>

      {events && events.length > 0 && (
        <section className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <h2 className="mb-3 text-xl font-bold text-orange-700">
            🔥 Najbliższe wydarzenia
          </h2>

          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="font-bold">{event.title}</div>

                <div className="text-sm text-gray-500">
                  {event.event_date?.substring(0, 10)}
                  {event.event_time ? ` ${event.event_time.substring(0, 5)}` : ''}
                </div>

                {event.price && (
                  <div className="mt-1 text-sm font-semibold text-orange-700">
                    {event.price.includes('zł') ? event.price : `${event.price} zł`}
                  </div>
                )}

                {event.description && (
                  <p className="mt-2 text-sm text-gray-700">
                    {event.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
	  <div className="mb-6">
	  <AddReviewForm saunaId={id} />
	  </div>
      {reviews && reviews.length > 0 && (
        <section className="mb-6 rounded-2xl border p-4">
          <h2 className="mb-3 text-xl font-bold">⭐ Opinie</h2>

          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-xl bg-gray-50 p-3">
                <div className="font-semibold">
                  {'⭐'.repeat(review.rating)} — {review.author_name}
                </div>

                {review.review_text && (
                  <p className="mt-2 text-sm text-gray-700">
                    {review.review_text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {sauna.website && (
        <a
          href={sauna.website}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-xl bg-orange-600 px-4 py-2 text-white"
        >
          Strona obiektu
        </a>
      )}
    </main>
  )
}