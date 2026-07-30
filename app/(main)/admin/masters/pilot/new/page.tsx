import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import PilotProfileForm from '@/components/admin/PilotProfileForm'

// SP-039 Slice 3B2 — create an admin-prepared pilot profile (moderator only).

export default async function PilotNewProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') redirect('/')

  return (
    <main className="mx-auto max-w-3xl p-4">
      <Link
        href="/admin/masters/pilot"
        className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm"
      >
        ← Pilot saunamistrzów
      </Link>

      <h1 className="mb-2 text-2xl font-bold">Przygotuj profil saunamistrza</h1>
      <p className="mb-6 text-sm text-gray-500">
        Profil powstanie jako <span className="font-semibold">przygotowany przez
        administrację</span> (nieprzejęty, status &bdquo;Oczekuje&rdquo;). Zdjęcie
        profilowe dodasz na stronie profilu po utworzeniu. Zaproszenie do przejęcia
        wygenerujesz w kolejnym etapie pilotażu.
      </p>

      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <PilotProfileForm />
      </div>
    </main>
  )
}
