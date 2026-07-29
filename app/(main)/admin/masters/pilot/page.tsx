import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { listClaimInvitations } from '@/app/(main)/admin/claimActions'
import {
  evaluatePilotReadiness,
  groupInvitationsByMaster,
  INVITATION_STATUS_LABELS_PL,
  matchesPilotFilter,
  pickLatestInvitation,
  PILOT_FILTER_LABELS_PL,
  PILOT_FILTERS,
  PILOT_READINESS_META,
  PILOT_REQUIRED_FIELD_LABELS_PL,
  toPilotFilter,
  toPilotInvitationSummaries,
  type PilotInvitationSummary,
} from '@/lib/claim/pilot'

// SP-039 Slice 3B2 — moderator pilot list. The cohort is exactly
// origin='admin_prepared' (design §10 — no cohort table, no pilot boolean);
// self-registered profiles stay in the generic /admin?tab=masters moderation
// queue and are never mixed in here. Invitation state comes exclusively from
// the approved M4 list RPC projection (token secrets never leave the database).

const MASTER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Oczekuje', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Zatwierdzony', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Odrzucony', className: 'bg-red-100 text-red-700' },
}

function formatDatePl(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

type PreparedMasterRow = {
  id: string
  name: string
  status: string
  user_id: string | null
  avatar_url: string | null
  city: string | null
  bio: string | null
  origin: string
  created_at: string
}

export default async function PilotListPage({
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
  const filter = toPilotFilter(rawFilter)

  // Deterministic ordering: newest first, id as the stable tie-breaker.
  const [{ data: mastersRaw }, invitationsResult] = await Promise.all([
    supabase
      .from('sauna_masters')
      .select('id, name, status, user_id, avatar_url, city, bio, origin, created_at')
      .eq('origin', 'admin_prepared')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }),
    listClaimInvitations(),
  ])

  const masters = (mastersRaw ?? []) as PreparedMasterRow[]
  const invitationsUnavailable = !invitationsResult.ok
  const invitationsByMaster = groupInvitationsByMaster(
    toPilotInvitationSummaries(invitationsResult.ok ? invitationsResult.data : [])
  )

  const now = new Date()
  const rows = masters.map((m) => {
    const latest: PilotInvitationSummary | null = pickLatestInvitation(
      invitationsByMaster.get(m.id) ?? []
    )
    const readiness = evaluatePilotReadiness(
      {
        userId: m.user_id,
        origin: m.origin,
        status: m.status,
        name: m.name,
        city: m.city,
        bio: m.bio,
      },
      latest,
      now
    )
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      claimed: m.user_id !== null,
      avatarUrl: m.avatar_url,
      city: m.city,
      createdAt: m.created_at,
      latest,
      readiness,
    }
  })

  const countFor = (f: (typeof PILOT_FILTERS)[number]) =>
    rows.filter((r) => matchesPilotFilter(r.readiness.readiness, f)).length
  const visible = rows.filter((r) => matchesPilotFilter(r.readiness.readiness, filter))

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link href="/admin" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
        ← Panel administracyjny
      </Link>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">🧖 Pilot saunamistrzów</h1>
        <Link
          href="/admin/masters/pilot/new"
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          ➕ Przygotuj profil
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Profile przygotowane przez administrację dla pilotażu. Generowanie i wysyłka
        zaproszeń pojawią się w kolejnym etapie — tutaj przygotowujesz profile i widzisz
        ich gotowość.
      </p>

      {invitationsUnavailable && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Nie udało się pobrać stanu zaproszeń — lista pokazuje wyłącznie dane profili.
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {PILOT_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/admin/masters/pilot' : `/admin/masters/pilot?filter=${f}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? 'border-black bg-black text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {PILOT_FILTER_LABELS_PL[f]} ({countFor(f)})
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">
          {rows.length === 0
            ? 'Brak przygotowanych profili — przygotuj pierwszego pilotażowego saunamistrza.'
            : 'Brak profili w tym filtrze.'}
        </div>
      ) : (
        <section className="space-y-3">
          {visible.map((r) => {
            const st = MASTER_STATUS_BADGE[r.status] ?? {
              label: r.status,
              className: 'bg-gray-100 text-gray-500',
            }
            const readinessMeta = PILOT_READINESS_META[r.readiness.readiness]
            const expiry = formatDatePl(r.latest?.expiresAt ?? null)
            return (
              <div key={r.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {r.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatarUrl}
                        alt={r.name}
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xl">
                        🧖
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/admin/masters/pilot/${r.id}`}
                        className="text-base font-bold hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {r.city ?? 'Brak miasta'} · profil przygotowany
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${readinessMeta.className}`}
                    >
                      {readinessMeta.label}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>
                      {st.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-gray-500">
                  <span>{r.claimed ? '🔗 Przejęty przez właściciela' : '◯ Nieprzejęty'}</span>
                  <span>
                    Zaproszenie:{' '}
                    {r.latest
                      ? INVITATION_STATUS_LABELS_PL[r.latest.status]
                      : 'brak'}
                    {r.readiness.invitationExpired && ' (po terminie)'}
                  </span>
                  {expiry && <span>Ważne do: {expiry}</span>}
                  {r.readiness.readiness === 'incomplete' &&
                    r.readiness.missingRequired.length > 0 && (
                      <span className="text-yellow-700">
                        Brakuje:{' '}
                        {r.readiness.missingRequired
                          .map((k) => PILOT_REQUIRED_FIELD_LABELS_PL[k])
                          .join(', ')}
                      </span>
                    )}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </main>
  )
}
