import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import StudioAccessNotice from '@/components/studio/StudioAccessNotice'
import AffiliationDecisionActions from '@/components/studio/AffiliationDecisionActions'
import EndAffiliationButton from '@/components/studio/EndAffiliationButton'
import SetPrimaryAffiliationButton from '@/components/studio/SetPrimaryAffiliationButton'
import RequestAffiliationForm from '@/components/studio/RequestAffiliationForm'
import {
  AFFILIATION_STATUS_LABELS,
  MASTER_NAV,
  MASTER_STUDIO_LABEL,
  masterBreadcrumbs,
} from '@/lib/workspace/master'
import { loadMasterStudioScope, type MasterAffiliation } from '@/lib/workspace/masterServer'

const HISTORY_PREVIEW_LIMIT = 10

function SaunaLine({
  a,
  primaryTag,
  ownRequestLabel,
  facilityInvitationLabel,
}: {
  a: MasterAffiliation
  primaryTag: string
  ownRequestLabel: string
  facilityInvitationLabel: string
}) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-gray-800">
        <Link href={`/sauna/${a.saunaId}`} className="hover:underline">{a.saunaName}</Link>
        {a.saunaCity && <span className="ml-1 font-normal text-gray-400">· {a.saunaCity}</span>}
        {a.isPrimary && <span className="ml-2 text-orange-600">{primaryTag}</span>}
      </p>
      <p className="mt-0.5 text-xs text-gray-400">
        {a.initiatedBy === 'master' ? ownRequestLabel : facilityInvitationLabel}
        {' · '}{new Date(a.createdAt).toLocaleDateString('pl-PL')}
      </p>
    </div>
  )
}

export default async function StudioAffiliationsPage() {
  const t = await getTranslations('studio')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { profile, affiliations } = await loadMasterStudioScope(supabase, user.id)

  if (!profile) return <StudioAccessNotice kind="none" />
  if (profile.status !== 'approved') {
    return <StudioAccessNotice kind={profile.status === 'pending' ? 'pending' : 'rejected'} masterId={profile.id} />
  }

  const invitations = affiliations.filter((a) => a.status === 'pending' && a.initiatedBy === 'facility')
  const ownRequests = affiliations.filter((a) => a.status === 'pending' && a.initiatedBy === 'master')
  const active = affiliations.filter((a) => a.status === 'approved')
  const history = affiliations
    .filter((a) => a.status === 'rejected' || a.status === 'ended')
    .slice(0, HISTORY_PREVIEW_LIMIT)

  // facilities without an open relationship — options for a new request
  const openSaunaIds = new Set(
    affiliations.filter((a) => a.status === 'pending' || a.status === 'approved').map((a) => a.saunaId)
  )
  const { data: saunasRaw } = await supabase
    .from('saunas')
    .select('id, name, city')
    .order('name', { ascending: true })
    .limit(1000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaOptions = ((saunasRaw ?? []) as any[])
    .filter((s) => !openSaunaIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, city: s.city ?? null }))

  const legacyHomeSaunaHint =
    profile.homeSauna && !affiliations.some((a) => a.saunaId === profile.homeSauna!.id)

  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle={t('affiliations.subtitle')}
      contextLabel={profile.name}
      breadcrumbs={masterBreadcrumbs(t('affiliations.breadcrumb'))}
      nav={MASTER_NAV}
      activeNavKey="affiliations"
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={t('affiliations.invitationsTitle', { count: invitations.length })}>
          {invitations.length === 0 ? (
            <WorkspaceEmptyState icon="📨" title={t('affiliations.invitationsEmptyTitle')} />
          ) : (
            <div className="space-y-3">
              {invitations.map((a) => (
                <div key={a.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SaunaLine
                      a={a}
                      primaryTag={t('affiliations.primaryTag')}
                      ownRequestLabel={t('affiliations.ownRequestLabel')}
                      facilityInvitationLabel={t('affiliations.facilityInvitationLabel')}
                    />
                    <AffiliationDecisionActions affiliationId={a.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t('affiliations.ownRequestsTitle', { count: ownRequests.length })}>
          {ownRequests.length === 0 ? (
            <WorkspaceEmptyState icon="📤" title={t('affiliations.ownRequestsEmptyTitle')} />
          ) : (
            <div className="space-y-3">
              {ownRequests.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SaunaLine
                      a={a}
                      primaryTag={t('affiliations.primaryTag')}
                      ownRequestLabel={t('affiliations.ownRequestLabel')}
                      facilityInvitationLabel={t('affiliations.facilityInvitationLabel')}
                    />
                    <EndAffiliationButton
                      affiliationId={a.id}
                      label={t('affiliations.withdraw')}
                      confirmLabel={t('affiliations.withdrawConfirm')}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t('affiliations.activeTitle', { count: active.length })}>
          {active.length === 0 ? (
            <WorkspaceEmptyState
              icon="🤝"
              title={t('affiliations.activeEmptyTitle')}
              description={t('affiliations.activeEmptyDescription')}
            />
          ) : (
            <div className="space-y-3">
              {active.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SaunaLine
                      a={a}
                      primaryTag={t('affiliations.primaryTag')}
                      ownRequestLabel={t('affiliations.ownRequestLabel')}
                      facilityInvitationLabel={t('affiliations.facilityInvitationLabel')}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {!a.isPrimary && <SetPrimaryAffiliationButton affiliationId={a.id} />}
                      <EndAffiliationButton affiliationId={a.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={t('affiliations.requestTitle')}>
          {legacyHomeSaunaHint && (
            <p className="mb-3 rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
              {t('affiliations.legacyHomeSaunaHint', { sauna: profile.homeSauna!.name })}
            </p>
          )}
          <RequestAffiliationForm saunas={saunaOptions} />
          <p className="mt-2 text-xs text-gray-400">
            {t('affiliations.requestBothSidesHint')}
          </p>
        </WorkspaceSection>

        {history.length > 0 && (
          <WorkspaceSection title={t('affiliations.historyTitle')}>
            <div className="space-y-2">
              {history.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-gray-600">
                    {a.saunaName}{a.saunaCity ? ` · ${a.saunaCity}` : ''}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-gray-500">
                    {AFFILIATION_STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}
      </div>
    </WorkspaceShell>
  )
}
