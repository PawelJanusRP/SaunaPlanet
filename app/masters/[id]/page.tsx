import Link from 'next/link'
import UploadAvatarButton from '@/components/UploadAvatarButton'
import EditSaunaMasterModal from '@/components/EditSaunaMasterModal'
import AddCertificateModal from '@/components/AddCertificateModal'
import Navbar from '@/components/Navbar'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import type { EventMasterRow } from '@/lib/types'

const CATEGORY_LABELS: Record<string, string> = {
  certification:   'Certyfikaty',
  championship_pl: 'Mistrzostwa Polski',
  gladiators:      'Battle of Gladiators',
  aufguss_wm:      'Aufguss WM',
  classic_cup:     'Modern Classic Cup',
  cup:             'Puchary',
  other:           'Inne',
}

export default async function MasterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const role = await getCurrentUserRole()
  const isAdmin = role === 'admin' || role === 'moderator'
  const { data: { user } } = await supabase.auth.getUser()

  const { data: master } = await supabase
    .from('sauna_masters')
    .select('*')
    .eq('id', id)
    .single()

  // SP-035: profile controls belong to the linked account and moderation.
  // RLS enforces the same boundary; this only mirrors it in the UI.
  const isOwnProfile = !!master && !!user && master.user_id === user.id
  const canManageProfile = isAdmin || isOwnProfile

  if (!master) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Nie znaleziono saunamistrza</h1>
        <Link href="/masters" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          Powrót
        </Link>
      </main>
    )
  }

  const { data: certificatesRaw } = await supabase
    .from('master_certificates')
    .select('id, year, notes, status, certificate_types(id, name, category)')
    .eq('master_id', id)
    .order('created_at', { ascending: false })

  const { data: allEvents } = await supabase
    .from('sauna_event_masters')
    .select(`
      role,
      status,
      sauna_events (
        id,
        title,
        event_date,
        event_time,
        sauna_id
      )
    `)
    .eq('master_id', id)
    .eq('status', 'approved')

  // The untyped client infers embedded resources as arrays, but PostgREST
  // returns an object for this many-to-one join (event_id → sauna_events).
  const eventRows = (allEvents ?? []) as unknown as EventMasterRow[]

  const today = new Date().toISOString().substring(0, 10)
  const getDate = (item: EventMasterRow) => item.sauna_events?.event_date ?? ''
  const upcomingEvents = eventRows.filter((i) => getDate(i) >= today).sort((a, b) => getDate(a) > getDate(b) ? 1 : -1)
  const pastEvents = eventRows.filter((i) => getDate(i) < today).sort((a, b) => getDate(a) > getDate(b) ? -1 : 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const certificates = (certificatesRaw ?? []) as any[]
  const approvedCerts = certificates.filter((c) => c.status === 'approved')
  const pendingCerts = certificates.filter((c) => c.status === 'pending')

  // Group approved certs by category for display
  const certsByCategory = approvedCerts.reduce<Record<string, typeof approvedCerts>>((acc, c) => {
    const cat = c.certificate_types?.category ?? 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(c)
    return acc
  }, {})

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl p-4">
        <Link href="/masters" className="mb-4 inline-block rounded-xl border px-4 py-2">
          ← Powrót do saunamistrzów
        </Link>

        {/* Header */}
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              {master.avatar_url ? (
                <img src={master.avatar_url} alt={master.name} className="h-28 w-28 rounded-full object-cover" />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gray-200 text-5xl">🧖</div>
              )}
              {canManageProfile && (
                <UploadAvatarButton masterId={id} currentAvatarUrl={master.avatar_url} />
              )}
            </div>

            <div>
              <h1 className="text-3xl font-bold">{master.name}</h1>
              <div className="mt-2 text-lg font-semibold text-yellow-600">
                ⭐ {Number(master.rating ?? 0).toFixed(1)} ({master.review_count ?? 0} opinii)
              </div>
              {master.level && (
                <div className="mt-1 text-sm font-semibold text-gray-500">{master.level}</div>
              )}
              {canManageProfile && (
                <EditSaunaMasterModal
                  masterId={id}
                  currentName={master.name}
                  currentLevel={master.level ?? null}
                  currentBio={master.bio ?? null}
                  canEditLevel={isAdmin}
                />
              )}
            </div>
          </div>

          {master.bio && <p className="mt-6 text-gray-700">{master.bio}</p>}
        </section>

        {/* Certyfikaty */}
        <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold">🏅 Certyfikaty i tytuły</h2>

          {approvedCerts.length === 0 && pendingCerts.length === 0 ? (
            <div className="text-gray-500">Brak certyfikatów.</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(certsByCategory).map(([cat, certs]) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </p>
                  <div className="space-y-2">
                    {certs.map((c) => {
                      const displayName = c.certificate_types?.name === 'Inny certyfikat' && c.notes
                        ? c.notes
                        : c.certificate_types?.name
                      return (
                        <div key={c.id} className="flex items-center justify-between rounded-xl bg-yellow-50 px-4 py-2.5">
                          <span className="font-semibold text-yellow-800">🏅 {displayName}</span>
                          {c.year && <span className="text-sm text-gray-500">{c.year}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {isAdmin && pendingCerts.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-400">
                    Oczekujące (widoczne tylko dla admina)
                  </p>
                  <div className="space-y-2">
                    {pendingCerts.map((c) => {
                      const displayName = c.certificate_types?.name === 'Inny certyfikat' && c.notes
                        ? c.notes
                        : c.certificate_types?.name
                      return (
                        <div key={c.id} className="flex items-center justify-between rounded-xl border border-dashed border-orange-300 bg-orange-50 px-4 py-2.5">
                          <span className="text-orange-700">⏳ {displayName}</span>
                          {c.year && <span className="text-sm text-gray-500">{c.year}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {canManageProfile && <AddCertificateModal masterId={id} isAdmin={isAdmin} />}
        </section>

        {/* Najbliższe wydarzenia */}
        <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold">🔥 Najbliższe wydarzenia</h2>
          {upcomingEvents.length === 0 ? (
            <div className="text-gray-500">Brak nadchodzących wydarzeń.</div>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((item, index) => {
                const event = item.sauna_events
                return (
                  <Link key={index} href={`/events/${event?.id}`} className="block rounded-xl bg-orange-50 p-3 hover:bg-orange-100 transition-colors">
                    <div className="font-bold text-orange-700">🔥 {event?.title}</div>
                    <div className="text-sm text-gray-500">{event?.event_date?.substring(0, 10)}</div>
                    <div className="text-sm">Rola: {item.role}</div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {pastEvents.length > 0 && (
          <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-gray-600">📅 Poprzednie wydarzenia</h2>
            <div className="space-y-3">
              {pastEvents.map((item, index) => {
                const event = item.sauna_events
                return (
                  <Link key={index} href={`/events/${event?.id}`} className="block rounded-xl bg-gray-50 p-3 hover:bg-gray-100 transition-colors">
                    <div className="font-bold text-gray-700">🔥 {event?.title}</div>
                    <div className="text-sm text-gray-500">{event?.event_date?.substring(0, 10)}</div>
                    <div className="text-sm text-gray-500">Rola: {item.role}</div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
