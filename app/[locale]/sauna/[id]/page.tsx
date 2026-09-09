import type { Metadata } from 'next'
import AddEventMasterForm from '@/components/AddEventMasterForm'
import AddMasterToSaunaModal from '@/components/AddMasterToSaunaModal'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { Link } from '@/lib/i18n/navigation'
import AddReviewForm from '@/components/AddReviewForm'
import Navbar from '@/components/Navbar'
import { toggleFavoriteSauna, requestManagerRole } from '@/app/[locale]/(main)/profile/actions'
import { getTranslations, getFormatter } from 'next-intl/server'
import { formatEventPrice } from '@/lib/i18n/formatPrice'
import { localizedAlternates } from '@/lib/i18n/seo'
import type { Locale } from '@/lib/i18n/locales'

// SP-047E3 — international SEO: per-locale canonical + pl/en/de alternates for
// the same facility (id never translated). Only active (public) facilities are
// indexable; entity content (name/description) is never translated.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  const alternates = localizedAlternates(locale as Locale, `/sauna/${id}`)
  const supabase = await createClient()
  const { data: sauna } = await supabase
    .from('saunas')
    .select('name, status')
    .eq('id', id)
    .maybeSingle()
  if (!sauna) return { alternates, robots: { index: false, follow: false } }
  return {
    title: sauna.name,
    alternates,
    robots: sauna.status === 'active' ? undefined : { index: false, follow: false },
    openGraph: { title: sauna.name, type: 'website', locale },
  }
}

export default async function SaunaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('sauna')
  const format = await getFormatter()

  const { data: { user } } = await supabase.auth.getUser()

  // Gate the master controls to match the RLS enforced after SP-035 (RLS stays
  // the security boundary; this only hides controls a user cannot use):
  //  - creating a master profile → sauna_masters insert = is_platform_moderator
  //    (admin OR moderator),
  //  - assigning an event master  → sauna_event_masters insert = is_admin
  //    (admin only; moderators excluded per the event-management decision).
  const role = await getCurrentUserRole()
  const isAdmin = role === 'admin'
  const canManageMasters = role === 'admin' || role === 'moderator'

  const [
    { data: sauna },
    { data: photos },
    { data: reviews },
  ] = await Promise.all([
    supabase.from('saunas').select('*').eq('id', id).single(),
    supabase.from('sauna_photos').select('image_url').eq('sauna_id', id).order('created_at', { ascending: true }),
    supabase.from('sauna_reviews').select('*').eq('sauna_id', id).order('created_at', { ascending: false }),
  ])

  if (!sauna) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
        <Link href="/" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          {t('notFound.back')}
        </Link>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: events } = await supabase
    .from('sauna_events')
    .select('*')
    .eq('sauna_id', id)
    .eq('status', 'active')
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  const eventIds = events?.map((e) => e.id) ?? []

  const { data: eventMasters } = eventIds.length > 0
    ? await supabase
        .from('sauna_event_masters')
        .select('event_id, role, sauna_masters(id, name, avatar_url, level)')
        .in('event_id', eventIds)
        .eq('status', 'approved')
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mastersByEvent = (eventMasters ?? []).reduce<Record<string, any[]>>(
    (acc, item) => {
      if (!acc[item.event_id]) acc[item.event_id] = []
      acc[item.event_id].push(item)
      return acc
    },
    {}
  )

  const { data: saunaMastersRaw } = await supabase
    .from('sauna_event_masters')
    .select('role, status, sauna_masters(id, name, avatar_url, rating), sauna_events(sauna_id)')
    .eq('status', 'approved')

  const activeMastersRaw = (saunaMastersRaw ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item) => (item as any).sauna_events?.sauna_id === id
  )
  const activeMasters = Array.from(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Map(activeMastersRaw.map((item) => [(item as any).sauna_masters?.id, item])).values()
  )

  const [isFavoritedResult, managerStatusResult] = await Promise.all([
    user
      ? supabase.from('user_favorites').select('id').eq('user_id', user.id).eq('sauna_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from('sauna_managers').select('status').eq('user_id', user.id).eq('sauna_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const isFavorited = isFavoritedResult.data !== null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const managerStatus: string | null = (managerStatusResult.data as any)?.status ?? null

  const averageRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null

  // Resolve review author names from profiles; stored author_name is only a
  // fallback for legacy rows without user_id (older rows may hold an email).
  const reviewAuthorIds = [...new Set((reviews ?? []).map((r) => r.user_id).filter(Boolean))]
  const { data: reviewAuthorsRaw } = reviewAuthorIds.length > 0
    ? await supabase.from('public_profiles').select('id, first_name, last_name').in('id', reviewAuthorIds)
    : { data: [] }
  const reviewNameById: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (reviewAuthorsRaw ?? []) as any[]) {
    reviewNameById[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || t('detail.reviewFallbackAuthor')
  }

  const mainImage = photos?.[0]?.image_url ?? sauna.cover_image_url

  const toggleFavoriteAction = toggleFavoriteSauna.bind(null, id)
  const requestManagerAction = requestManagerRole.bind(null, id)

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl p-4">
        <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2">
          {t('detail.backToMap')}
        </Link>

        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold">{sauna.name}</h1>

          <div className="flex flex-wrap gap-2">
            {user && (
              <form action={toggleFavoriteAction}>
                <button
                  type="submit"
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    isFavorited
                      ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {isFavorited ? t('detail.favorite') : t('detail.addFavorite')}
                </button>
              </form>
            )}
            {user && managerStatus === null && (
              <form action={requestManagerAction}>
                <button
                  type="submit"
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  {t('detail.becomeManager')}
                </button>
              </form>
            )}
            {user && managerStatus === 'pending' && (
              <span className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700">
                {t('detail.managerPending')}
              </span>
            )}
            {user && managerStatus === 'approved' && (
              <span className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                {t('detail.managerApproved')}
              </span>
            )}
          </div>
        </div>

        {averageRating && (
          <div className="mb-4 text-lg font-semibold text-yellow-600">
            {t('detail.ratingSummary', { rating: averageRating.toFixed(1), count: reviews?.length ?? 0 })}
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

        <section className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
          <h2 className="mb-3 text-xl font-bold text-yellow-700">{t('detail.mastersHeading')}</h2>

          {activeMasters.length === 0 ? (
            <div className="text-sm text-gray-600">{t('detail.noMasters')}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {activeMasters.map((item, index) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const master = (item as any).sauna_masters
                return (
                  <Link
                    key={index}
                    href={`/masters/${master?.id}`}
                    className="flex items-center gap-3 rounded-xl bg-white p-3 hover:bg-yellow-100"
                  >
                    {master?.avatar_url ? (
                      <img src={master.avatar_url} alt={master.name} className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200">🧖</div>
                    )}
                    <div>
                      <div className="font-bold">{master?.name}</div>
                      <div className="text-sm text-yellow-700">⭐ {Number(master?.rating ?? 0).toFixed(1)}</div>
                      <div className="text-xs text-gray-500">{t('detail.masterRole', { role: item.role })}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {canManageMasters && (
            <AddMasterToSaunaModal
              existingEvents={(events ?? []).map((e) => ({
                id: e.id,
                title: e.title,
                event_date: e.event_date,
              }))}
            />
          )}
        </section>

        {events && events.length > 0 && (
          <section className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <h2 className="mb-3 text-xl font-bold text-orange-700">{t('detail.upcomingEventsHeading')}</h2>

            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <Link href={`/events/${event.id}`} className="block hover:opacity-80">
                    <div className="font-bold text-orange-700">{event.title}</div>
                    <div className="text-sm text-gray-500">
                      {event.event_date?.substring(0, 10)}
                      {event.event_time ? ` ${event.event_time.substring(0, 5)}` : ''}
                    </div>
                    {event.price && (
                      <div className="mt-1 text-sm font-semibold text-orange-700">
                        {formatEventPrice(format, event.price)}
                      </div>
                    )}
                    {event.description && (
                      <p className="mt-2 text-sm text-gray-700">{event.description}</p>
                    )}
                  </Link>

                  <div className="mt-3">
                    {(mastersByEvent[event.id] ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {(mastersByEvent[event.id] ?? []).map((item) => (
                          <Link
                            key={item.sauna_masters?.id}
                            href={`/masters/${item.sauna_masters?.id}`}
                            className="flex items-center gap-2 rounded-xl bg-yellow-50 px-2 py-1.5 hover:bg-yellow-100"
                          >
                            {item.sauna_masters?.avatar_url ? (
                              <img src={item.sauna_masters.avatar_url} alt={item.sauna_masters.name} className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs">🧖</div>
                            )}
                            <div>
                              <div className="text-xs font-semibold">{item.sauna_masters?.name}</div>
                              {item.sauna_masters?.level && (
                                <div className="text-xs text-gray-400">{item.sauna_masters.level}</div>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">{t('detail.noEventMasters')}</p>
                    )}
                  </div>

                  {isAdmin && <AddEventMasterForm eventId={event.id} />}
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
            <h2 className="mb-3 text-xl font-bold">{t('detail.reviewsHeading')}</h2>
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-xl bg-gray-50 p-3">
                  <div className="font-semibold">
                    {'⭐'.repeat(review.rating)} —{' '}
                    {review.user_id
                      ? (reviewNameById[review.user_id] ?? t('detail.reviewFallbackAuthor'))
                      : review.author_name}
                  </div>
                  {review.review_text && (
                    <p className="mt-2 text-sm text-gray-700">{review.review_text}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {sauna.website && (
            <a
              href={sauna.website}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-xl bg-orange-600 px-4 py-2 text-white"
            >
              {t('detail.website')}
            </a>
          )}
          {/* SP-038 slice 3C: only known platforms with non-empty values render */}
          {([
            ['facebook', 'Facebook'],
            ['instagram', 'Instagram'],
            ['youtube', 'YouTube'],
            ['tiktok', 'TikTok'],
          ] as const).map(([key, label]) => {
            const href = (sauna.social_links as Record<string, string> | null)?.[key]
            if (!href) return null
            return (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-xl border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {label}
              </a>
            )
          })}
        </div>
      </main>
    </>
  )
}
