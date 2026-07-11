import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import RegistrationModerationActions from '@/components/RegistrationModerationActions'
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

const RESOLVED_PREVIEW_LIMIT = 20

const registrationStatusChip: Record<string, { label: string; className: string }> = {
  confirmed: { label: '✓ Potwierdzona', className: 'bg-green-100 text-green-700' },
  cancelled: { label: '✗ Anulowana', className: 'bg-red-100 text-red-600' },
}

export default async function OwnerReservationsPage({
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let registrations: any[] = []
  if (activeSaunaIds.length > 0) {
    const { data: eventsRaw } = await supabase
      .from('sauna_events')
      .select('id')
      .in('sauna_id', activeSaunaIds)

    const eventIds = (eventsRaw ?? []).map((e) => e.id)
    if (eventIds.length > 0) {
      const { data: regsRaw } = await supabase
        .from('event_registrations')
        .select('id, status, created_at, user_id, event_id, sauna_events(id, title, event_date, sauna_id, saunas(name))')
        .in('event_id', eventIds)
        .order('created_at', { ascending: false })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registrations = (regsRaw ?? []) as any[]

      const regUserIds = [...new Set(registrations.map((r) => r.user_id))]
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
        registrations = registrations.map((r) => ({ ...r, _userName: regNameById[r.user_id] ?? 'Użytkownik' }))
      }
    }
  }

  const pending = registrations
    .filter((r) => r.status === 'pending')
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  const resolved = registrations
    .filter((r) => r.status !== 'pending')
    .slice(0, RESOLVED_PREVIEW_LIMIT)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function RegistrationMeta({ reg }: { reg: any }) {
    const ev = reg.sauna_events
    return (
      <div className="min-w-0">
        <p className="font-semibold text-gray-800">{reg._userName}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          <Link href={`/events/${ev?.id}`} className="hover:underline">
            🔥 {ev?.title}
          </Link>
          {ev?.event_date && <span className="ml-1">· {ev.event_date.substring(0, 10)}</span>}
          {context.scope === 'all' && ev?.saunas?.name && <span className="ml-1">· {ev.saunas.name}</span>}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          Zgłoszono: {new Date(reg.created_at).toLocaleDateString('pl-PL')}
        </p>
      </div>
    )
  }

  return (
    <WorkspaceShell
      title={OWNER_WORKSPACE_LABEL}
      subtitle="Rezerwacje wydarzeń Twoich obiektów"
      contextLabel={options.length > 0 ? workspaceContextLabel(context, options, OWNER_ALL_FACILITIES_LABEL) : undefined}
      breadcrumbs={ownerBreadcrumbs(context, 'Rezerwacje')}
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
        <WorkspaceSection title={`⏳ Oczekujące (${pending.length})`}>
          {pending.length === 0 ? (
            <WorkspaceEmptyState
              icon="✅"
              title="Brak oczekujących rezerwacji"
              description="Nowe zapisy na wydarzenia Twoich obiektów pojawią się tutaj."
            />
          ) : (
            <div className="space-y-3">
              {pending.map((reg) => (
                <div key={reg.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <RegistrationMeta reg={reg} />
                    <RegistrationModerationActions registrationId={reg.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="🗂️ Rozstrzygnięte (ostatnie)">
          {resolved.length === 0 ? (
            <WorkspaceEmptyState
              icon="🗂️"
              title="Brak rozstrzygniętych rezerwacji"
              description="Potwierdzone i odrzucone rezerwacje pojawią się tutaj."
            />
          ) : (
            <div className="space-y-2">
              {resolved.map((reg) => {
                const status = registrationStatusChip[reg.status]
                return (
                  <div key={reg.id} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 px-4 py-2.5">
                    <RegistrationMeta reg={reg} />
                    {status && (
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
