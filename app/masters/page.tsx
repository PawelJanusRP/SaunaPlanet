import Link from 'next/link'
import Navbar from '@/components/Navbar'
import AddMasterModal from '@/components/AddMasterModal'
import BecomeMasterForm from '@/components/BecomeMasterForm'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

type Sauna = { id: string; name: string }

type Master = {
  id: string
  name: string
  avatar_url: string | null
  bio: string | null
  rating: number | null
  status: string
  home_sauna_id: string | null
  saunas: Sauna | null
}

// Non-approved profiles reach this page only for moderation (query filter +
// RLS keep them away from the public); the chip keeps them distinguishable.
const statusBadge: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Oczekuje',  className: 'bg-yellow-100 text-yellow-700' },
  rejected: { label: 'Odrzucony', className: 'bg-red-100 text-red-700' },
}

export default async function MastersPage() {
  const supabase = await createClient()
  const role = await getCurrentUserRole()
  const { data: { user } } = await supabase.auth.getUser()

  const isAdmin = role === 'admin' || role === 'moderator'
  const isLoggedIn = !!user

  // Public directory shows approved profiles only (PLATFORM_WORKSPACES §5:
  // pending/rejected are visible to self and moderation, never publicly).
  // RLS enforces the same boundary; the filter keeps the page correct for
  // moderators too, who can read every row.
  const mastersQuery = supabase
    .from('sauna_masters')
    .select('id, name, avatar_url, bio, rating, status, home_sauna_id, saunas:home_sauna_id(id, name)')
    .order('name')

  const [{ data: mastersRaw }, { data: saunasRaw }] = await Promise.all([
    isAdmin ? mastersQuery : mastersQuery.eq('status', 'approved'),
    isAdmin
      ? supabase.from('saunas').select('id, name').order('name')
      : Promise.resolve({ data: [] }),
  ])

  const masters = (mastersRaw ?? []) as unknown as Master[]
  const allSaunas = (saunasRaw ?? []) as Sauna[]

  const groups: Record<string, { sauna: Sauna; masters: Master[] }> = {}
  const unassigned: Master[] = []

  for (const master of masters) {
    const sauna = master.saunas
    if (sauna?.id) {
      if (!groups[sauna.id]) groups[sauna.id] = { sauna, masters: [] }
      groups[sauna.id].masters.push(master)
    } else {
      unassigned.push(master)
    }
  }

  const sortedGroups = Object.values(groups).sort((a, b) =>
    a.sauna.name.localeCompare(b.sauna.name, 'pl')
  )

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl p-4">
        <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2">
          ← Powrót do mapy
        </Link>

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">🧖 Saunamistrzowie</h1>
          {isAdmin && <AddMasterModal saunas={allSaunas} />}
        </div>

        {!isAdmin && isLoggedIn && <BecomeMasterForm />}

        {masters.length === 0 ? (
          <div className="rounded-xl border p-6 text-gray-500">Brak saunamistrzów</div>
        ) : (
          <div className="space-y-8">
            {sortedGroups.map(({ sauna, masters: groupMasters }) => (
              <section key={sauna.id}>
                <Link
                  href={`/sauna/${sauna.id}`}
                  className="mb-3 inline-block text-xl font-bold text-orange-700 hover:underline"
                >
                  🏠 {sauna.name}
                </Link>
                <div className="grid gap-4 md:grid-cols-2">
                  {groupMasters.map((master) => (
                    <MasterCard key={master.id} master={master} />
                  ))}
                </div>
              </section>
            ))}

            {unassigned.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-bold text-gray-500">Bez przypisanej sauny</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {unassigned.map((master) => (
                    <MasterCard key={master.id} master={master} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}

function MasterCard({ master }: { master: Master }) {
  return (
    <Link
      href={`/masters/${master.id}`}
      className="rounded-2xl border bg-white p-4 shadow-sm hover:bg-orange-50"
    >
      <div className="flex items-center gap-3">
        {master.avatar_url ? (
          <img
            src={master.avatar_url}
            alt={master.name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl">
            🧖
          </div>
        )}
        <div>
          <div className="font-bold">
            {master.name}
            {master.status !== 'approved' && (
              <span
                className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${
                  statusBadge[master.status]?.className ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {statusBadge[master.status]?.label ?? master.status}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500">⭐ {Number(master.rating ?? 0).toFixed(1)}</div>
        </div>
      </div>
      {master.bio && <p className="mt-3 text-sm text-gray-600">{master.bio}</p>}
    </Link>
  )
}
