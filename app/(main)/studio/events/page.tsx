import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import StudioAccessNotice from '@/components/studio/StudioAccessNotice'
import EventParticipationControls from '@/components/EventParticipationControls'
import CreateMasterEventForm from '@/components/studio/CreateMasterEventForm'
import WithdrawProposalButton from '@/components/studio/WithdrawProposalButton'
import InvitationResponseButtons from '@/components/studio/InvitationResponseButtons'
import {
  MASTER_NAV,
  MASTER_STUDIO_LABEL,
  PARTICIPATION_STATUS_LABELS,
  masterBreadcrumbs,
} from '@/lib/workspace/master'
import { loadMasterStudioScope } from '@/lib/workspace/masterServer'

const HISTORY_PREVIEW_LIMIT = 15

/**
 * SP-037 "Moje wydarzenia" — the master's own events: organized proposals,
 * facility invitations, pending requests (withdrawable), upcoming confirmed
 * appearances, and history.
 * RLS shows the owner every own row regardless of status.
 */
export default async function StudioEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { profile } = await loadMasterStudioScope(supabase, user.id)

  if (!profile) return <StudioAccessNotice kind="none" />
  if (profile.status !== 'approved') {
    return <StudioAccessNotice kind={profile.status === 'pending' ? 'pending' : 'rejected'} masterId={profile.id} />
  }

  const [{ data: rowsRaw }, { data: organizedRaw }, { data: saunasRaw }] = await Promise.all([
    supabase
      .from('sauna_event_masters')
      .select('id, status, role, initiated_by, created_at, sauna_events(id, title, status, organizer_master_id, event_date, event_time, saunas(id, name, city))')
      .eq('master_id', profile.id)
      .order('created_at', { ascending: false }),
    // Defect-1 hardening: organized events are ALSO loaded directly by
    // organizer_master_id — the dashboard must never depend on the
    // participation pair existing (e.g. raw-API events, deleted pairs).
    supabase
      .from('sauna_events')
      .select('id, title, status, organizer_master_id, event_date, event_time, saunas(id, name, city)')
      .eq('organizer_master_id', profile.id)
      .order('created_at', { ascending: false }),
    // facility picker for master-created events — active facilities only;
    // the create_master_event RPC re-validates and decides the routing
    supabase
      .from('saunas')
      .select('id, name, city')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(1000),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participationRows = (rowsRaw ?? []) as any[]
  // Union: organized events without a participation pair get a synthesized
  // display row (organizer events show exactly once — pair rows win, since
  // they carry the role).
  const coveredEventIds = new Set(
    participationRows.map((r) => r.sauna_events?.id).filter(Boolean)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthesized = ((organizedRaw ?? []) as any[])
    .filter((e) => !coveredEventIds.has(e.id))
    .map((e) => ({
      id: `organized-${e.id}`,
      status:
        e.status === 'active' ? 'approved'
        : e.status === 'pending' ? 'pending'
        : 'rejected',
      role: null,
      created_at: null,
      sauna_events: e,
    }))
  const rows = [...participationRows, ...synthesized]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaOptions = (saunasRaw ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOwnProposal = (r: any) =>
    r.sauna_events?.organizer_master_id === profile!.id &&
    r.sauna_events?.status === 'pending'
  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventDate = (r: any) => r.sauna_events?.event_date?.substring(0, 10) ?? ''

  // Rule D: facility-originated invitations get their own section — they
  // are responded to (accept/reject), never withdrawn by the master.
  const invitations = rows.filter((r) => r.status === 'pending' && r.initiated_by === 'facility')
  const pending = rows.filter((r) => r.status === 'pending' && r.initiated_by !== 'facility')
  const upcoming = rows.filter((r) => r.status === 'approved' && eventDate(r) >= today)
  const history = rows
    .filter((r) => r.status === 'rejected' || (r.status === 'approved' && eventDate(r) < today))
    .slice(0, HISTORY_PREVIEW_LIMIT)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function EventLine({ r }: { r: any }) {
    const ev = r.sauna_events
    if (!ev) return <span className="text-sm text-gray-400">Wydarzenie usunięte</span>
    return (
      <div className="min-w-0">
        <p className="font-semibold text-gray-800">
          <Link href={`/events/${ev.id}`} className="hover:underline">{ev.title}</Link>
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {eventDate(r)}
          {ev.event_time ? ` · ${String(ev.event_time).substring(0, 5)}` : ''}
          {ev.saunas?.name && <> · {ev.saunas.name}{ev.saunas.city ? ` (${ev.saunas.city})` : ''}</>}
          {r.role && <> · rola: {r.role}</>}
        </p>
      </div>
    )
  }

  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle="Wydarzenia, które organizujesz i na których występujesz"
      breadcrumbs={masterBreadcrumbs('Moje wydarzenia')}
      nav={MASTER_NAV}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex justify-end">
          <CreateMasterEventForm saunas={saunaOptions} />
        </div>

        {invitations.length > 0 && (
          <WorkspaceSection title={`📨 Zaproszenia od obiektów (${invitations.length})`}>
            <div className="space-y-3">
              {invitations.map((r) => (
                <div key={r.id} className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <EventLine r={r} />
                      <p className="mt-1 text-xs text-orange-700">
                        Obiekt zaprasza Cię do wystąpienia — oferowana rola:{' '}
                        <span className="font-semibold">{r.role}</span>
                        {' '}(przyjęcie zachowuje dokładnie tę rolę)
                      </p>
                    </div>
                    <InvitationResponseButtons invitationId={r.id} offeredRole={r.role} />
                  </div>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}

        <WorkspaceSection title={`⏳ Oczekujące zgłoszenia (${pending.length})`}>
          {pending.length === 0 ? (
            <WorkspaceEmptyState
              icon="🧖"
              title="Brak oczekujących zgłoszeń"
              description="Znajdź wydarzenie na mapie lub liście wydarzeń i zgłoś swój udział z jego strony."
            />
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                  <EventLine r={r} />
                  {isOwnProposal(r) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                        📣 Twoja propozycja wydarzenia — czeka na managera obiektu
                      </span>
                      <WithdrawProposalButton
                        eventId={r.sauna_events?.id}
                        eventTitle={r.sauna_events?.title ?? ''}
                      />
                    </div>
                  ) : (
                    <EventParticipationControls
                      eventId={r.sauna_events?.id}
                      assignment={{ id: r.id, status: r.status, role: r.role }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={`🔥 Nadchodzące wydarzenia (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <WorkspaceEmptyState icon="🔥" title="Brak nadchodzących wydarzeń" />
          ) : (
            <div className="space-y-3">
              {upcoming.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                  <EventLine r={r} />
                  {r.sauna_events?.organizer_master_id === profile.id ? (
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                      📣 Organizator
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      {PARTICIPATION_STATUS_LABELS.approved}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="🗓️ Historia">
          {history.length === 0 ? (
            <WorkspaceEmptyState icon="🗓️" title="Brak historii wydarzeń" />
          ) : (
            <div className="space-y-3">
              {history.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                  <EventLine r={r} />
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {r.status === 'rejected'
                      ? PARTICIPATION_STATUS_LABELS.rejected
                      : 'Wystąpienie zakończone'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
