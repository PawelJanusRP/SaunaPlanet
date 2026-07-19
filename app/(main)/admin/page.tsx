import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import SubmissionActions from '@/components/SubmissionActions'
import MasterModerationActions from '@/components/MasterModerationActions'
import CertificateModerationActions from '@/components/CertificateModerationActions'
import ManageCertificateTypes from '@/components/ManageCertificateTypes'
import EditSaunaAdminForm from '@/components/EditSaunaAdminForm'
import EventModerationActions from '@/components/EventModerationActions'
import DeleteReviewButton from '@/components/DeleteReviewButton'
import UserRoleSelector from '@/components/UserRoleSelector'
import ManagerApprovalActions from '@/components/ManagerApprovalActions'
import FacilityModerationActions from '@/components/FacilityModerationActions'

const statusLabel: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Oczekuje',     className: 'bg-yellow-100 text-yellow-700' },
  active:    { label: 'Aktywna',      className: 'bg-green-100 text-green-700' },
  approved:  { label: 'Zatwierdzona', className: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Odrzucona',    className: 'bg-red-100 text-red-700' },
  inactive:  { label: 'Nieaktywna',   className: 'bg-gray-100 text-gray-500' },
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

  const [
    { data: profiles },
    { data: submissions },
    { data: pendingMasters },
    { data: pendingCertificates },
    { data: certTypes },
    { data: saunas },
    { data: events },
    { data: reviews },
    { data: pendingManagers },
    { data: linkedMasters },
  ] = await Promise.all([
    supabase.rpc('admin_get_users'),
    supabase.from('sauna_submissions').select('*').order('created_at', { ascending: false }),
    supabase.from('sauna_masters').select('id, name, level, bio, created_at').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase
      .from('master_certificates')
      .select('id, year, notes, status, created_at, sauna_masters(id, name), certificate_types(id, name, category)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('certificate_types').select('id, name, category, is_active, sort_order').order('sort_order'),
    supabase
      .from('saunas')
      .select('id, name, city, category, status, description, website, latitude, longitude, created_by, created_at')
      .order('name'),
    supabase
      .from('sauna_events')
      .select('id, title, event_date, status, sauna_id, saunas(name)')
      .order('event_date', { ascending: false }),
    supabase
      .from('sauna_reviews')
      .select('id, rating, review_text, author_name, created_at, sauna_id, saunas(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('sauna_managers')
      .select('id, user_id, status, created_at, saunas(id, name, city)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    // Master moderation status per account for the Users tab. admin_get_users
    // returns only master_name; the status has to come from the table (the
    // moderator arm of RLS returns every row here).
    supabase
      .from('sauna_masters')
      .select('user_id, status')
      .not('user_id', 'is', null),
  ])

  const masterStatusByUserId: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (linkedMasters ?? []) as any[]) {
    if (m.user_id) masterStatusByUserId[m.user_id] = m.status
  }

  const pending = submissions?.filter((s) => s.status === 'pending') ?? []
  const pendingMasterCount = pendingMasters?.length ?? 0
  const pendingCertCount = pendingCertificates?.length ?? 0
  const pendingManagerCount = pendingManagers?.length ?? 0

  // SP-036 slice 2: pending facility submissions surface first in the
  // Sauny tab with full moderation context (submitter, duplicates,
  // bundled events).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saunaRows = (saunas ?? []) as any[]
  const pendingSaunas = saunaRows.filter((s) => s.status === 'pending')
  const sortedSaunas = [
    ...pendingSaunas,
    ...saunaRows.filter((s) => s.status !== 'pending'),
  ]
  const pendingSaunaCount = pendingSaunas.length
  const totalPending =
    pending.length + pendingMasterCount + pendingCertCount +
    pendingManagerCount + pendingSaunaCount

  const pendingSaunaIds = pendingSaunas.map((s) => s.id)
  const [{ data: bundledEventsRaw }, duplicateResults] = await Promise.all([
    pendingSaunaIds.length > 0
      ? supabase
          .from('sauna_events')
          .select('id, title, event_date, event_time, sauna_id, organizer:sauna_masters!sauna_events_organizer_master_id_fkey(id, name)')
          .in('sauna_id', pendingSaunaIds)
          .eq('bundled_with_submission', true)
      : Promise.resolve({ data: [] }),
    // Duplicate context per pending submission (warn-only RPC; moderators
    // make the final call). Failures degrade to no-context server-side.
    Promise.all(
      pendingSaunas.map((s) =>
        supabase
          .rpc('find_similar_saunas', {
            p_name: s.name,
            p_lat: s.latitude,
            p_lng: s.longitude,
            p_website: s.website,
          })
          .then(({ data }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((data ?? []) as any[]).filter((d) => d.id !== s.id)
          )
      )
    ),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bundledBySaunaId: Record<string, any[]> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (bundledEventsRaw ?? []) as any[]) {
    ;(bundledBySaunaId[e.sauna_id] ??= []).push(e)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const duplicatesBySaunaId: Record<string, any[]> = {}
  pendingSaunas.forEach((s, i) => {
    duplicatesBySaunaId[s.id] = duplicateResults[i] ?? []
  })

  // Resolve manager + facility-submitter user names in one lookup
  const managerUserIds = [...new Set([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(pendingManagers ?? []).map((m: any) => m.user_id),
    ...pendingSaunas.map((s) => s.created_by).filter(Boolean),
  ])]
  const { data: managerProfilesRaw } = managerUserIds.length > 0
    ? await supabase.from('profiles').select('id, first_name, last_name, email').in('id', managerUserIds)
    : { data: [] }
  const managerNameById: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (managerProfilesRaw ?? []) as any[]) {
    managerNameById[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Użytkownik'
  }

  const tabs = [
    { id: 'submissions', label: `Zgłoszenia (${submissions?.length ?? 0})` },
    { id: 'sauny',       label: `Sauny (${saunas?.length ?? 0})${pendingSaunaCount > 0 ? ` · ${pendingSaunaCount} oczekuje` : ''}` },
    { id: 'eventy',      label: `Eventy (${events?.length ?? 0})` },
    { id: 'recenzje',    label: `Recenzje (${reviews?.length ?? 0})` },
    { id: 'masters',     label: `Saunamistrzowie${pendingMasterCount > 0 ? ` (${pendingMasterCount})` : ''}` },
    { id: 'certyfikaty', label: `Certyfikaty${pendingCertCount > 0 ? ` (${pendingCertCount})` : ''}` },
    { id: 'slownik',     label: 'Słownik certyfikatów' },
    { id: 'managerowie', label: `Managerowie${pendingManagerCount > 0 ? ` (${pendingManagerCount})` : ''}` },
    { id: 'users',       label: `Użytkownicy (${profiles?.length ?? 0})` },
  ]

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link href="/" className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm">
        ← Powrót do mapy
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel administracyjny</h1>
        {totalPending > 0 && (
          <span className="rounded-full bg-yellow-500 px-2.5 py-0.5 text-sm font-bold text-white">
            {totalPending} oczekuje
          </span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b">
        {tabs.map(({ id, label }) => (
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
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak zgłoszeń.</div>
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
                        {s.website && <span> · <a href={s.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{s.website}</a></span>}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>
                  </div>
                  {s.description && <p className="mb-3 text-sm text-gray-600">{s.description}</p>}
                  {s.latitude && s.longitude && (
                    <p className="mb-3 text-xs text-gray-400">📍 {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}</p>
                  )}
                  {s.admin_note && (
                    <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">Notatka: {s.admin_note}</p>
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

      {/* Sauny tab — pending submissions first with moderation context (SP-036) */}
      {activeTab === 'sauny' && (
        <section className="space-y-3">
          {sortedSaunas.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak saun.</div>
          ) : (
            sortedSaunas.map((s) => {
              const st = statusLabel[s.status] ?? statusLabel.pending
              const isPendingSubmission = s.status === 'pending'
              const duplicates = duplicatesBySaunaId[s.id] ?? []
              const bundledEvents = bundledBySaunaId[s.id] ?? []
              return (
                <div
                  key={s.id}
                  className={`rounded-3xl border bg-white p-5 shadow-sm ${
                    isPendingSubmission ? 'border-yellow-300 bg-yellow-50/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {isPendingSubmission ? (
                        <span className="text-base font-bold">{s.name}</span>
                      ) : (
                        <Link href={`/sauna/${s.id}`} className="text-base font-bold hover:underline">
                          {s.name}
                        </Link>
                      )}
                      <div className="mt-0.5 text-sm text-gray-500">
                        {s.city && <span>{s.city} · </span>}
                        <span>{s.category}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>
                      <EditSaunaAdminForm sauna={s} />
                    </div>
                  </div>

                  {isPendingSubmission && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <div className="text-xs text-gray-500">
                        Zgłosił(a):{' '}
                        <span className="font-medium text-gray-700">
                          {(s.created_by && managerNameById[s.created_by]) || 'Użytkownik'}
                        </span>
                        {s.created_at && (
                          <span>
                            {' '}· {new Date(s.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        )}
                        {s.latitude != null && s.longitude != null && (
                          <span> · 📍 {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}</span>
                        )}
                      </div>

                      {s.description && (
                        <p className="text-sm text-gray-600">{s.description}</p>
                      )}

                      {bundledEvents.length > 0 && (
                        <div className="rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-700">
                          🔥 Zgłoszenie zawiera {bundledEvents.length === 1 ? 'dołączony event saunamistrza' : `dołączone eventy saunamistrza: ${bundledEvents.length}`}
                          {' '}—{' '}
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {bundledEvents.map((e: any) =>
                            `${e.title} (${String(e.event_date).substring(0, 10)}${e.event_time ? ` ${String(e.event_time).substring(0, 5)}` : ''})` +
                            (e.organizer?.name ? ` · organizuje ${e.organizer.name}` : '')
                          ).join(', ')}
                          . Zatwierdzenie publikuje obiekt i kwalifikujący się event razem
                          (organizator dołącza do lineupu z rolą lead); odrzucenie odrzuca
                          cały pakiet — jedna niepodzielna operacja.
                        </div>
                      )}

                      {duplicates.length > 0 && (
                        <div className="rounded-xl bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                          ⚠️ Możliwe duplikaty:{' '}
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {duplicates.map((d: any) => (
                            <span key={d.id} className="mr-2">
                              {d.status === 'active' ? (
                                <Link href={`/sauna/${d.id}`} className="underline">{d.name}</Link>
                              ) : (
                                <span>{d.name} (oczekuje)</span>
                              )}
                              {d.city && ` · ${d.city}`}
                              {d.match_reasons?.length > 0 && ` [${d.match_reasons.join(', ')}]`}
                            </span>
                          ))}
                        </div>
                      )}

                      <FacilityModerationActions saunaId={s.id} />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </section>
      )}

      {/* Eventy tab */}
      {activeTab === 'eventy' && (
        <section className="space-y-3">
          {!events || events.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak eventów.</div>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (events as any[]).map((e) => {
              const st = statusLabel[e.status] ?? statusLabel.pending
              return (
                <div key={e.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/events/${e.id}`} className="font-bold hover:underline">
                        {e.title}
                      </Link>
                      <div className="mt-0.5 text-sm text-gray-500">
                        {e.event_date?.substring(0, 10)}
                        {e.saunas?.name && <span> · {e.saunas.name}</span>}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{new Date(e.event_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <EventModerationActions eventId={e.id} status={e.status} />
                  </div>
                </div>
              )
            })
          )}
        </section>
      )}

      {/* Recenzje tab */}
      {activeTab === 'recenzje' && (
        <section className="space-y-3">
          {!reviews || reviews.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak recenzji.</div>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (reviews as any[]).map((r) => (
              <div key={r.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">
                      {'⭐'.repeat(r.rating)} <span className="text-gray-700">{r.author_name}</span>
                    </div>
                    {r.saunas?.name && (
                      <div className="mt-0.5 text-sm text-gray-500">
                        <Link href={`/sauna/${r.sauna_id}`} className="hover:underline">{r.saunas.name}</Link>
                      </div>
                    )}
                  </div>
                  <DeleteReviewButton reviewId={r.id} />
                </div>
                {r.review_text && <p className="text-sm text-gray-600">{r.review_text}</p>}
                <div className="mt-2 text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Masters tab */}
      {activeTab === 'masters' && (
        <section className="space-y-4">
          {!pendingMasters || pendingMasters.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak oczekujących zgłoszeń saunamistrzów.</div>
          ) : (
            pendingMasters.map((m) => (
              <div key={m.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-bold">{m.name}</div>
                    {m.level && <div className="mt-0.5 text-sm text-gray-500">Poziom: {m.level}</div>}
                  </div>
                  <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">Oczekuje</span>
                </div>
                {m.bio && <p className="mb-3 text-sm text-gray-600">{m.bio}</p>}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{new Date(m.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <MasterModerationActions masterId={m.id} />
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Certyfikaty tab */}
      {activeTab === 'certyfikaty' && (
        <section className="space-y-4">
          {!pendingCertificates || pendingCertificates.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak oczekujących certyfikatów.</div>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (pendingCertificates as any[]).map((c) => {
              const master = c.sauna_masters
              const certType = c.certificate_types
              const displayName = certType?.name === 'Inny certyfikat' && c.notes ? c.notes : certType?.name
              return (
                <div key={c.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-bold">🏅 {displayName}</div>
                      <div className="mt-0.5 text-sm text-gray-500">
                        <Link href={`/masters/${master?.id}`} className="hover:underline">{master?.name}</Link>
                        {c.year && <span> · {c.year}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">Oczekuje</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{new Date(c.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <CertificateModerationActions certId={c.id} />
                  </div>
                </div>
              )
            })
          )}
        </section>
      )}

      {/* Słownik tab */}
      {activeTab === 'slownik' && (
        <ManageCertificateTypes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          types={(certTypes ?? []) as any}
        />
      )}

      {/* Managerowie tab */}
      {activeTab === 'managerowie' && (
        <section className="space-y-3">
          {!pendingManagers || pendingManagers.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak oczekujących wniosków o rolę managera.</div>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (pendingManagers as any[]).map((m) => (
              <div key={m.id} className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold">{managerNameById[m.user_id] ?? 'Użytkownik'}</p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      Sauna:{' '}
                      <Link href={`/sauna/${m.saunas?.id}`} className="hover:underline">
                        {m.saunas?.name}
                      </Link>
                      {m.saunas?.city && <span className="ml-1 text-gray-400">· {m.saunas.city}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {new Date(m.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <ManagerApprovalActions managerId={m.id} />
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <section className="space-y-3">
          {!profiles || profiles.length === 0 ? (
            <div className="rounded-3xl border bg-white p-8 text-center text-sm text-gray-500">Brak użytkowników.</div>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (profiles as any[]).map((p) => {
              const displayName = p.master_name || [p.first_name, p.last_name].filter(Boolean).join(' ')
              const isCurrentUser = p.id === user.id
              const masterStatus = masterStatusByUserId[p.id]
              const masterBadge = masterStatus
                ? statusLabel[masterStatus] ?? { label: masterStatus, className: 'bg-gray-100 text-gray-500' }
                : null
              return (
                <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border bg-white px-5 py-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">
                      {displayName || <span className="text-gray-400 italic">Brak nazwy</span>}
                      {isCurrentUser && <span className="ml-2 text-xs text-gray-400">(Ty)</span>}
                    </p>
                    {p.email && (
                      <p className="mt-0.5 truncate text-sm text-gray-500">{p.email}</p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString('pl-PL')}
                    </p>
                    {masterBadge && (
                      <p className="mt-1">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${masterBadge.className}`}>
                          🧖 Saunamistrz: {masterBadge.label}
                        </span>
                      </p>
                    )}
                  </div>
                  <UserRoleSelector
                    userId={p.id}
                    currentRole={p.role ?? 'user'}
                    isCurrentUser={isCurrentUser}
                  />
                </div>
              )
            })
          )}
        </section>
      )}
    </main>
  )
}
