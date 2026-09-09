import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import WorkspaceEmptyState from '@/components/workspace/WorkspaceEmptyState'
import {
  PERSONAL_NAV,
  PERSONAL_WORKSPACE_LABEL,
  personalBreadcrumbs,
} from '@/lib/workspace/personal'

const KNOWN_ROLES = ['user', 'moderator', 'admin'] as const

export default async function PersonalSettingsPage() {
  const t = await getTranslations('profile')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getCurrentUserRole()
  const roleKey = KNOWN_ROLES.includes(role as (typeof KNOWN_ROLES)[number])
    ? (role as (typeof KNOWN_ROLES)[number])
    : null

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle={t('settings.subtitle')}
      breadcrumbs={personalBreadcrumbs(t('settings.breadcrumb'))}
      nav={PERSONAL_NAV}
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title={t('settings.accountSection')}>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-gray-500">{t('settings.email')}</span>{' '}
              <span>{user.email}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">{t('settings.role')}</span>{' '}
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                role === 'admin'
                  ? 'bg-red-100 text-red-700'
                  : role === 'moderator'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {roleKey ? t(`settings.roles.${roleKey}`) : role}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-500">{t('settings.createdAt')}</span>{' '}
              <span>{new Date(user.created_at).toLocaleDateString('pl-PL')}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">{t('settings.id')}</span>{' '}
              <span className="font-mono text-xs text-gray-400">{user.id}</span>
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title={t('settings.passwordSection')}>
          <ChangePasswordForm />
        </WorkspaceSection>

        <WorkspaceSection title={t('settings.notificationsSection')}>
          <WorkspaceEmptyState
            icon="🔔"
            title={t('settings.notificationsEmptyTitle')}
            description={t('settings.notificationsEmptyDescription')}
          />
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
