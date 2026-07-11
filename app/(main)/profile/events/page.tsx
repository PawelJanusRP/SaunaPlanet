import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import {
  PERSONAL_NAV,
  PERSONAL_WORKSPACE_LABEL,
  personalBreadcrumbs,
} from '@/lib/workspace/personal'

const registrationStatusLabel: Record<string, { label: string; className: string }> = {
  pending: { label: '⏳ Oczekuje', className: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '✓ Potwierdzona', className: 'bg-green-100 text-green-700' },
  cancelled: { label: '✗ Anulowana', className: 'bg-red-100 text-red-600' },
}

export default async function PersonalEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const today = new Date().toISOString().split('T')[0]

  const [{ data: registrationsRaw }, { data: interestsRaw }] = await Promise.all([
    supabase
      .from('event_registrations')
      .select('id, status, created_at, event_id, sauna_events(id, title, event_date, event_time, price, sauna_id, saunas(name, city))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_event_interests')
      .select('event_id, status, sauna_events(id, title, event_date, event_time, sauna_id, saunas(name, city))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registrations = (registrationsRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingInterests = ((interestsRaw ?? []) as any[]).filter(
    (i) => i.sauna_events?.event_date >= today
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function EventRow({ event, children }: { event: any; children?: React.ReactNode }) {
    const sauna = event?.saunas
    return (
      <Link
        href={`/events/${event?.id}`}
        className="block rounded-2xl border p-4 transition-colors hover:bg-orange-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-orange-700">{event?.title}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {event?.event_date?.substring(0, 10)}
              {event?.event_time ? ` · ${event.event_time.substring(0, 5)}` : ''}
            </p>
            {sauna && (
              <p className="mt-0.5 text-sm text-gray-400">
                {sauna.name}{sauna.city ? ` · ${sauna.city}` : ''}
              </p>
            )}
          </div>
          {children}
        </div>
      </Link>
    )
  }

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle="Twoje rezerwacje i obserwowane wydarzenia"
      breadcrumbs={personalBreadcrumbs('Wydarzenia')}
      nav={PERSONAL_NAV}
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title="🎟️ Moje rezerwacje">
          {registrations.length === 0 ? (
            <WorkspaceEmptyState
              icon="🎟️"
              title="Brak rezerwacji"
              description="Kliknij „Zapisz się” na stronie wydarzenia, aby zarezerwować miejsce."
              actionHref="/events"
              actionLabel="Przeglądaj wydarzenia"
            />
          ) : (
            <div className="space-y-3">
              {registrations.map((reg) => {
                const status = registrationStatusLabel[reg.status]
                return (
                  <EventRow key={reg.id} event={reg.sauna_events}>
                    {status && (
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    )}
                  </EventRow>
                )
              })}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="🔥 Obserwowane („Idę”)">
          {upcomingInterests.length === 0 ? (
            <WorkspaceEmptyState
              icon="🔥"
              title="Brak obserwowanych wydarzeń"
              description="Oznacz nadchodzące wydarzenie jako „Idę”, a pojawi się tutaj."
              actionHref="/events"
              actionLabel="Przeglądaj wydarzenia"
            />
          ) : (
            <div className="space-y-3">
              {upcomingInterests.map((interest) => (
                <EventRow key={interest.event_id} event={interest.sauna_events} />
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
