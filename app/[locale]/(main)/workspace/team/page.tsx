import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import WorkspaceContextSwitcher from '@/components/workspace/WorkspaceContextSwitcher'
import AffiliationDecisionActions from '@/components/studio/AffiliationDecisionActions'
import EndAffiliationButton from '@/components/studio/EndAffiliationButton'
import InviteMasterForm from '@/components/workspace/InviteMasterForm'
import { workspaceContextLabel } from '@/lib/workspace/context'
import {
  OWNER_ALL_FACILITIES_LABEL,
  OWNER_WORKSPACE_LABEL,
  ownerBreadcrumbs,
  ownerNav,
} from '@/lib/workspace/owner'
import { loadOwnerWorkspaceScope } from '@/lib/workspace/ownerServer'

type TeamAffiliation = {
  id: string
  status: string
  initiated_by: 'master' | 'facility'
  is_primary: boolean
  created_at: string
  sauna_id: string
  sauna_masters: { id: string; name: string; level: string | null; avatar_url: string | null } | null
  saunas: { name: string } | null
}

export default async function OwnerTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>
}) {
  const t = await getTranslations('workspace')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { context: contextParam } = await searchParams
  const { options, context, activeSaunaIds } =
    await loadOwnerWorkspaceScope(supabase, user.id, contextParam)

  let affiliations: TeamAffiliation[] = []
  if (activeSaunaIds.length > 0) {
    const { data } = await supabase
      .from('master_affiliations')
      .select('id, status, initiated_by, is_primary, created_at, sauna_id, sauna_masters(id, name, level, avatar_url), saunas(name)')
      .in('sauna_id', activeSaunaIds)
      .order('created_at', { ascending: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    affiliations = (data ?? []) as any[]
  }

  const requests = affiliations.filter((a) => a.status === 'pending' && a.initiated_by === 'master')
  const invitations = affiliations.filter((a) => a.status === 'pending' && a.initiated_by === 'facility')
  const active = affiliations.filter((a) => a.status === 'approved')

  // Inviting requires a concrete facility: the selected context, or the
  // account's only facility (same rule as event creation in SP-034).
  const inviteTarget =
    context.scope === 'one' ? context.option : options.length === 1 ? options[0] : null

  // masters available to invite for the target facility (no open relationship)
  let masterOptions: { id: string; name: string }[] = []
  if (inviteTarget) {
    const openMasterIds = new Set(
      affiliations
        .filter((a) => a.sauna_id === inviteTarget.id && (a.status === 'pending' || a.status === 'approved'))
        .map((a) => a.sauna_masters?.id)
        .filter(Boolean)
    )
    const { data: mastersRaw } = await supabase
      .from('sauna_masters')
      .select('id, name')
      .eq('status', 'approved')
      .order('name', { ascending: true })
      .limit(1000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    masterOptions = ((mastersRaw ?? []) as any[]).filter((m) => !openMasterIds.has(m.id))
  }

  function MasterLine({ a }: { a: TeamAffiliation }) {
    const master = a.sauna_masters
    return (
      <div className="flex min-w-0 items-center gap-3">
        {master?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={master.avatar_url} alt={master.name} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-lg">🧖</div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">
            <Link href={`/masters/${master?.id}`} className="hover:underline">
              {master?.name ?? t('common.master')}
            </Link>
            {master?.level && <span className="ml-2 text-xs font-normal capitalize text-gray-400">{master.level}</span>}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {context.scope === 'all' && a.saunas?.name && <span>{a.saunas.name} · </span>}
            {new Date(a.created_at).toLocaleDateString('pl-PL')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <WorkspaceShell
      title={OWNER_WORKSPACE_LABEL}
      subtitle={t('team.subtitle')}
      contextLabel={options.length > 0 ? workspaceContextLabel(context, options, OWNER_ALL_FACILITIES_LABEL) : undefined}
      breadcrumbs={ownerBreadcrumbs(context, t('team.breadcrumb'))}
      nav={ownerNav(context)}
      activeNavKey="team"
      actions={
        options.length > 1 ? (
          <WorkspaceContextSwitcher
            options={options}
            activeId={context.scope === 'one' ? context.option.id : null}
            allLabel={OWNER_ALL_FACILITIES_LABEL}
            ariaLabel={t('aria.activeFacility')}
          />
        ) : undefined
      }
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={t('team.requestsTitle', { count: requests.length })}>
          {requests.length === 0 ? (
            <WorkspaceEmptyState icon="📨" title={t('team.noRequestsTitle')} />
          ) : (
            <div className="space-y-3">
              {requests.map((a) => (
                <div key={a.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MasterLine a={a} />
                    <AffiliationDecisionActions affiliationId={a.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t('team.sentInvitationsTitle', { count: invitations.length })}>
          {invitations.length === 0 ? (
            <WorkspaceEmptyState icon="📤" title={t('team.noSentInvitationsTitle')} />
          ) : (
            <div className="space-y-3">
              {invitations.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MasterLine a={a} />
                    <EndAffiliationButton
                      affiliationId={a.id}
                      label={t('team.withdraw')}
                      confirmLabel={t('team.withdrawConfirm')}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t('team.activeTitle', { count: active.length })}>
          {active.length === 0 ? (
            <WorkspaceEmptyState
              icon="🤝"
              title={t('team.noActiveTitle')}
              description={t('team.noActiveDescription')}
            />
          ) : (
            <div className="space-y-3">
              {active.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MasterLine a={a} />
                    <EndAffiliationButton affiliationId={a.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        {options.length > 0 && (
          inviteTarget ? (
            <WorkspaceSection title={t('team.inviteTitle', { facility: inviteTarget.label })}>
              <InviteMasterForm
                saunaId={inviteTarget.id}
                saunaName={inviteTarget.label}
                masters={masterOptions}
              />
              <p className="mt-2 text-xs text-gray-400">
                {t('team.inviteHint')}
              </p>
            </WorkspaceSection>
          ) : (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {t('team.pickFacilityToInvite')}
            </div>
          )
        )}
      </div>
    </WorkspaceShell>
  )
}
