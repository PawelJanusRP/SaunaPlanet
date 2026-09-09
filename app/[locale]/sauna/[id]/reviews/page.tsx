import { Link } from '@/lib/i18n/navigation'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export default async function SaunaReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('sauna')
  const today = new Date().toISOString().split('T')[0]

  const { data: sauna } = await supabase
    .from('saunas')
    .select('id, name, city')
    .eq('id', id)
    .single()

  if (!sauna) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
        <Link href="/sauny" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">{t('notFound.back')}</Link>
      </main>
    )
  }

  // Fetch past events at this sauna
  const { data: pastEvents } = await supabase
    .from('sauna_events')
    .select('id, title, event_date')
    .eq('sauna_id', id)
    .lt('event_date', today)
    .order('event_date', { ascending: false })

  const pastEventIds = (pastEvents ?? []).map((e) => e.id)

  // Fetch reviews for those events
  const { data: reviewsRaw } = pastEventIds.length > 0
    ? await supabase
        .from('event_reviews')
        .select('id, rating, comment, created_at, event_id, user_id')
        .in('event_id', pastEventIds)
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviews = (reviewsRaw ?? []) as any[]

  // Build event lookup
  const eventById: Record<string, { title: string; event_date: string }> = {}
  for (const e of pastEvents ?? []) {
    eventById[e.id] = { title: e.title, event_date: e.event_date }
  }

  // Resolve author names
  const authorIds = [...new Set(reviews.map((r) => r.user_id))]
  const { data: profilesRaw } = authorIds.length > 0
    ? await supabase.from('public_profiles').select('id, first_name, last_name').in('id', authorIds)
    : { data: [] }
  const nameById: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (profilesRaw ?? []) as any[]) {
    nameById[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || t('reviews.authorFallback')
  }

  // Sort reviews by event_date descending
  const sorted = [...reviews].sort((a, b) => {
    const da = eventById[a.event_id]?.event_date ?? ''
    const db = eventById[b.event_id]?.event_date ?? ''
    return db.localeCompare(da)
  })

  const avg = sorted.length > 0
    ? sorted.reduce((s, r) => s + r.rating, 0) / sorted.length
    : null

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl p-4">
        <Link href={`/sauna/${id}`} className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
          {t('reviews.backToSauna', { name: sauna.name })}
        </Link>

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">{t('reviews.heading')}</h1>
          <p className="mt-1 text-sm text-gray-500">{sauna.name}{sauna.city ? ` · ${sauna.city}` : ''}</p>

          {avg !== null && (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-orange-700">{avg.toFixed(1)}</span>
              <span className="text-sm text-gray-500">
                {t('reviews.ratingCount', { count: sorted.length })}
              </span>
            </div>
          )}
        </section>

        {sorted.length === 0 ? (
          <p className="mt-6 text-center text-gray-500">{t('reviews.empty')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {sorted.map((r) => {
              const event = eventById[r.event_id]
              const dateStr = event?.event_date
                ? new Date(event.event_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
                : null
              return (
                <div key={r.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/events/${r.event_id}`}
                        className="font-semibold text-orange-700 hover:underline"
                      >
                        🔥 {event?.title ?? t('reviews.eventFallback')}
                      </Link>
                      {dateStr && (
                        <p className="mt-0.5 text-xs text-gray-400">{dateStr}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-yellow-600">{'⭐'.repeat(r.rating)}</p>
                    </div>
                  </div>

                  {r.comment && (
                    <p className="mt-3 text-sm text-gray-700 leading-relaxed">{r.comment}</p>
                  )}

                  <p className="mt-2 text-xs text-gray-400">
                    {nameById[r.user_id] ?? t('reviews.authorFallback')} · {new Date(r.created_at).toLocaleDateString('pl-PL')}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
