import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import type { PublicationStatus } from '@/lib/master/publicationTransitions'
import {
  PUBLICATION_STATUS_LABELS_PL,
  resolveMissingHardFields,
} from '@/lib/master/publicationView'

// SP-039 Slice 4C2-App — moderator publication queue. Read-only list over
// the RLS-visible master_publication rows (moderator arm). Rows show only
// operationally necessary data: no claim tokens, no invitation history, no
// owner UUIDs (owner presence is reduced to a boolean).

const FILTERS: { id: string; label: string }[] = [
  { id: 'submitted', label: 'Zgłoszone' },
  { id: 'changes_requested', label: 'Poproszono o zmiany' },
  { id: 'published', label: 'Opublikowane' },
  { id: 'legacy_published', label: 'Opublikowane (legacy)' },
  { id: 'suspended', label: 'Zawieszone' },
  { id: 'draft', label: 'Robocze' },
  { id: 'all', label: 'Wszystkie' },
]

function toFilter(raw: string | undefined): string {
  return FILTERS.some((f) => f.id === raw) ? (raw as string) : 'submitted'
}

type QueueRow = {
  master_id: string
  publication_status: string
  submitted_at: string | null
  published_at: string | null
  publication_reviewed_at: string | null
  sauna_masters: {
    id: string
    name: string
    city: string | null
    bio: string | null
    avatar_url: string | null
    specialties: string[] | null
    status: string
    user_id: string | null
    slug: string | null
  } | null
}

export default async function PublicationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') redirect('/')

  const { filter: rawFilter } = await searchParams
  const filter = toFilter(rawFilter)

  let query = supabase
    .from('master_publication')
    .select(
      'master_id, publication_status, submitted_at, published_at, publication_reviewed_at, ' +
        'sauna_masters:master_id(id, name, city, bio, avatar_url, specialties, status, user_id, slug)'
    )
    .order('submitted_at', { ascending: true, nullsFirst: false })
  if (filter !== 'all') {
    query = query.eq('publication_status', filter)
  }
  const { data: rowsRaw } = await query

  const rows = ((rowsRaw ?? []) as unknown as QueueRow[]).filter(
    (r) => r.sauna_masters !== null
  )

  return (
    <main className="mx-auto max-w-5xl p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="rounded-xl border px-4 py-2 text-sm">
          ← Panel admina
        </Link>
        <h1 className="text-xl font-bold">📣 Publikacje saunamistrzów</h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/admin/masters/publication?filter=${f.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id
                ? 'border-black bg-black text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">
          Brak profili w tym stanie publikacji.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const m = row.sauna_masters!
            const missing = resolveMissingHardFields({
              name: m.name,
              city: m.city,
              bio: m.bio,
              avatarUrl: m.avatar_url,
              specialties: m.specialties,
            })
            const statusLabel =
              PUBLICATION_STATUS_LABELS_PL[
                row.publication_status as PublicationStatus
              ] ?? row.publication_status
            return (
              <div
                key={row.master_id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4"
              >
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar_url}
                    alt={m.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-xl">
                    🧖
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {m.name}
                    {m.city && (
                      <span className="ml-2 font-normal text-gray-400">· {m.city}</span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    <span>{statusLabel}</span>
                    <span>profil: {m.status}</span>
                    <span>{m.user_id !== null ? 'ma właściciela' : 'bez właściciela'}</span>
                    <span>
                      {missing.length === 0
                        ? 'kompletny'
                        : `braki: ${missing.length}`}
                    </span>
                    {row.submitted_at && (
                      <span>
                        zgłoszono: {new Date(row.submitted_at).toLocaleDateString('pl-PL')}
                      </span>
                    )}
                    {row.publication_reviewed_at && (
                      <span>
                        przegląd: {new Date(row.publication_reviewed_at).toLocaleDateString('pl-PL')}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/masters/${m.slug ?? m.id}`}
                    className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    👁️ Podgląd
                  </Link>
                  <Link
                    href={`/admin/masters/publication/${m.id}`}
                    className="rounded-xl bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Recenzja →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
