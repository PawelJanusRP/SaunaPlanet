import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import StudioAccessNotice from '@/components/studio/StudioAccessNotice'
import MasterProfileForm from '@/components/studio/MasterProfileForm'
import UploadAvatarButton from '@/components/UploadAvatarButton'
import {
  MASTER_NAV,
  MASTER_STATUS_LABELS,
  MASTER_STUDIO_LABEL,
  masterBreadcrumbs,
} from '@/lib/workspace/master'
import { loadMasterStudioScope } from '@/lib/workspace/masterServer'

export default async function StudioProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { profile } = await loadMasterStudioScope(supabase, user.id)

  if (!profile) return <StudioAccessNotice kind="none" />
  if (profile.status !== 'approved') {
    return <StudioAccessNotice kind={profile.status === 'pending' ? 'pending' : 'rejected'} masterId={profile.id} />
  }

  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle="Twój publiczny profil saunamistrza"
      contextLabel={profile.name}
      breadcrumbs={masterBreadcrumbs('Profil')}
      nav={MASTER_NAV}
      activeNavKey="profile"
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title="📷 Avatar">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-3xl">🧖</div>
            )}
            <UploadAvatarButton masterId={profile.id} currentAvatarUrl={profile.avatarUrl} />
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="✏️ Dane profilu">
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {profile.level && (
              <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold capitalize text-gray-600">
                Poziom: {profile.level}
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-600">
              {MASTER_STATUS_LABELS[profile.status] ?? profile.status}
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-400">
            Poziom i status zmienia moderacja (poziom wynika z certyfikacji) — edytujesz imię,
            nazwisko i opis.
          </p>
          <MasterProfileForm initialName={profile.name} initialBio={profile.bio} />
        </WorkspaceSection>

        <WorkspaceSection title="🌍 Profil publiczny">
          <p className="text-sm text-gray-600">
            Tak widzą Cię użytkownicy:{' '}
            <Link href={`/masters/${profile.id}`} className="font-semibold text-orange-700 hover:underline">
              /masters/{profile.id.substring(0, 8)}… →
            </Link>
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Certyfikaty dodasz na stronie profilu publicznego (każdy przechodzi moderację).
          </p>
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
