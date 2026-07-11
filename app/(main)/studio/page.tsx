import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import TodayQueue from '@/components/workspace/TodayQueue'
import StudioAccessNotice from '@/components/studio/StudioAccessNotice'
import AffiliationDecisionActions from '@/components/studio/AffiliationDecisionActions'
import {
  MASTER_NAV,
  MASTER_STATUS_LABELS,
  MASTER_STUDIO_LABEL,
  masterBreadcrumbs,
} from '@/lib/workspace/master'
import { loadMasterStudioScope } from '@/lib/workspace/masterServer'

export default async function StudioDashboardPage() {
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

  const invitations = affiliations.filter(
    (a) => a.status === 'pending' && a.initiatedBy === 'facility'
  )
  const ownRequests = affiliations.filter(
    (a) => a.status === 'pending' && a.initiatedBy === 'master'
  )
  const active = affiliations.filter((a) => a.status === 'approved')
  const primary = active.find((a) => a.isPrimary) ?? null

  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle="Twoja przestrzeń zawodowa saunamistrza"
      contextLabel={profile.name}
      breadcrumbs={masterBreadcrumbs()}
      nav={MASTER_NAV}
      todayQueue={
        <TodayQueue>
          {invitations.length > 0 ? (
            <div className="space-y-3">
              {invitations.map((a) => (
                <div key={a.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800">
                        Zaproszenie do afiliacji: {a.saunaName}
                        {a.saunaCity && <span className="ml-1 font-normal text-gray-400">· {a.saunaCity}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Wysłano: {new Date(a.createdAt).toLocaleDateString('pl-PL')}
                      </p>
                    </div>
                    <AffiliationDecisionActions affiliationId={a.id} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </TodayQueue>
      }
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection
          title="🧖 Profil"
          action={
            <Link href="/studio/profile" className="text-orange-700 hover:underline">
              Edytuj →
            </Link>
          }
        >
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-2xl">🧖</div>
            )}
            <div className="min-w-0">
              <p className="font-bold">{profile.name}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {profile.level && <span className="mr-2 capitalize">{profile.level}</span>}
                {MASTER_STATUS_LABELS[profile.status] ?? profile.status}
              </p>
              <Link href={`/masters/${profile.id}`} className="mt-0.5 inline-block text-sm text-orange-700 hover:underline">
                Zobacz profil publiczny →
              </Link>
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          title="🤝 Afiliacje"
          action={
            <Link href="/studio/affiliations" className="text-orange-700 hover:underline">
              Zarządzaj →
            </Link>
          }
        >
          {active.length === 0 && ownRequests.length === 0 && invitations.length === 0 ? (
            <WorkspaceEmptyState
              icon="🤝"
              title="Brak afiliacji z obiektami"
              description="Afiliacja to stała relacja z sauną — w przyszłości pozwoli publikować tam Twoje seanse."
              actionHref="/studio/affiliations"
              actionLabel="Poproś o afiliację"
            />
          ) : (
            <div className="space-y-2 text-sm">
              {primary && (
                <p className="rounded-xl bg-orange-50 px-4 py-2.5 font-semibold text-orange-800">
                  ⭐ Główna: {primary.saunaName}
                  {primary.saunaCity && <span className="font-normal text-orange-600"> · {primary.saunaCity}</span>}
                </p>
              )}
              <p className="rounded-xl bg-gray-50 px-4 py-2.5 text-gray-700">
                Aktywne: <span className="font-semibold">{active.length}</span>
                {ownRequests.length > 0 && (
                  <span className="ml-3">Twoje zgłoszenia: <span className="font-semibold">{ownRequests.length}</span></span>
                )}
                {invitations.length > 0 && (
                  <span className="ml-3">Zaproszenia do rozstrzygnięcia: <span className="font-semibold">{invitations.length}</span></span>
                )}
              </p>
              {!primary && active.length > 0 && (
                <p className="text-xs text-gray-400">
                  Wskazówka: oznacz jedną z aktywnych afiliacji jako główną.
                </p>
              )}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="⚡ Szybkie akcje">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/studio/affiliations"
              className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
            >
              🤝 Poproś o afiliację
            </Link>
            <Link
              href={`/masters/${profile.id}`}
              className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
            >
              🧖 Profil publiczny
            </Link>
            <Link
              href="/studio/profile"
              className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
            >
              ✏️ Edytuj profil
            </Link>
          </div>
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
