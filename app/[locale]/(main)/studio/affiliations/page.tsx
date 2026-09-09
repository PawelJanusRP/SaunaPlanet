import { redirect } from 'next/navigation'
import Link from 'next/link'
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

function SaunaLine({ a }: { a: MasterAffiliation }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-gray-800">
        <Link href={`/sauna/${a.saunaId}`} className="hover:underline">{a.saunaName}</Link>
        {a.saunaCity && <span className="ml-1 font-normal text-gray-400">· {a.saunaCity}</span>}
        {a.isPrimary && <span className="ml-2 text-orange-600">⭐ główna</span>}
      </p>
      <p className="mt-0.5 text-xs text-gray-400">
        {a.initiatedBy === 'master' ? 'Twoje zgłoszenie' : 'Zaproszenie obiektu'}
        {' · '}{new Date(a.createdAt).toLocaleDateString('pl-PL')}
      </p>
    </div>
  )
}

export default async function StudioAffiliationsPage() {
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
      subtitle="Twoje relacje z obiektami"
      contextLabel={profile.name}
      breadcrumbs={masterBreadcrumbs('Afiliacje')}
      nav={MASTER_NAV}
      activeNavKey="affiliations"
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={`📨 Zaproszenia od obiektów (${invitations.length})`}>
          {invitations.length === 0 ? (
            <WorkspaceEmptyState icon="📨" title="Brak oczekujących zaproszeń" />
          ) : (
            <div className="space-y-3">
              {invitations.map((a) => (
                <div key={a.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SaunaLine a={a} />
                    <AffiliationDecisionActions affiliationId={a.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={`📤 Moje zgłoszenia (${ownRequests.length})`}>
          {ownRequests.length === 0 ? (
            <WorkspaceEmptyState icon="📤" title="Brak oczekujących zgłoszeń" />
          ) : (
            <div className="space-y-3">
              {ownRequests.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SaunaLine a={a} />
                    <EndAffiliationButton
                      affiliationId={a.id}
                      label="Wycofaj"
                      confirmLabel="Na pewno wycofaj"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title={`🤝 Aktywne afiliacje (${active.length})`}>
          {active.length === 0 ? (
            <WorkspaceEmptyState
              icon="🤝"
              title="Brak aktywnych afiliacji"
              description="Afiliacja to stała relacja z obiektem — poproś o nią poniżej albo przyjmij zaproszenie."
            />
          ) : (
            <div className="space-y-3">
              {active.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SaunaLine a={a} />
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

        <WorkspaceSection title="➕ Poproś o afiliację">
          {legacyHomeSaunaHint && (
            <p className="mb-3 rounded-xl bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
              Twoja dotychczasowa sauna macierzysta to{' '}
              <span className="font-semibold">{profile.homeSauna!.name}</span> (dane przejściowe).
              Wyślij jej zgłoszenie afiliacji, aby przenieść relację do nowego modelu.
            </p>
          )}
          <RequestAffiliationForm saunas={saunaOptions} />
          <p className="mt-2 text-xs text-gray-400">
            Obiekt musi zatwierdzić zgłoszenie — afiliacja zawsze wymaga zgody obu stron.
          </p>
        </WorkspaceSection>

        {history.length > 0 && (
          <WorkspaceSection title="🗂️ Historia">
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
