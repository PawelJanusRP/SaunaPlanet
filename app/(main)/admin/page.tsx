import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getCurrentUserRole()

  if (role !== 'admin' && role !== 'moderator') {
    redirect('/')
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, created_at')
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto max-w-4xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
        ← Powrót do mapy
      </Link>

      <h1 className="mb-6 text-2xl font-bold">Panel administracyjny</h1>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold">Użytkownicy ({profiles?.length ?? 0})</h2>

        {!profiles || profiles.length === 0 ? (
          <p className="text-sm text-gray-500">Brak użytkowników.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4 font-medium">ID</th>
                  <th className="pb-2 pr-4 font-medium">Rola</th>
                  <th className="pb-2 font-medium">Data rejestracji</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-400">
                      {p.id.substring(0, 8)}…
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.role === 'admin'
                          ? 'bg-red-100 text-red-700'
                          : p.role === 'moderator'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.role}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500">
                      {new Date(p.created_at).toLocaleDateString('pl-PL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-4 rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
        Kolejne sekcje panelu admina — SP-013
      </div>
    </main>
  )
}
