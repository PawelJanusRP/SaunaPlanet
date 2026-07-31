import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { getClaimInvitation, listClaimInvitations } from '@/app/(main)/admin/claimActions'
import InvitationControls from '@/components/admin/InvitationControls'
import PilotProfileForm from '@/components/admin/PilotProfileForm'
import UploadAvatarButton from '@/components/UploadAvatarButton'
import { evaluateInvitationActions } from '@/lib/claim/invitationControls'
import { isUuid } from '@/lib/master/slug'
import { languageLabel, specialtyLabel } from '@/lib/master/specialties'
import {
  evaluatePilotReadiness,
  evaluatePreparedProfileEditability,
  INVITATION_STATUS_LABELS_PL,
  pickLatestInvitation,
  PILOT_READINESS_META,
  PILOT_REQUIRED_FIELD_LABELS_PL,
  PILOT_REQUIRED_FIELDS,
  toPilotInvitationSummaries,
  type PilotInvitationSummary,
} from '@/lib/claim/pilot'

// SP-039 Slice 3B2/3B3 — prepared-profile detail & editor (moderator only).
// 3B3 adds the invitation controls (generate / one-time link / mark-sent /
// revoke / regenerate) wired to the M4 RPC wrappers; the action-availability
// matrix is computed server-side and the database stays authoritative.

const MASTER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Oczekuje', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Zatwierdzony', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Odrzucony', className: 'bg-red-100 text-red-700' },
}

const EVENT_TYPE_LABELS_PL: Record<string, string> = {
  profile_prepared: 'Profil przygotowany',
  invitation_created: 'Zaproszenie wygenerowane',
  invitation_sent: 'Zaproszenie wysłane',
  invitation_revoked: 'Zaproszenie unieważnione',
  invitation_regenerated: 'Zaproszenie wygenerowane ponownie',
  invitation_expired: 'Zaproszenie wygasło',
}

function formatDateTimePl(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('pl-PL', {
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
  const claimed = master.user_id !== null

  const editable = evaluatePreparedProfileEditability({
    exists: true,
    userId: master.user_id,
    origin: master.origin,
    status: master.status,
  })

  const st = MASTER_STATUS_BADGE[master.status] ?? {
    label: master.status,
    className: 'bg-gray-100 text-gray-500',
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <Link
        href="/admin/masters/pilot"
        className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm"
      >
        ← Pilot saunamistrzów
      </Link>

      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">Stan profilu</h2>
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
              {master.city ?? 'Brak miasta'} ·{' '}
              {claimed ? '🔗 Przejęty przez właściciela' : '◯ Nieprzejęty'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${readinessMeta.className}`}>
            {readinessMeta.label}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>
            {st.label}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
            Przygotowany przez administrację
          </span>
        </div>
        </div>
      </section>

      <div className="mb-4 rounded-xl bg-orange-50 px-3 py-2.5 text-sm text-orange-700">
        <p className="font-semibold">Jak przebiega przejęcie profilu:</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Link z zaproszenia otwiera publiczną stronę przejęcia profilu.</li>
          <li>Zaproszona osoba loguje się lub zakłada konto.</li>
          <li>Następnie samodzielnie przejmuje profil przyciskiem na tej stronie.</li>
          <li>
            Przejęcie nie publikuje profilu — właściciel uzupełnia wizytówkę w
            Master Studio i zgłasza ją do moderacji.
          </li>
          <li>Profil staje się publiczny dopiero po zatwierdzeniu.</li>
        </ol>
        <p className="mt-1.5 text-xs text-orange-600">
          Pochodzenie profilu (przygotowany przez administrację) jest niezmienne.
        </p>
      </div>

      {/* Readiness checklist */}
      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">Gotowość do zaproszenia</h2>
        <ul className="space-y-1 text-sm">
          {PILOT_REQUIRED_FIELDS.map((key) => {
            const missing = readiness.missingRequired.includes(key)
            return (
              <li key={key} className={missing ? 'text-yellow-700' : 'text-green-700'}>
                {missing ? '○' : '✓'} {PILOT_REQUIRED_FIELD_LABELS_PL[key]}
                {missing && ' — do uzupełnienia'}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-gray-400">
          Zdjęcie profilowe, specjalizacje i linki są zalecane, ale nie blokują
          zaproszenia. Baza danych wymaga twardo jedynie imienia i nazwiska — pozostałe
          wymogi to reguła pilotażu.
        </p>
      </section>

      {/* Invitation state — read-only summary */}
      <section className="mb-4 rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">Aktualne zaproszenie</h2>
        {!latest ? (
          <p className="text-sm text-gray-500">
            Brak zaproszeń dla tego profilu.
            {invitationsResult.ok ? '' : ' (Nie udało się pobrać stanu zaproszeń.)'}
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              Status:{' '}
              <span className="font-semibold">
                {INVITATION_STATUS_LABELS_PL[latest.status]}
                {readiness.invitationExpired && ' (po terminie ważności)'}
              </span>
            </p>
            {latest.expiresAt && <p>Ważne do: {formatDateTimePl(latest.expiresAt)}</p>}
            {latest.sentAt && (
              <p>
                Wysłane: {formatDateTimePl(latest.sentAt)}
                {latest.deliveryChannel && ` (kanał: ${latest.deliveryChannel})`}
                {latest.deliveryTargetHint && ` · odbiorca: ${latest.deliveryTargetHint}`}
              </p>
            )}
            {latest.revokedAt && <p>Unieważnione: {formatDateTimePl(latest.revokedAt)}</p>}
            {latest.tokenPrefix && (
              <p className="text-xs text-gray-400">
                Prefiks diagnostyczny: <code>{latest.tokenPrefix}</code> (do korelacji
                zgłoszeń — nie jest linkiem ani hasłem)
              </p>
            )}
            {invitations.length > 1 && (
              <p className="text-xs text-gray-400">
                Wcześniejsze zaproszenia: {invitations.length - 1}
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
          <h2 className="mb-3 text-sm font-bold">Historia</h2>
          <ul className="space-y-1 text-xs text-gray-500">
            {history.map((e, i) => (
              <li key={i}>
                {formatDateTimePl(e.created_at ?? null) ?? '—'} ·{' '}
                {EVENT_TYPE_LABELS_PL[e.event_type ?? ''] ?? e.event_type}
                {e.delivery_channel && ` (${e.delivery_channel})`}
                {e.reason && ` — ${e.reason}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Profile editor / read-only view */}
      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">Dane profilu</h2>
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
                ? 'Profil został przejęty przez właściciela — edycja pilotażowa jest zablokowana; zmiany wprowadza właściciel w swoim Studiu.'
                : 'Profil nie jest już w stanie umożliwiającym edycję pilotażową.'}
            </p>
            {master.bio && <p>{master.bio}</p>}
            {master.specialties && master.specialties.length > 0 && (
              <p>Specjalizacje: {master.specialties.map(specialtyLabel).join(', ')}</p>
            )}
            {master.languages && master.languages.length > 0 && (
              <p>Języki: {master.languages.map(languageLabel).join(', ')}</p>
            )}
            {master.website && <p>WWW: {master.website}</p>}
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-gray-400">
        Utworzony: {formatDateTimePl(master.created_at)}
        {master.slug && (
          <>
            {' '}· adres profilu: <code>/masters/{master.slug}</code>
          </>
        )}
      </p>
    </main>
  )
}
