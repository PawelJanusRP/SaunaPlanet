import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import SubmissionActions from '@/components/SubmissionActions'
import MasterModerationActions from '@/components/MasterModerationActions'

const statusLabel: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Oczekuje',    className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Zatwierdzona', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Odrzucona',   className: 'bg-red-100 text-red-700' },
}

const roleStyle: Record<string, string> = {
  admin:     'bg-red-100 text-red-700',
  moderator: 'bg-orange-100 text-orange-700',
  user:      'bg-gray-100 text-gray-600',
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') redirect('/')

  const { tab } = await searchParams
  const activeTab = tab ?? 'submissions'

  const [{ data: profiles }, { data: submissions }, { data: pendingMasters }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, role, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('sauna_submissions')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('sauna_masters')
      .select('id, name, level, bio, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  const pending = submissions?.filter((s) => s.status === 'pending') ?? []
  const pendingMasterCount = pendingMasters?.length ?? 0

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
        ← Powrót do mapy
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel administracyjny</h1>
        {(pending.length > 0 || pendingMasterCount > 0) && (
          <span className="rounded-full bg-yellow-500 px-2.5 py-0.5 text-sm font-bold text-white">
            {pending.length + pendingMasterCount} oczekuje
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b">
        {[
          { id: 'submissions', label: `Zgłoszenia (${submissions?.length ?? 0})` },
          { id: 'masters', label: `Saunamistrzowie${pendingMasterCount > 0 ? ` (${pendingMasterCount})` : ''}` },
          { id: 'users', label: `Użytkownicy (${profiles?.length ?? 0})` },
        ].map(({ id, label }) => (
          <Link
            key={id}
            href={`/admin?tab=${id}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === id
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Submissions tab */}
      {activeTab === 'submissions' && (
        <section className="space-y-4">
          {!submissions || submissions.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">
              Brak zgłoszeń.
            </div>
          ) : (
            submissions.map((s) => {
              const st = statusLabel[s.status] ?? statusLabel.pending
              return (
                <div key={s.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-bold">{s.name}</div>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {s.city && <span>{s.city} · </span>}
                        <span>{s.category}</span>
                        {s.website && (
                          <span> · <a href={s.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{s.website}</a></span>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>
                      {st.label}
                    </span>
                  </div>

                  {s.description && (
                    <p className="mb-3 text-sm text-gray-600">{s.description}</p>
                  )}

                  {s.latitude && s.longitude && (
                    <p className="mb-3 text-xs text-gray-400">
                      📍 {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}
                    </p>
                  )}

                  {s.admin_note && (
                    <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                      Notatka: {s.admin_note}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{new Date(s.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    {s.status === 'pending' && <SubmissionActions submissionId={s.id} />}
                  </div>
                </div>
              )
            })
          )}
        </section>
      )}

      {/* Masters tab */}
      {activeTab === 'masters' && (
        <section className="space-y-4">
          {!pendingMasters || pendingMasters.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">
              Brak oczekujących zgłoszeń saunamistrzów.
            </div>
          ) : (
            pendingMasters.map((m) => (
              <div key={m.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-bold">{m.name}</div>
                    {m.level && (
                      <div className="mt-0.5 text-sm text-gray-500">Poziom: {m.level}</div>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
                    Oczekuje
                  </span>
                </div>

                {m.bio && (
                  <p className="mb-3 text-sm text-gray-600">{m.bio}</p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{new Date(m.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <MasterModerationActions masterId={m.id} />
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
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
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${roleStyle[p.role] ?? roleStyle.user}`}>
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
      )}
    </main>
  )
}
