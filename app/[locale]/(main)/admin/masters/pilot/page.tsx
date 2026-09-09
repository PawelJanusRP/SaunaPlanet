import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { listClaimInvitations } from '@/app/[locale]/(main)/admin/claimActions'
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

const MASTER_STATUS_CLASSNAMES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
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

  const t = await getTranslations('admin.pilotList')
  const td = await getTranslations('admin.pilotDetail')
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
        {t('back')}
      </Link>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link
          href="/admin/masters/pilot/new"
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          {t('prepareProfile')}
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        {t('intro')}
      </p>

      {invitationsUnavailable && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {t('invitationsUnavailable')}
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
            {t('filterCount', { label: PILOT_FILTER_LABELS_PL[f], count: countFor(f) })}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">
          {rows.length === 0
            ? t('emptyNoProfiles')
            : t('emptyInFilter')}
        </div>
      ) : (
        <section className="space-y-3">
          {visible.map((r) => {
            const st = MASTER_STATUS_CLASSNAMES[r.status]
              ? { label: td(`masterStatus.${r.status}`), className: MASTER_STATUS_CLASSNAMES[r.status] }
              : { label: r.status, className: 'bg-gray-100 text-gray-500' }
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
                        {r.city ?? t('noCity')} · {t('profilePrepared')}
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
                  <span>{r.claimed ? t('claimed') : t('notClaimed')}</span>
                  <span>
                    {t('invitationLabel')}{' '}
                    {r.latest
                      ? INVITATION_STATUS_LABELS_PL[r.latest.status]
                      : t('invitationNone')}
                    {r.readiness.invitationExpired && t('invitationExpired')}
                  </span>
                  {expiry && <span>{t('validUntil', { date: expiry })}</span>}
                  {r.readiness.readiness === 'incomplete' &&
                    r.readiness.missingRequired.length > 0 && (
                      <span className="text-yellow-700">
                        {t('missing')}{' '}
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
