import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

const roleLabels: Record<string, string> = {
  user: 'Użytkownik',
  moderator: 'Moderator',
  admin: 'Administrator',
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getCurrentUserRole()

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
        ← Powrót do mapy
      </Link>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">Mój profil</h1>

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
      </section>
    </main>
  )
}
