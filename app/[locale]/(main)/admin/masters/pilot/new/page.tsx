import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import PilotProfileForm from '@/components/admin/PilotProfileForm'

// SP-039 Slice 3B2 — create an admin-prepared pilot profile (moderator only).

export default async function PilotNewProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') redirect('/')

  const t = await getTranslations('admin.pilotNew')

  return (
    <main className="mx-auto max-w-3xl p-4">
      <Link
        href="/admin/masters/pilot"
        className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm"
      >
        {t('back')}
      </Link>

      <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {t('introPrefix')}<span className="font-semibold">{t('introBold')}</span>{t('introSuffix')}
      </p>

      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <PilotProfileForm />
      </div>
    </main>
  )
}
