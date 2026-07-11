import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import RegistrationModerationActions from '@/components/RegistrationModerationActions'
import TodayQueue from '@/components/workspace/TodayQueue'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import {
  PERSONAL_NAV,
  PERSONAL_WORKSPACE_LABEL,
  personalBreadcrumbs,
} from '@/lib/workspace/personal'

const FAVORITES_PREVIEW_LIMIT = 4
const EVENTS_PREVIEW_LIMIT = 3
const ACTIVITY_PREVIEW_LIMIT = 4

export default async function PersonalDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: profile },
    { data: favoritesRaw },
    { data: interestsRaw },
    { data: managedSaunasRaw },
    { data: eventReviewsRaw },
    { data: saunaReviewsRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
    supabase
      .from('user_favorites')
      .select('sauna_id, saunas(id, name, city, cover_image_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_event_interests')
      .select('event_id, status, sauna_events(id, title, event_date, event_time, sauna_id, saunas(name, city))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('sauna_managers')
      .select('id, status, sauna_id, saunas(id, name, city)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('event_reviews')
      .select('id, rating, comment, created_at, event_id, sauna_events(title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_PREVIEW_LIMIT),
    supabase
      .from('sauna_reviews')
      .select('id, rating, review_text, created_at, sauna_id, saunas(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_PREVIEW_LIMIT),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const favorites = (favoritesRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const managedSaunas = (managedSaunasRaw ?? []) as any[]
  const approvedSaunaIds = managedSaunas.filter((m) => m.status === 'approved').map((m) => m.sauna_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingEvents = ((interestsRaw ?? []) as any[])
    .filter((i) => i.sauna_events?.event_date >= today)
    .slice(0, EVENTS_PREVIEW_LIMIT)

  const previewFavorites = favorites.slice(0, FAVORITES_PREVIEW_LIMIT)
  const favSaunaIds = previewFavorites.map((f) => f.sauna_id).filter(Boolean)
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

  // Pending registrations for saunas managed by this user (Today queue)
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

  // Recent activity: own reviews across saunas and events, newest first
  const recentActivity = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((eventReviewsRaw ?? []) as any[]).map((r) => ({
      id: `event-${r.id}`,
      href: `/events/${r.event_id}`,
      label: r.sauna_events?.title ?? 'Wydarzenie',
      kind: 'Recenzja wydarzenia',
      rating: r.rating,
      created_at: r.created_at,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((saunaReviewsRaw ?? []) as any[]).map((r) => ({
      id: `sauna-${r.id}`,
      href: `/sauna/${r.sauna_id}`,
      label: r.saunas?.name ?? 'Sauna',
      kind: 'Recenzja sauny',
      rating: r.rating,
      created_at: r.created_at,
    })),
  ]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, ACTIVITY_PREVIEW_LIMIT)

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle={displayName ? `Cześć, ${displayName}!` : user.email ?? undefined}
      breadcrumbs={personalBreadcrumbs()}
      nav={PERSONAL_NAV}
      todayQueue={
        <TodayQueue>
          {pendingRegistrations.length > 0 ? (
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
          ) : null}
        </TodayQueue>
      }
    >
      <div className="space-y-4 sm:space-y-6">
        {managedSaunas.length > 0 && (
          <WorkspaceSection title="🏢 Moje sauny (manager)">
            <div className="space-y-2">
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
          </WorkspaceSection>
        )}

        <WorkspaceSection
          title="🔥 Nadchodzące wydarzenia"
          action={
            <Link href="/profile/events" className="text-orange-700 hover:underline">
              Wszystkie →
            </Link>
          }
        >
          {upcomingEvents.length === 0 ? (
            <WorkspaceEmptyState
              icon="🔥"
              title="Brak nadchodzących wydarzeń"
              description="Zapisz się na wydarzenie lub oznacz je jako „Idę”, a pojawi się tutaj."
              actionHref="/events"
              actionLabel="Przeglądaj wydarzenia"
            />
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((interest) => {
                const ev = interest.sauna_events
                const sauna = ev?.saunas
                return (
                  <Link
                    key={interest.event_id}
                    href={`/events/${ev?.id}`}
                    className="block rounded-2xl border p-4 transition-colors hover:bg-orange-50"
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
                  </Link>
                )
              })}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="♥ Ulubione sauny"
          action={
            <Link href="/profile/favorites" className="text-orange-700 hover:underline">
              Wszystkie ({favorites.length}) →
            </Link>
          }
        >
          {previewFavorites.length === 0 ? (
            <WorkspaceEmptyState
              icon="🧖"
              title="Brak ulubionych saun"
              description="Dodaj sauny do ulubionych na ich stronach, aby mieć je pod ręką."
              actionHref="/sauny"
              actionLabel="Przeglądaj sauny"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {previewFavorites.map((fav) => {
                const sauna = fav.saunas
                return (
                  <Link
                    key={fav.sauna_id}
                    href={`/sauna/${sauna?.id}`}
                    className="flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-orange-50"
                  >
                    {(firstFavPhoto[fav.sauna_id] ?? sauna?.cover_image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                      <p className="truncate font-bold leading-tight">{sauna?.name}</p>
                      {sauna?.city && <p className="mt-0.5 text-sm text-gray-500">{sauna.city}</p>}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="⭐ Ostatnia aktywność"
          action={
            <Link href="/profile/reviews" className="text-orange-700 hover:underline">
              Moje recenzje →
            </Link>
          }
        >
          {recentActivity.length === 0 ? (
            <WorkspaceEmptyState
              icon="⭐"
              title="Brak aktywności"
              description="Twoje recenzje saun i wydarzeń pojawią się tutaj."
            />
          ) : (
            <div className="space-y-2">
              {recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-2.5 transition-colors hover:bg-orange-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-gray-400">
                      {item.kind} · {new Date(item.created_at).toLocaleDateString('pl-PL')}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-yellow-600">{item.rating} ★</span>
                </Link>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
