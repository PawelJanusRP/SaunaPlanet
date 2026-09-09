import { redirect } from 'next/navigation'
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

const roleLabels: Record<string, string> = {
  user: 'Użytkownik',
  moderator: 'Moderator',
  admin: 'Administrator',
}

export default async function PersonalSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getCurrentUserRole()

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle="Ustawienia konta"
      breadcrumbs={personalBreadcrumbs('Ustawienia')}
      nav={PERSONAL_NAV}
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title="Dane konta">
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-gray-500">Email:</span>{' '}
              <span>{user.email}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Rola:</span>{' '}
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                role === 'admin'
                  ? 'bg-red-100 text-red-700'
                  : role === 'moderator'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {roleLabels[role ?? 'user'] ?? role}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Konto utworzone:</span>{' '}
              <span>{new Date(user.created_at).toLocaleDateString('pl-PL')}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">ID:</span>{' '}
              <span className="font-mono text-xs text-gray-400">{user.id}</span>
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Hasło">
          <ChangePasswordForm />
        </WorkspaceSection>

        <WorkspaceSection title="Powiadomienia">
          <WorkspaceEmptyState
            icon="🔔"
            title="Ustawienia powiadomień będą dostępne wkrótce"
            description="Powiadomienia o rezerwacjach i wydarzeniach pojawią się wraz z systemem notyfikacji."
          />
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
