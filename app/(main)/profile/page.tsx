import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import EditProfileNameForm from '@/components/EditProfileNameForm'
import RegistrationModerationActions from '@/components/RegistrationModerationActions'

const roleLabels: Record<string, string> = {
  user: 'Użytkownik',
  moderator: 'Moderator',
  admin: 'Administrator',
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getCurrentUserRole()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  const [{ data: favoritesRaw }, { data: interestsRaw }, { data: managedSaunasRaw }] = await Promise.all([
    supabase
      .from('user_favorites')
      .select('sauna_id, saunas(id, name, city, cover_image_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_event_interests')
      .select('event_id, status, sauna_events(id, title, event_date, event_time, price, sauna_id, saunas(name, city))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('sauna_managers')
      .select('id, status, sauna_id, saunas(id, name, city)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const favorites = (favoritesRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const managedSaunas = (managedSaunasRaw ?? []) as any[]
  const approvedSaunas = managedSaunas.filter((m) => m.status === 'approved')

  const favSaunaIds = favorites.map((f) => f.sauna_id).filter(Boolean)
  const { data: favPhotosRaw } = favSaunaIds.length > 0
    ? await supabase
        .from('sauna_photos')
        .select('sauna_id, image_url')
        .in('sauna_id', favSaunaIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const firstFavPhoto: Record<string, string> = {}
  for (const p of favPhotosRaw ?? []) {
    if (!firstFavPhoto[p.sauna_id]) firstFavPhoto[p.sauna_id] = p.image_url
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingEvents = ((interestsRaw ?? []) as any[]).filter(
    (i) => i.sauna_events?.event_date >= today
  )

  // Pending registrations for saunas managed by this user
  const approvedSaunaIds = approvedSaunas.map((m) => m.sauna_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingRegistrations: any[] = []
  if (approvedSaunaIds.length > 0) {
    const { data: pendingEventsRaw } = await supabase
      .from('sauna_events')
      .select('id')
      .in('sauna_id', approvedSaunaIds)
      .gte('event_date', today)

    const pendingEventIds = (pendingEventsRaw ?? []).map((e) => e.id)
    if (pendingEventIds.length > 0) {
      const { data: regsRaw } = await supabase
        .from('event_registrations')
        .select('id, status, created_at, user_id, event_id, sauna_events(id, title, event_date, sauna_id, saunas(name))')
        .in('event_id', pendingEventIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingRegistrations = (regsRaw ?? []) as any[]

      // Resolve registrant names
      const regUserIds = [...new Set(pendingRegistrations.map((r) => r.user_id))]
      if (regUserIds.length > 0) {
        const { data: regProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', regUserIds)
        const regNameById: Record<string, string> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (regProfiles ?? []) as any[]) {
          regNameById[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Użytkownik'
        }
        pendingRegistrations = pendingRegistrations.map((r) => ({ ...r, _userName: regNameById[r.user_id] ?? 'Użytkownik' }))
      }
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
        ← Powrót do mapy
      </Link>

      {/* Dane konta */}
      <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">Mój profil</h1>

        <div className="space-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-500">Email:</span>{' '}
            <span>{user.email}</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Rola:</span>{' '}
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
              role === 'admin'
                ? 'bg-red-100 text-red-700'
                : role === 'moderator'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {roleLabels[role ?? 'user'] ?? role}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Konto utworzone:</span>{' '}
            <span>{new Date(user.created_at).toLocaleDateString('pl-PL')}</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">ID:</span>{' '}
            <span className="font-mono text-xs text-gray-400">{user.id}</span>
          </div>
        </div>

        <EditProfileNameForm
          firstName={profile?.first_name ?? ''}
          lastName={profile?.last_name ?? ''}
        />

        <ChangePasswordForm />
      </section>

      {/* Panel managera */}
      {managedSaunas.length > 0 && (
        <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">🏢 Moje sauny (manager)</h2>
          <div className="mb-4 space-y-2">
            {managedSaunas.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                <Link href={`/sauna/${m.saunas?.id}`} className="font-semibold hover:underline">
                  {m.saunas?.name}
                  {m.saunas?.city && <span className="ml-1 font-normal text-gray-400">· {m.saunas.city}</span>}
                </Link>
                {m.status === 'pending' && (
                  <span className="text-xs font-semibold text-yellow-600">⏳ Oczekuje</span>
                )}
                {m.status === 'approved' && (
                  <span className="text-xs font-semibold text-green-600">✓ Aktywny</span>
                )}
                {m.status === 'rejected' && (
                  <span className="text-xs font-semibold text-red-500">✗ Odrzucony</span>
                )}
              </div>
            ))}
          </div>

          {pendingRegistrations.length > 0 && (
            <>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
                Oczekujące rezerwacje ({pendingRegistrations.length})
              </h3>
              <div className="space-y-3">
                {pendingRegistrations.map((reg) => {
                  const ev = reg.sauna_events
                  return (
                    <div key={reg.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800">{reg._userName}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            <Link href={`/events/${ev?.id}`} className="hover:underline">
                              🔥 {ev?.title}
                            </Link>
                            {ev?.event_date && <span className="ml-1">· {ev.event_date.substring(0, 10)}</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            Zgłoszono: {new Date(reg.created_at).toLocaleDateString('pl-PL')}
                          </p>
                        </div>
                        <RegistrationModerationActions registrationId={reg.id} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {approvedSaunas.length > 0 && pendingRegistrations.length === 0 && (
            <p className="text-sm text-gray-500">Brak oczekujących rezerwacji.</p>
          )}
        </section>
      )}

      {/* Ulubione sauny */}
      <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">♥ Ulubione sauny</h2>

        {favorites.length === 0 ? (
          <p className="text-sm text-gray-500">
            Brak ulubionych saun. Dodaj je na stronie sauny.
          </p>
        ) : (
          <div className="space-y-3">
            {favorites.map((fav) => {
              const sauna = fav.saunas
              return (
                <Link
                  key={fav.sauna_id}
                  href={`/sauna/${sauna?.id}`}
                  className="flex items-center gap-3 rounded-2xl border p-3 hover:bg-orange-50 transition-colors"
                >
                  {(firstFavPhoto[fav.sauna_id] ?? sauna?.cover_image_url) ? (
                    <img
                      src={firstFavPhoto[fav.sauna_id] ?? sauna.cover_image_url}
                      alt={sauna.name}
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-2xl">
                      🧖
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold leading-tight">{sauna?.name}</p>
                    {sauna?.city && (
                      <p className="mt-0.5 text-sm text-gray-500">{sauna.city}</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Moje eventy */}
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">🔥 Moje nadchodzące eventy</h2>

        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nie zapisałeś się na żadne nadchodzące wydarzenie.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((interest) => {
              const ev = interest.sauna_events
              const sauna = ev?.saunas
              return (
                <Link
                  key={interest.event_id}
                  href={`/events/${ev?.id}`}
                  className="block rounded-2xl border p-4 hover:bg-orange-50 transition-colors"
                >
                  <p className="font-bold text-orange-700">{ev?.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {ev?.event_date?.substring(0, 10)}
                    {ev?.event_time ? ` · ${ev.event_time.substring(0, 5)}` : ''}
                  </p>
                  {sauna && (
                    <p className="mt-0.5 text-sm text-gray-400">
                      {sauna.name}{sauna.city ? ` · ${sauna.city}` : ''}
                    </p>
                  )}
                  {ev?.price && (
                    <p className="mt-1 text-sm font-semibold text-orange-700">
                      {String(ev.price).includes('zł') ? ev.price : `${ev.price} zł`}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
