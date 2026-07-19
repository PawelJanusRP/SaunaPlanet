import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import EditEventForm from '@/components/EditEventForm'
import DeleteEventButton from '@/components/DeleteEventButton'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import WorkspaceContextSwitcher from '@/components/workspace/WorkspaceContextSwitcher'
import OwnerCreateEventButton from '@/components/workspace/OwnerCreateEventButton'
import ParticipationModerationActions from '@/components/workspace/ParticipationModerationActions'
import EventProposalActions from '@/components/workspace/EventProposalActions'
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
      .select('id, title, event_date, event_time, price, description, max_participants, sauna_id, saunas(name, city)')
      .in('sauna_id', activeSaunaIds)
      // active only (SP-037B): pending proposals live in their own queue
      // above, and rejected proposals must not linger in "upcoming"
      .eq('status', 'active')
      .order('event_date', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events = (eventsRaw ?? []) as any[]
  }

  const upcoming = events
    .filter((ev) => ev.event_date >= today)
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
  const past = events.filter((ev) => ev.event_date < today).slice(0, PAST_PREVIEW_LIMIT)

  // SP-037B slice 3: pending master-created event PROPOSALS for the
  // facilities in scope. Authorization is server-side (the queue is
  // context-scoped here; the resolve_master_event RPC independently
  // re-verifies staff/admin) — buttons are never the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventProposals: any[] = []
  if (activeSaunaIds.length > 0) {
    const { data: proposalsRaw } = await supabase
      .from('sauna_events')
      .select('id, title, description, event_date, event_time, price, max_participants, sauna_id, organizer_master_id, saunas(name, city), organizer:sauna_masters!sauna_events_organizer_master_id_fkey(id, name, avatar_url, level, status)')
      .eq('status', 'pending')
      .eq('bundled_with_submission', false)
      .not('organizer_master_id', 'is', null)
      .in('sauna_id', activeSaunaIds)
      .order('created_at', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventProposals = (proposalsRaw ?? []) as any[]
  }

  // SP-037: pending master participation requests for the facilities in
  // scope. RLS (is_event_staff arm) already limits visibility; the inner
  // join filter keeps the list within the active context.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let participationRequests: any[] = []
  if (activeSaunaIds.length > 0) {
    const { data: requestsRaw } = await supabase
      .from('sauna_event_masters')
      .select('id, created_at, sauna_events!inner(id, title, event_date, sauna_id, saunas(name)), sauna_masters(id, name, avatar_url, level)')
      .eq('status', 'pending')
      .in('sauna_events.sauna_id', activeSaunaIds)
      .order('created_at', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    participationRequests = (requestsRaw ?? []) as any[]
  }

  // Creating an event requires a concrete facility (SP-034): the selected
  // context, or the account's only facility. With "All facilities" and more
  // than one option there is no target — the page says so instead.
  const createTarget =
    context.scope === 'one'
      ? context.option
      : options.length === 1
        ? options[0]
        : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function EventInfo({ event }: { event: any }) {
    return (
      <Link href={`/events/${event.id}`} className="block hover:opacity-80">
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
        {options.length > 0 && (
          createTarget ? (
            <div className="flex justify-end">
              <OwnerCreateEventButton saunaId={createTarget.id} saunaName={createTarget.label} />
            </div>
          ) : (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              Aby dodać wydarzenie, wybierz konkretny obiekt w przełączniku powyżej —
              wydarzenie zawsze należy do jednego obiektu.
            </div>
          )
        )}

        {eventProposals.length > 0 && (
          <WorkspaceSection title={`📣 Propozycje wydarzeń (${eventProposals.length})`}>
            <div className="space-y-3">
              {eventProposals.map((p) => (
                <div key={p.id} className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
                  <div className="flex items-start gap-3">
                    {p.organizer?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.organizer.avatar_url}
                        alt={p.organizer.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-lg">🧖</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-orange-700">{p.title}</p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        {p.event_date?.substring(0, 10)}
                        {p.event_time ? ` · ${String(p.event_time).substring(0, 5)}` : ''}
                        {p.price && <> · {p.price}</>}
                        {p.max_participants != null && <> · limit: {p.max_participants}</>}
                      </p>
                      {context.scope === 'all' && p.saunas?.name && (
                        <p className="mt-0.5 text-sm text-gray-400">
                          {p.saunas.name}{p.saunas.city ? ` · ${p.saunas.city}` : ''}
                        </p>
                      )}
                      {p.description && (
                        <p className="mt-1.5 text-sm text-gray-600">{p.description}</p>
                      )}
                      <p className="mt-1.5 text-xs text-gray-500">
                        Organizuje:{' '}
                        <Link href={`/masters/${p.organizer?.id}`} className="font-medium hover:underline">
                          {p.organizer?.name ?? 'Saunamistrz'}
                        </Link>
                        {p.organizer?.level && (
                          <span className="ml-1 text-gray-400">· {p.organizer.level}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-2 text-xs text-gray-500">
                      Zatwierdzenie publikuje wydarzenie i dodaje organizatora do lineupu
                      z wybraną rolą — jedna, niepodzielna operacja.
                    </p>
                    <EventProposalActions eventId={p.id} />
                  </div>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}

        {participationRequests.length > 0 && (
          <WorkspaceSection title={`🧖 Zgłoszenia saunamistrzów (${participationRequests.length})`}>
            <div className="space-y-3">
              {participationRequests.map((r) => (
                <div key={r.id} className="rounded-2xl border border-yellow-200 bg-yellow-50/40 p-4">
                  <div className="flex items-center gap-3">
                    {r.sauna_masters?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.sauna_masters.avatar_url}
                        alt={r.sauna_masters.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-lg">🧖</div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800">
                        <Link href={`/masters/${r.sauna_masters?.id}`} className="hover:underline">
                          {r.sauna_masters?.name ?? 'Saunamistrz'}
                        </Link>
                        {r.sauna_masters?.level && (
                          <span className="ml-2 text-xs font-normal text-gray-400">{r.sauna_masters.level}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        chce wystąpić:{' '}
                        <Link href={`/events/${r.sauna_events?.id}`} className="font-medium hover:underline">
                          {r.sauna_events?.title}
                        </Link>
                        {' · '}{r.sauna_events?.event_date?.substring(0, 10)}
                        {context.scope === 'all' && r.sauna_events?.saunas?.name && (
                          <> · {r.sauna_events.saunas.name}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <ParticipationModerationActions assignmentId={r.id} />
                  </div>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}

        <WorkspaceSection title={`🔥 Nadchodzące (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <WorkspaceEmptyState
              icon="🔥"
              title="Brak nadchodzących wydarzeń"
              description={
                createTarget
                  ? 'Dodaj pierwsze wydarzenie dla swojego obiektu.'
                  : 'Wydarzenia Twoich obiektów pojawią się tutaj.'
              }
            />
          ) : (
            <div className="space-y-3">
              {upcoming.map((ev) => (
                <div key={ev.id} className="rounded-2xl border p-4">
                  <EventInfo event={ev} />
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    <EditEventForm
                      eventId={ev.id}
                      title={ev.title}
                      event_date={ev.event_date}
                      event_time={ev.event_time ?? null}
                      price={ev.price ?? null}
                      description={ev.description ?? null}
                      max_participants={ev.max_participants ?? null}
                    />
                    <DeleteEventButton eventId={ev.id} eventTitle={ev.title} />
                  </div>
                </div>
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
                <div key={ev.id} className="rounded-2xl border p-4 transition-colors hover:bg-orange-50">
                  <EventInfo event={ev} />
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
