import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SubmitSaunaForm from '@/components/SubmitSaunaForm'

const statusLabel: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Czeka na moderację', className: 'bg-yellow-100 text-yellow-700' },
  active:   { label: 'Zatwierdzona',       className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Odrzucona',          className: 'bg-red-100 text-red-700' },
}

export default async function SubmitPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Own submissions (SP-036): RLS shows the caller their own rows in every
  // status; active rows of others are public anyway, so filter to created_by.
  // Approved-master check (SP-037B rule A): unlocks the bundled-event
  // section — the server action independently re-verifies.
  const [{ data: ownSubmissions }, { data: ownMaster }] = await Promise.all([
    supabase
      .from('saunas')
      .select('id, name, city, status, created_at')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('sauna_masters')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .maybeSingle(),
  ])

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-2 text-2xl font-bold">Zgłoś saunę</h1>
      <p className="mb-6 text-sm text-gray-500">
        Wypełnij formularz. Zgłoszenie trafi do moderacji i po zatwierdzeniu pojawi się na mapie.
      </p>
      <SubmitSaunaForm isMaster={ownMaster !== null} />

      {ownSubmissions && ownSubmissions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Twoje zgłoszenia</h2>
          <div className="space-y-2">
            {ownSubmissions.map((s) => {
              const st = statusLabel[s.status] ?? statusLabel.pending
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0">
                    {s.status === 'active' ? (
                      <Link href={`/sauna/${s.id}`} className="font-semibold hover:underline">
                        {s.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{s.name}</span>
                    )}
                    {s.city && <span className="ml-2 text-sm text-gray-500">{s.city}</span>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>
                    {st.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
