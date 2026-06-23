import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

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
            <span className="font-medium text-gray-500">ID:</span>{' '}
            <span className="font-mono text-xs text-gray-400">{user.id}</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Konto utworzone:</span>{' '}
            <span>{new Date(user.created_at).toLocaleDateString('pl-PL')}</span>
          </div>
        </div>
      </section>
    </main>
  )
}
