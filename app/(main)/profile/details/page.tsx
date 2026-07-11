import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditProfileNameForm from '@/components/EditProfileNameForm'
import WorkspaceShell from '@/components/workspace/WorkspaceShell'
import WorkspaceSection from '@/components/workspace/WorkspaceSection'
import {
  PERSONAL_NAV,
  PERSONAL_WORKSPACE_LABEL,
  personalBreadcrumbs,
} from '@/lib/workspace/personal'

/**
 * Public-identity fields planned for the personal profile. They have no
 * database columns yet, so they render as consistent "coming soon" rows —
 * never as editable inputs or fake values.
 */
const PLANNED_PROFILE_FIELDS = [
  { label: 'Awatar', hint: 'Zdjęcie profilowe widoczne przy recenzjach' },
  { label: 'Bio', hint: 'Krótki opis o Tobie' },
  { label: 'Lokalizacja', hint: 'Twoje miasto' },
  { label: 'Języki', hint: 'Języki, którymi się posługujesz' },
  { label: 'Profil publiczny', hint: 'Widoczność profilu dla innych użytkowników' },
]

export default async function PersonalDetailsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single()

  return (
    <WorkspaceShell
      title={PERSONAL_WORKSPACE_LABEL}
      subtitle="Twoja publiczna tożsamość na SaunaPlanet"
      breadcrumbs={personalBreadcrumbs('Profil')}
      nav={PERSONAL_NAV}
    >
      <div className="space-y-4 sm:space-y-6">
        <WorkspaceSection title="Imię i nazwisko">
          <p className="mb-2 text-sm text-gray-500">
            Wyświetlane przy Twoich recenzjach i komentarzach.
          </p>
          <EditProfileNameForm
            firstName={profile?.first_name ?? ''}
            lastName={profile?.last_name ?? ''}
          />
        </WorkspaceSection>

        <WorkspaceSection title="Wkrótce w Twoim profilu">
          <ul className="divide-y">
            {PLANNED_PROFILE_FIELDS.map((field) => (
              <li key={field.label} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-700">{field.label}</p>
                  <p className="text-xs text-gray-400">{field.hint}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                  Wkrótce
                </span>
              </li>
            ))}
          </ul>
        </WorkspaceSection>
      </div>
    </WorkspaceShell>
  )
}
