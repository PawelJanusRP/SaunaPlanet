import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import RegistrationModerationActions from '@/components/RegistrationModerationActions'
import TodayQueue from '@/components/workspace/TodayQueue'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import WorkspaceContextSwitcher from '@/components/workspace/WorkspaceContextSwitcher'
import { workspaceContextLabel, withWorkspaceContext } from '@/lib/workspace/context'
import {
  OWNER_ALL_FACILITIES_LABEL,
  OWNER_WORKSPACE_LABEL,
  ownerBreadcrumbs,
  ownerNav,
} from '@/lib/workspace/owner'
import { loadOwnerWorkspaceScope } from '@/lib/workspace/ownerServer'

const EVENTS_PREVIEW_LIMIT = 5

const membershipStatusChip: Record<string, React.ReactNode> = {
  pending: <span className="text-xs font-semibold text-yellow-600">⏳ Oczekuje</span>,
  approved: <span className="text-xs font-semibold text-green-600">✓ Aktywny</span>,
  rejected: <span className="text-xs font-semibold text-red-500">✗ Odrzucony</span>,
}

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { context: contextParam } = await searchParams
  const { memberships, options, context, activeSaunaIds } =
    await loadOwnerWorkspaceScope(supabase, user.id, contextParam)

  const today = new Date().toISOString().split('T')[0]

  // Upcoming events for the facilities in scope
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let upcomingEvents: any[] = []
  // Pending registrations for upcoming events in scope (migrated from the
  // personal dashboard in SP-033 — same query, now context-filtered)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingRegistrations: any[] = []

  if (activeSaunaIds.length > 0) {
    const { data: eventsRaw } = await supabase
      .from('sauna_events')
      .select('id, title, event_date, event_time, sauna_id, saunas(name, city)')
      .in('sauna_id', activeSaunaIds)
      .gte('event_date', today)
      .order('event_date', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upcomingEvents = ((eventsRaw ?? []) as any[]).slice(0, EVENTS_PREVIEW_LIMIT)

    const eventIds = (eventsRaw ?? []).map((e) => e.id)
    if (eventIds.length > 0) {
      const { data: regsRaw } = await supabase
        .from('event_registrations')
        .select('id, status, created_at, user_id, event_id, sauna_events(id, title, event_date, sauna_id, saunas(name))')
        .in('event_id', eventIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingRegistrations = (regsRaw ?? []) as any[]

      const regUserIds = [...new Set(pendingRegistrations.map((r) => r.user_id))]
      if (regUserIds.length > 0) {
        const { data: regProfiles } = await supabase
          .from('public_profiles')
          .select('id, first_name, last_name')
          .in('id', regUserIds)
        const regNameById: Record<string, string> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (regProfiles ?? []) as any[]) {
          regNameById[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Użytkownik'
        }
        pendingRegistrations = pendingRegistrations.map((r) => ({ ...r, _userName: regNameById[r.user_id] ?? 'Użytkownik' }))
      }
    }
  }

  const activeFacilityId = context.scope === 'one' ? context.option.id : null

  return (
    <WorkspaceShell
      title={OWNER_WORKSPACE_LABEL}
      subtitle="Zarządzaj swoimi obiektami, rezerwacjami i wydarzeniami"
      contextLabel={options.length > 0 ? workspaceContextLabel(context, options, OWNER_ALL_FACILITIES_LABEL) : undefined}
      breadcrumbs={ownerBreadcrumbs(context)}
      nav={ownerNav(context)}
      actions={
        options.length > 1 ? (
          <WorkspaceContextSwitcher
            options={options}
            activeId={activeFacilityId}
            allLabel={OWNER_ALL_FACILITIES_LABEL}
            ariaLabel="Aktywny obiekt"
          />
        ) : undefined
      }
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
                          {context.scope === 'all' && ev?.saunas?.name && (
                            <span className="ml-1">· {ev.saunas.name}</span>
                          )}
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
        {memberships.length === 0 ? (
          <WorkspaceEmptyState
            icon="🏢"
            title="Nie zarządzasz jeszcze żadnym obiektem"
            description="Zarządzanie sauną możesz zgłosić na stronie obiektu. Po zatwierdzeniu obiekt pojawi się tutaj."
            actionHref="/sauny"
            actionLabel="Przeglądaj sauny"
          />
        ) : (
          <>
            <WorkspaceSection title="🏢 Moje obiekty">
              <div className="space-y-2">
                {memberships.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                    <Link href={`/sauna/${m.saunaId}`} className="font-semibold hover:underline">
                      {m.saunaName}
                      {m.saunaCity && <span className="ml-1 font-normal text-gray-400">· {m.saunaCity}</span>}
                    </Link>
                    {membershipStatusChip[m.status]}
                  </div>
                ))}
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="🔥 Nadchodzące wydarzenia"
              action={
                <Link
                  href={withWorkspaceContext('/workspace/events', context)}
                  className="text-orange-700 hover:underline"
                >
                  Wszystkie →
                </Link>
              }
            >
              {upcomingEvents.length === 0 ? (
                <WorkspaceEmptyState
                  icon="🔥"
                  title="Brak nadchodzących wydarzeń"
                  description="Wydarzenia Twoich obiektów pojawią się tutaj."
                />
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}`}
                      className="block rounded-2xl border p-4 transition-colors hover:bg-orange-50"
                    >
                      <p className="font-bold text-orange-700">{ev.title}</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {ev.event_date?.substring(0, 10)}
                        {ev.event_time ? ` · ${ev.event_time.substring(0, 5)}` : ''}
                      </p>
                      {context.scope === 'all' && ev.saunas?.name && (
                        <p className="mt-0.5 text-sm text-gray-400">
                          {ev.saunas.name}{ev.saunas.city ? ` · ${ev.saunas.city}` : ''}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection title="⚡ Szybkie akcje">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={withWorkspaceContext('/workspace/reservations', context)}
                  className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
                >
                  🎟️ Rezerwacje
                </Link>
                {activeFacilityId && (
                  <Link
                    href={`/sauna/${activeFacilityId}`}
                    className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
                  >
                    🧖 Strona obiektu
                  </Link>
                )}
                <Link
                  href="/submit"
                  className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
                >
                  ➕ Zgłoś nowy obiekt
                </Link>
              </div>
            </WorkspaceSection>
          </>
        )}
      </div>
    </WorkspaceShell>
  )
}
