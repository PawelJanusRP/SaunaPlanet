import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

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

  const [{ data: favoritesRaw }, { data: interestsRaw }] = await Promise.all([
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
  ])

  const favorites = (favoritesRaw ?? []) as any[]

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
  const upcomingEvents = ((interestsRaw ?? []) as any[]).filter(
    (i) => i.sauna_events?.event_date >= today
  )

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
      </section>

      {/* Ulubione sauny */}
      <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">♥ Ulubione sauny</h2>

        {favorites.length === 0 ? (
          <p className="text-sm text-gray-500">
            Brak ulubionych saun. Dodaj je na stronie sauny.
          </p>
        ) : (
          <div className="space-y-3">
            {favorites.map((fav: any) => {
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
            {upcomingEvents.map((interest: any) => {
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
