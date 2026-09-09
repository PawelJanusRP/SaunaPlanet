import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { getTranslations, getFormatter } from 'next-intl/server'
import type { useFormatter } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { getClaimInvitation, listClaimInvitations } from '@/app/[locale]/(main)/admin/claimActions'
import InvitationControls from '@/components/admin/InvitationControls'
import PilotProfileForm from '@/components/admin/PilotProfileForm'
import UploadAvatarButton from '@/components/UploadAvatarButton'
import { evaluateInvitationActions } from '@/lib/claim/invitationControls'
import { isUuid } from '@/lib/master/slug'
import {
  evaluatePilotReadiness,
  evaluatePreparedProfileEditability,
  pickLatestInvitation,
  PILOT_READINESS_META,
  PILOT_REQUIRED_FIELDS,
  toPilotInvitationSummaries,
  type PilotInvitationSummary,
} from '@/lib/claim/pilot'

// SP-039 Slice 3B2/3B3 — prepared-profile detail & editor (moderator only).
// 3B3 adds the invitation controls (generate / one-time link / mark-sent /
// revoke / regenerate) wired to the M4 RPC wrappers; the action-availability
// matrix is computed server-side and the database stays authoritative.

const MASTER_STATUS_CLASSNAMES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const EVENT_TYPE_KEYS = new Set([
  'profile_prepared',
  'invitation_created',
  'invitation_sent',
  'invitation_revoked',
  'invitation_regenerated',
  'invitation_expired',
])

function formatDateTimePl(
  format: ReturnType<typeof useFormatter>,
  iso: string | null,
): string | null {
  if (!iso) return null
  return format.dateTime(new Date(iso), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type PreparedMasterDetailRow = {
  id: string
  name: string
  bio: string | null
  slug: string | null
  city: string | null
  specialties: string[] | null
  languages: string[] | null
  experience_since_year: number | null
  social_links: Record<string, string> | null
  website: string | null
  avatar_url: string | null
  status: string
  user_id: string | null
  origin: string
  created_at: string
}

type ClaimHistoryEvent = {
  event_type?: string
  reason?: string | null
  delivery_channel?: string | null
  created_at?: string | null
}

export default async function PilotProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') redirect('/')

  const t = await getTranslations('admin.pilotDetail')
  const tc = await getTranslations('common')
  const tp = await getTranslations('admin')
  const format = await getFormatter()

  const { id } = await params
  if (!isUuid(id)) notFound()

  const { data: masterRaw } = await supabase
    .from('sauna_masters')
    .select(
      'id, name, bio, slug, city, specialties, languages, experience_since_year, ' +
        'social_links, website, avatar_url, status, user_id, origin, created_at'
    )
    .eq('id', id)
    .maybeSingle()

  const master = masterRaw as PreparedMasterDetailRow | null
  // The pilot editor covers ONLY admin-prepared profiles; self-registered
  // profiles must never be reachable (or convertible) through this route.
  if (!master || master.origin !== 'admin_prepared') notFound()

  const invitationsResult = await listClaimInvitations()
  const invitations = toPilotInvitationSummaries(
    invitationsResult.ok ? invitationsResult.data : []
  ).filter((i) => i.masterId === master.id)
  const latest: PilotInvitationSummary | null = pickLatestInvitation(invitations)

  // Read-only audit history for the latest invitation (M4 get projection).
  let history: ClaimHistoryEvent[] = []
  if (latest) {
    const detail = await getClaimInvitation(latest.invitationId)
    if (detail.ok && typeof detail.data === 'object' && detail.data !== null) {
      const events = (detail.data as { events?: unknown }).events
      if (Array.isArray(events)) history = events as ClaimHistoryEvent[]
    }
  }

  const profileState = {
    userId: master.user_id,
    origin: master.origin,
    status: master.status,
    name: master.name,
    city: master.city,
    bio: master.bio,
  }
  const readiness = evaluatePilotReadiness(profileState, latest)
  const availability = evaluateInvitationActions(profileState, latest)
  const readinessMeta = PILOT_READINESS_META[readiness.readiness]
  const readinessLabel = tp.has(`pilot.readiness.${readiness.readiness}`)
    ? tp(`pilot.readiness.${readiness.readiness}`)
    : readiness.readiness
  const claimed = master.user_id !== null

  const editable = evaluatePreparedProfileEditability({
    exists: true,
    userId: master.user_id,
    origin: master.origin,
    status: master.status,
  })

  const st = MASTER_STATUS_CLASSNAMES[master.status]
    ? { label: t(`masterStatus.${master.status}`), className: MASTER_STATUS_CLASSNAMES[master.status] }
    : { label: master.status, className: 'bg-gray-100 text-gray-500' }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <Link
        href="/admin/masters/pilot"
        className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm"
      >
        {t('back')}
      </Link>

      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">{t('stateHeading')}</h2>
        <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {master.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
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
            <h1 className="text-2xl font-bold">{master.name}</h1>
            <p className="text-sm text-gray-500">
              {master.city ?? t('noCity')} ·{' '}
              {claimed ? t('claimed') : t('notClaimed')}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${readinessMeta.className}`}>
            {readinessLabel}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>
            {st.label}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
            {t('adminPrepared')}
          </span>
        </div>
        </div>
      </section>

      <div className="mb-4 rounded-xl bg-orange-50 px-3 py-2.5 text-sm text-orange-700">
        <p className="font-semibold">{t('claimFlowTitle')}</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>{t('claimFlow1')}</li>
          <li>{t('claimFlow2')}</li>
          <li>{t('claimFlow3')}</li>
          <li>{t('claimFlow4')}</li>
          <li>{t('claimFlow5')}</li>
        </ol>
        <p className="mt-1.5 text-xs text-orange-600">
          {t('originImmutable')}
        </p>
      </div>

      {/* Readiness checklist */}
      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">{t('readinessHeading')}</h2>
        <ul className="space-y-1 text-sm">
          {PILOT_REQUIRED_FIELDS.map((key) => {
            const missing = readiness.missingRequired.includes(key)
            return (
              <li key={key} className={missing ? 'text-yellow-700' : 'text-green-700'}>
                {missing ? '○' : '✓'} {tp.has(`pilot.requiredFields.${key}`) ? tp(`pilot.requiredFields.${key}`) : key}
                {missing && t('readinessMissingSuffix')}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-gray-400">
          {t('readinessNote')}
        </p>
      </section>

      {/* Invitation state — read-only summary */}
      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">{t('invitationHeading')}</h2>
        {!latest ? (
          <p className="text-sm text-gray-500">
            {t('invitationNone')}
            {invitationsResult.ok ? '' : t('invitationFetchFailed')}
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              {t('invitationStatus')}{' '}
              <span className="font-semibold">
                {tp.has(`pilot.invitationStatus.${latest.status}`)
                  ? tp(`pilot.invitationStatus.${latest.status}`)
                  : latest.status}
                {readiness.invitationExpired && t('invitationExpiredSuffix')}
              </span>
            </p>
            {latest.expiresAt && <p>{t('invitationValidUntil', { date: formatDateTimePl(format, latest.expiresAt) ?? '' })}</p>}
            {latest.sentAt && (
              <p>
                {t('invitationSent', { date: formatDateTimePl(format, latest.sentAt) ?? '' })}
                {latest.deliveryChannel && t('invitationChannel', { channel: latest.deliveryChannel })}
                {latest.deliveryTargetHint && t('invitationRecipient', { hint: latest.deliveryTargetHint })}
              </p>
            )}
            {latest.revokedAt && <p>{t('invitationRevoked', { date: formatDateTimePl(format, latest.revokedAt) ?? '' })}</p>}
            {latest.tokenPrefix && (
              <p className="text-xs text-gray-400">
                {t('diagnosticPrefixLabel')} <code>{latest.tokenPrefix}</code>{t('diagnosticPrefixSuffix')}
              </p>
            )}
            {invitations.length > 1 && (
              <p className="text-xs text-gray-400">
                {t('earlierInvitations', { count: invitations.length - 1 })}
              </p>
            )}
          </div>
        )}

      </section>

      {/* Invitation controls + one-time link (client; secret in React state only) */}
      <InvitationControls
        masterId={master.id}
        availability={availability}
        latestInvitationId={latest?.invitationId ?? null}
      />

      {history.length > 0 && (
        <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">{t('historyHeading')}</h2>
          <ul className="space-y-1 text-xs text-gray-500">
            {history.map((e, i) => (
              <li key={i}>
                {formatDateTimePl(format, e.created_at ?? null) ?? '—'} ·{' '}
                {e.event_type && EVENT_TYPE_KEYS.has(e.event_type) ? t(`eventType.${e.event_type}`) : e.event_type}
                {e.delivery_channel && ` (${e.delivery_channel})`}
                {e.reason && ` — ${e.reason}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Profile editor / read-only view */}
      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">{t('profileDataHeading')}</h2>
        {editable.ok ? (
          <>
            <div className="mb-4 flex items-center gap-4">
              <UploadAvatarButton masterId={master.id} currentAvatarUrl={master.avatar_url} />
            </div>
            <PilotProfileForm
              masterId={master.id}
              initial={{
                name: master.name,
                bio: master.bio,
                slug: master.slug,
                city: master.city,
                specialties: master.specialties,
                languages: master.languages,
                experienceSinceYear: master.experience_since_year,
                socialLinks: master.social_links,
                website: master.website,
              }}
            />
          </>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-gray-500">
              {claimed
                ? t('editBlockedClaimed')
                : t('editBlockedOther')}
            </p>
            {master.bio && <p>{master.bio}</p>}
            {master.specialties && master.specialties.length > 0 && (
              <p>{t('specialties', { value: master.specialties.map((s: string) => tc.has(`specialties.${s}`) ? tc(`specialties.${s}`) : s).join(', ') })}</p>
            )}
            {master.languages && master.languages.length > 0 && (
              <p>{t('languages', { value: master.languages.map((l: string) => tc.has(`languages.${l}`) ? tc(`languages.${l}`) : l).join(', ') })}</p>
            )}
            {master.website && <p>{t('website', { value: master.website })}</p>}
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-gray-400">
        {t('created', { date: formatDateTimePl(format, master.created_at) ?? '' })}
        {master.slug && (
          <>
            {t('profileAddress')}<code>/masters/{master.slug}</code>
          </>
        )}
      </p>
    </main>
  )
}
