import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { createClient } from '@/lib/supabase/server'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import StudioAccessNotice from '@/components/studio/StudioAccessNotice'
import {
  MASTER_NAV,
  MASTER_STATUS_LABELS,
  MASTER_STUDIO_LABEL,
  masterBreadcrumbs,
} from '@/lib/workspace/master'
import { loadMasterStudioScope } from '@/lib/workspace/masterServer'

export default async function StudioSettingsPage() {
  const t = await getTranslations('studio')
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
      subtitle={t('settings.subtitle')}
      contextLabel={profile.name}
      breadcrumbs={masterBreadcrumbs(t('settings.breadcrumb'))}
      nav={MASTER_NAV}
      activeNavKey="settings"
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={t('settings.accountProfileTitle')}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
              <span className="text-gray-500">{t('settings.account')}</span>
              <span className="font-semibold text-gray-700">{user.email}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
              <span className="text-gray-500">{t('settings.profileStatus')}</span>
              <span className="font-semibold text-gray-700">
                {MASTER_STATUS_LABELS[profile.status] ?? profile.status}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {t('settings.accountSettingsHint')}{' '}
            <Link href="/profile/settings" className="font-semibold text-orange-700 hover:underline">
              {t('settings.personalProfileSettingsLink')}
            </Link>
          </p>
        </WorkspaceSection>

        <WorkspaceSection title={t('settings.notificationsTitle')}>
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
            <span className="text-gray-500">{t('settings.notificationsLabel')}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('settings.comingSoon')}</span>
          </div>
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
