import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import WorkspaceContextSwitcher from '@/components/workspace/WorkspaceContextSwitcher'
import { workspaceContextLabel } from '@/lib/workspace/context'
import {
  OWNER_ALL_FACILITIES_LABEL,
  OWNER_WORKSPACE_LABEL,
  ownerBreadcrumbs,
  ownerNav,
} from '@/lib/workspace/owner'
import { loadOwnerWorkspaceScope } from '@/lib/workspace/ownerServer'

const PAST_PREVIEW_LIMIT = 10

export default async function OwnerEventsPage({
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
  const { options, context, activeSaunaIds } =
    await loadOwnerWorkspaceScope(supabase, user.id, contextParam)

  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let events: any[] = []
  if (activeSaunaIds.length > 0) {
    const { data: eventsRaw } = await supabase
      .from('sauna_events')
      .select('id, title, event_date, event_time, price, sauna_id, saunas(name, city)')
      .in('sauna_id', activeSaunaIds)
      .order('event_date', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events = (eventsRaw ?? []) as any[]
  }

  const upcoming = events
    .filter((ev) => ev.event_date >= today)
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
  const past = events.filter((ev) => ev.event_date < today).slice(0, PAST_PREVIEW_LIMIT)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function EventRow({ event }: { event: any }) {
    return (
      <Link
        href={`/events/${event.id}`}
        className="block rounded-2xl border p-4 transition-colors hover:bg-orange-50"
      >
        <p className="font-bold text-orange-700">{event.title}</p>
        <p className="mt-0.5 text-sm text-gray-500">
          {event.event_date?.substring(0, 10)}
          {event.event_time ? ` · ${event.event_time.substring(0, 5)}` : ''}
        </p>
        {context.scope === 'all' && event.saunas?.name && (
          <p className="mt-0.5 text-sm text-gray-400">
            {event.saunas.name}{event.saunas.city ? ` · ${event.saunas.city}` : ''}
          </p>
        )}
        {event.price && (
          <p className="mt-1 text-sm font-semibold text-orange-700">
            {String(event.price).includes('zł') ? event.price : `${event.price} zł`}
          </p>
        )}
      </Link>
    )
  }

  return (
    <WorkspaceShell
      title={OWNER_WORKSPACE_LABEL}
      subtitle="Wydarzenia Twoich obiektów"
      contextLabel={options.length > 0 ? workspaceContextLabel(context, options, OWNER_ALL_FACILITIES_LABEL) : undefined}
      breadcrumbs={ownerBreadcrumbs(context, 'Wydarzenia')}
      nav={ownerNav(context)}
      actions={
        options.length > 1 ? (
          <WorkspaceContextSwitcher
            options={options}
            activeId={context.scope === 'one' ? context.option.id : null}
            allLabel={OWNER_ALL_FACILITIES_LABEL}
            ariaLabel="Aktywny obiekt"
          />
        ) : undefined
      }
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={`🔥 Nadchodzące (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <WorkspaceEmptyState
              icon="🔥"
              title="Brak nadchodzących wydarzeń"
              description="Wydarzenia Twoich obiektów pojawią się tutaj."
            />
          ) : (
            <div className="space-y-3">
              {upcoming.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="🗓️ Minione (ostatnie)">
          {past.length === 0 ? (
            <WorkspaceEmptyState
              icon="🗓️"
              title="Brak minionych wydarzeń"
            />
          ) : (
            <div className="space-y-3">
              {past.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
