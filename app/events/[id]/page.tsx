import Link from 'next/link'
import Navbar from '@/components/Navbar'
import EditEventForm from '@/components/EditEventForm'
import AddEventMasterForm from '@/components/AddEventMasterForm'
import RemoveEventMasterButton from '@/components/RemoveEventMasterButton'
import UploadEventPhotoButton from '@/components/UploadEventPhotoButton'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { toggleEventInterest } from '@/app/(main)/profile/actions'

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
    .select('id, title, event_date, event_time, price, description, status, sauna_id, saunas(id, name, city)')
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

  const [isGoingResult, goingCountResult] = await Promise.all([
    user
      ? supabase
          .from('user_event_interests')
          .select('id')
          .eq('user_id', user.id)
          .eq('event_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('user_event_interests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'going'),
  ])

  const isGoing = isGoingResult.data !== null
  const goingCount = goingCountResult.count ?? 0

  const dateFormatted = ev.event_date
    ? new Date(ev.event_date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const toggleInterestAction = toggleEventInterest.bind(null, id)

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
          </div>

          {ev.description && (
            <p className="mt-4 text-gray-700 leading-relaxed">{ev.description}</p>
          )}

          <div className="mt-5 flex items-center gap-3">
            {user && (
              <form action={toggleInterestAction} className="flex-1">
                <button
                  type="submit"
                  className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
                    isGoing
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {isGoing ? '✓ Idę na to wydarzenie' : 'Idę →'}
                </button>
              </form>
            )}
            {goingCount > 0 && (
              <p className="shrink-0 text-sm text-gray-500">
                {goingCount} {goingCount === 1 ? 'osoba idzie' : goingCount < 5 ? 'osoby idą' : 'osób idzie'}
              </p>
            )}
          </div>
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
      </main>
    </>
  )
}
