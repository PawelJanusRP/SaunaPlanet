import Link from 'next/link'
import Navbar from '@/components/Navbar'
import EditEventForm from '@/components/EditEventForm'
import AddEventMasterForm from '@/components/AddEventMasterForm'
import RemoveEventMasterButton from '@/components/RemoveEventMasterButton'
import UploadEventPhotoButton from '@/components/UploadEventPhotoButton'
import EventReviewForm from '@/components/EventReviewForm'
import EventCommentForm from '@/components/EventCommentForm'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { toggleEventInterest } from '@/app/(main)/profile/actions'
import { deleteEventReview, deleteEventComment, registerForEvent, cancelRegistration } from '@/app/events/actions'

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const role = await getCurrentUserRole()
  const isEditor = role === 'admin' || role === 'moderator'
  const { data: { user } } = await supabase.auth.getUser()

  const { data: eventData } = await supabase
    .from('sauna_events')
    .select('id, title, event_date, event_time, price, description, status, sauna_id, max_participants, saunas(id, name, city)')
    .eq('id', id)
    .single()

  if (!eventData) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Nie znaleziono wydarzenia</h1>
        <Link href="/events" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          Powrót
        </Link>
      </main>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = eventData as any
  const sauna = ev.saunas
  const today = new Date().toISOString().split('T')[0]
  const isPast = ev.event_date < today

  const { data: eventMastersRaw } = await supabase
    .from('sauna_event_masters')
    .select('master_id, role, status, sauna_masters(id, name, avatar_url, level)')
    .eq('event_id', id)
    .eq('status', 'approved')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventMasters = (eventMastersRaw ?? []) as any[]

  const { data: photosRaw } = await supabase
    .from('event_photos')
    .select('id, image_url')
    .eq('event_id', id)
    .order('created_at', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (photosRaw ?? []) as any[]

  // Reviews (past) / Comments (upcoming) + going count + registrations — all parallel
  const [
    isGoingResult,
    goingCountResult,
    reviewsResult,
    commentsResult,
    userRegistrationResult,
    confirmedCountResult,
  ] = await Promise.all([
    user
      ? supabase.from('user_event_interests').select('id').eq('user_id', user.id).eq('event_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('user_event_interests').select('id', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'going'),
    isPast
      ? supabase.from('event_reviews').select('id, rating, comment, created_at, user_id').eq('event_id', id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    !isPast
      ? supabase.from('event_comments').select('id, comment, created_at, user_id').eq('event_id', id).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    user && !isPast
      ? supabase.from('event_registrations').select('id, status').eq('event_id', id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    !isPast
      ? supabase.from('event_registrations').select('id', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'confirmed')
      : Promise.resolve({ count: 0 }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviews = (reviewsResult.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comments = (commentsResult.data ?? []) as any[]
  const isGoing = isGoingResult.data !== null
  const goingCount = goingCountResult.count ?? 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRegistration = userRegistrationResult.data as any
  const confirmedCount = confirmedCountResult.count ?? 0
  const maxParticipants: number | null = ev.max_participants ?? null
  const spotsLeft = maxParticipants !== null ? maxParticipants - confirmedCount : null
  const isFull = spotsLeft !== null && spotsLeft <= 0 && userRegistration?.status !== 'confirmed'

  // Resolve display names for review/comment authors
  const authorIds = [...new Set([...reviews, ...comments].map((r) => r.user_id))]
  const { data: authorProfiles } = authorIds.length > 0
    ? await supabase.from('public_profiles').select('id, first_name, last_name').in('id', authorIds)
    : { data: [] }
  const nameById: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (authorProfiles ?? []) as any[]) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
    nameById[p.id] = name || 'Użytkownik'
  }

  // Historical event rating for this sauna (shown on upcoming event pages)
  let saunaHistoricalRating: { avg: number; count: number } | null = null
  if (!isPast && sauna?.id) {
    const { data: pastEventIds } = await supabase
      .from('sauna_events')
      .select('id')
      .eq('sauna_id', sauna.id)
      .lt('event_date', today)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (pastEventIds ?? []).map((e: any) => e.id)
    if (ids.length > 0) {
      const { data: histReviews } = await supabase
        .from('event_reviews')
        .select('rating')
        .in('event_id', ids)

      if (histReviews && histReviews.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const avg = histReviews.reduce((s: number, r: any) => s + r.rating, 0) / histReviews.length
        saunaHistoricalRating = { avg, count: histReviews.length }
      }
    }
  }

  // Avg rating for past event — reviews is already any[], cast is safe
  const avgReview = isPast && reviews.length > 0
    ? reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / reviews.length
    : null

  const userAlreadyReviewed = isPast && user
    ? reviews.some((r: { user_id: string }) => r.user_id === user.id)
    : false

  const dateFormatted = ev.event_date
    ? new Date(ev.event_date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const toggleInterestAction = toggleEventInterest.bind(null, id)
  const registerAction = registerForEvent.bind(null, id)
  const cancelAction = cancelRegistration.bind(null, id)

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl p-4">
        <Link href="/events" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
          ← Powrót do wydarzeń
        </Link>

        {/* Header */}
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-orange-700">🔥 {ev.title}</h1>
            {isEditor && (
              <EditEventForm
                eventId={id}
                title={ev.title}
                event_date={ev.event_date}
                event_time={ev.event_time ?? null}
                price={ev.price ?? null}
                description={ev.description ?? null}
              />
            )}
          </div>

          <div className="mt-3 space-y-1.5 text-sm text-gray-600">
            {dateFormatted && (
              <p>📅 <span className="font-semibold capitalize">{dateFormatted}</span>
                {ev.event_time && <span className="ml-1">o {ev.event_time.substring(0, 5)}</span>}
              </p>
            )}
            {sauna && (
              <p>
                📍{' '}
                <Link href={`/sauna/${sauna.id}`} className="font-semibold hover:underline">
                  {sauna.name}
                </Link>
                {sauna.city && <span className="ml-1 text-gray-400">· {sauna.city}</span>}
              </p>
            )}
            {ev.price && (
              <p>💳 <span className="font-semibold text-orange-700">
                {String(ev.price).includes('zł') ? ev.price : `${ev.price} zł`}
              </span></p>
            )}
            {avgReview !== null && (
              <p>⭐ <span className="font-semibold">{avgReview.toFixed(1)}</span>
                <span className="ml-1 text-gray-400">({reviews.length} {reviews.length === 1 ? 'ocena' : reviews.length < 5 ? 'oceny' : 'ocen'})</span>
              </p>
            )}
            {saunaHistoricalRating && (
              <Link
                href={`/sauna/${sauna.id}/reviews`}
                className="flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs text-orange-700 hover:bg-orange-100 transition-colors"
              >
                <span>Poprzednie eventy w tej saunie:</span>
                <span className="font-semibold">⭐ {saunaHistoricalRating.avg.toFixed(1)}</span>
                <span className="text-orange-500">({saunaHistoricalRating.count} {saunaHistoricalRating.count === 1 ? 'ocena' : saunaHistoricalRating.count < 5 ? 'oceny' : 'ocen'})</span>
                <span className="ml-auto text-orange-400">→</span>
              </Link>
            )}
          </div>

          {ev.description && (
            <p className="mt-4 text-gray-700 leading-relaxed">{ev.description}</p>
          )}

          {!isPast && (
            <div className="mt-5 space-y-3">
              {/* Rejestracja */}
              {user && (
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rezerwacja miejsca</p>
                    {spotsLeft !== null && (
                      <p className={`text-xs font-semibold ${spotsLeft <= 3 ? 'text-red-600' : 'text-gray-500'}`}>
                        {spotsLeft > 0 ? `${spotsLeft} wolnych miejsc` : 'Brak miejsc'}
                      </p>
                    )}
                  </div>
                  {!userRegistration && (
                    <form action={registerAction}>
                      <button
                        type="submit"
                        disabled={isFull}
                        className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isFull ? 'Brak wolnych miejsc' : 'Zapisz się →'}
                      </button>
                    </form>
                  )}
                  {userRegistration?.status === 'pending' && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-yellow-700">⏳ Zapis oczekuje na potwierdzenie</p>
                      <form action={cancelAction}>
                        <button type="submit" className="text-xs text-red-500 hover:text-red-700">Anuluj</button>
                      </form>
                    </div>
                  )}
                  {userRegistration?.status === 'confirmed' && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-green-700">✓ Jesteś zapisany</p>
                      <form action={cancelAction}>
                        <button type="submit" className="text-xs text-red-500 hover:text-red-700">Anuluj zapis</button>
                      </form>
                    </div>
                  )}
                  {confirmedCount > 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      {confirmedCount} {confirmedCount === 1 ? 'osoba zapisana' : confirmedCount < 5 ? 'osoby zapisane' : 'osób zapisanych'}
                    </p>
                  )}
                </div>
              )}

              {/* Nieformalny interest ("Idę") */}
              <div className="flex items-center gap-3">
                {user && (
                  <form action={toggleInterestAction} className="flex-1">
                    <button
                      type="submit"
                      className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                        isGoing
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {isGoing ? '✓ Idę' : 'Idę (bez rezerwacji)'}
                    </button>
                  </form>
                )}
                {goingCount > 0 && (
                  <p className="shrink-0 text-sm text-gray-500">
                    {goingCount} {goingCount === 1 ? 'osoba idzie' : goingCount < 5 ? 'osoby idą' : 'osób idzie'}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Saunamistrzowie */}
        <section className="mt-5 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">🧖 Saunamistrzowie</h2>

          {eventMasters.length === 0 ? (
            <p className="text-sm text-gray-500">Brak przypisanych saunamistrzów.</p>
          ) : (
            <div className="space-y-2">
              {eventMasters.map((item) => {
                const master = item.sauna_masters
                return (
                  <div key={item.master_id} className="flex items-center gap-3 rounded-xl bg-yellow-50 px-3 py-2.5">
                    <Link href={`/masters/${master?.id}`} className="flex flex-1 items-center gap-3 hover:opacity-80">
                      {master?.avatar_url ? (
                        <img src={master.avatar_url} alt={master.name} className="h-11 w-11 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-xl">🧖</div>
                      )}
                      <div>
                        <p className="font-semibold leading-tight">{master?.name}</p>
                        <p className="text-xs text-gray-500">{item.role}</p>
                      </div>
                    </Link>
                    {isEditor && (
                      <RemoveEventMasterButton
                        eventId={id}
                        masterId={item.master_id}
                        masterName={master?.name ?? ''}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {isEditor && <AddEventMasterForm eventId={id} />}
        </section>

        {/* Zdjęcia */}
        <section className="mt-5 rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">📸 Zdjęcia</h2>
            {isEditor && <UploadEventPhotoButton eventId={id} />}
          </div>

          {photos.length === 0 ? (
            <p className="text-sm text-gray-500">Brak zdjęć tego wydarzenia.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.image_url}
                  alt={ev.title}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ))}
            </div>
          )}
        </section>

        {/* Komentarze (nadchodzące) */}
        {!isPast && (
          <section className="mt-5 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold">💬 Komentarze</h2>

            {user && (
              <div className="mb-5">
                <EventCommentForm eventId={id} />
              </div>
            )}

            {comments.length === 0 ? (
              <p className="text-sm text-gray-500">Brak komentarzy. Bądź pierwszy!</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => {
                  const canDelete = isEditor || c.user_id === user?.id
                  const deleteAction = deleteEventComment.bind(null, c.id, id)
                  return (
                    <div key={c.id} className="rounded-xl bg-gray-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-500">
                            {nameById[c.user_id] ?? 'Użytkownik'}
                            <span className="ml-2 font-normal text-gray-400">
                              {new Date(c.created_at).toLocaleDateString('pl-PL')}
                            </span>
                          </p>
                          <p className="mt-1 text-sm text-gray-700">{c.comment}</p>
                        </div>
                        {canDelete && (
                          <form action={deleteAction}>
                            <button type="submit" className="shrink-0 text-xs text-red-400 hover:text-red-600">Usuń</button>
                          </form>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Oceny (minione) */}
        {isPast && (
          <section className="mt-5 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold">⭐ Oceny</h2>

            {user && !userAlreadyReviewed && (
              <div className="mb-5 rounded-xl bg-orange-50 p-4">
                <p className="mb-3 text-sm font-medium text-orange-700">Byłeś na tym evencie? Oceń go!</p>
                <EventReviewForm eventId={id} />
              </div>
            )}

            {user && userAlreadyReviewed && (
              <p className="mb-4 text-sm text-green-700">✓ Już oceniłeś to wydarzenie.</p>
            )}

            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500">Brak ocen.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => {
                  const canDelete = isEditor || r.user_id === user?.id
                  const deleteAction = deleteEventReview.bind(null, r.id, id)
                  return (
                    <div key={r.id} className="rounded-xl bg-gray-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-500">
                            {nameById[r.user_id] ?? 'Użytkownik'}
                            <span className="ml-2 font-normal text-gray-400">
                              {new Date(r.created_at).toLocaleDateString('pl-PL')}
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-yellow-600">
                            {'⭐'.repeat(r.rating)}
                          </p>
                          {r.comment && <p className="mt-1 text-sm text-gray-700">{r.comment}</p>}
                        </div>
                        {canDelete && (
                          <form action={deleteAction}>
                            <button type="submit" className="shrink-0 text-xs text-red-400 hover:text-red-600">Usuń</button>
                          </form>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  )
}
