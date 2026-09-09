import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import StudioAccessNotice from '@/components/studio/StudioAccessNotice'
import MasterProfileForm from '@/components/studio/MasterProfileForm'
import UploadAvatarButton, { UploadMasterImageButton } from '@/components/UploadAvatarButton'
import {
  MASTER_NAV,
  MASTER_STUDIO_LABEL,
  masterBreadcrumbs,
} from '@/lib/workspace/master'
import { loadMasterStudioScope } from '@/lib/workspace/masterServer'
import { resolveStudioGate } from '@/lib/master/studioAccess'
import {
  effectivePublicationStatus,
  needsMaterialEditWarning,
} from '@/lib/master/publicationView'
import { loadPublicationState } from '@/lib/master/publicationServer'

export default async function StudioProfilePage() {
  const t = await getTranslations('studio')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { profile } = await loadMasterStudioScope(supabase, user.id)

  // 4C2: pending owners edit too — only rejected/none keep the notice.
  if (!profile) return <StudioAccessNotice kind="none" />
  const gate = resolveStudioGate(profile.status)
  if (gate.kind !== 'workspace') {
    return <StudioAccessNotice kind="rejected" masterId={profile.id} />
  }

  const publication = await loadPublicationState(supabase, profile.id)
  const demotionWarning = needsMaterialEditWarning(
    effectivePublicationStatus(publication?.publicationStatus ?? null)
  )

  // SP-044: the owner edits their REAL identity (RLS-restricted private table)
  // plus pseudonym/privacy. profile.name is only the effective PUBLIC name.
  const [{ data: identity }, { data: privacyRow }] = await Promise.all([
    supabase.from('master_private_identity').select('full_name').eq('master_id', profile.id).maybeSingle(),
    supabase.from('sauna_masters').select('nickname, show_nickname_only').eq('id', profile.id).maybeSingle(),
  ])
  const fullName = (identity as { full_name?: string } | null)?.full_name ?? profile.name
  const nickname = (privacyRow as { nickname?: string | null } | null)?.nickname ?? null
  const showNicknameOnly = (privacyRow as { show_nickname_only?: boolean } | null)?.show_nickname_only ?? false

  return (
    <WorkspaceShell
      title={MASTER_STUDIO_LABEL}
      subtitle={t('profile.subtitle')}
      contextLabel={profile.name}
      breadcrumbs={masterBreadcrumbs(t('profile.breadcrumb'))}
      nav={MASTER_NAV}
      activeNavKey="profile"
    >
      <div className="space-y-4 sm:space-y-6">
        {demotionWarning && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t('profile.publicVisibleWarningTitle')}</p>
            <p className="mt-1">
              {t('profile.publicVisibleWarningBody')}
            </p>
          </div>
        )}
        <WorkspaceSection title={t('profile.photosTitle')}>
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-3xl">🧖</div>
            )}
            <UploadAvatarButton masterId={profile.id} currentAvatarUrl={profile.avatarUrl} />
          </div>
          <div className="mt-4">
            {profile.coverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.coverImageUrl}
                alt={t('profile.coverAlt')}
                className="mb-2 h-28 w-full rounded-xl object-cover"
              />
            )}
            <UploadMasterImageButton
              masterId={profile.id}
              kind="cover"
              currentUrl={profile.coverImageUrl}
            />
          </div>
        </WorkspaceSection>

        <WorkspaceSection title={t('profile.dataTitle')}>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {profile.level && (
              <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold capitalize text-gray-600">
                {t('profile.level', { level: profile.level })}
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-600">
              {t.has(`status.master.${profile.status}`) ? t(`status.master.${profile.status}`) : profile.status}
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-400">
            {t('profile.levelStatusHint')}
          </p>
          <MasterProfileForm
            demotionWarning={demotionWarning}
            initial={{
              fullName,
              nickname,
              showNicknameOnly,
              bio: profile.bio,
              slug: profile.slug,
              city: profile.city,
              specialties: profile.specialties,
              languages: profile.languages,
              experienceSinceYear: profile.experienceSinceYear,
              socialLinks: profile.socialLinks,
              website: profile.website,
            }}
          />
        </WorkspaceSection>

        <WorkspaceSection title={t('profile.publicProfileTitle')}>
          <p className="text-sm text-gray-600">
            {t('profile.publicProfileHowUsersSee')}{' '}
            <Link
              href={`/masters/${profile.slug ?? profile.id}`}
              className="font-semibold text-orange-700 hover:underline"
            >
              /masters/{profile.slug ?? `${profile.id.substring(0, 8)}…`} →
            </Link>
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {t('profile.certificatesHint')}
          </p>
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
