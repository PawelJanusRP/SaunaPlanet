import Link from 'next/link'
import UploadAvatarButton, { UploadMasterImageButton } from '@/components/UploadAvatarButton'
import EditSaunaMasterModal from '@/components/EditSaunaMasterModal'
import AddCertificateModal from '@/components/AddCertificateModal'
import Navbar from '@/components/Navbar'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { loadPublicVisibility } from '@/lib/master/publicationServer'
import { isUuid } from '@/lib/master/slug'
import { languageLabel, specialtyLabel } from '@/lib/master/specialties'
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

const SOCIAL_BUTTONS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
] as const

export default async function MasterPage({
  params,
}: {
  params: Promise<{ idOrSlug: string }>
}) {
  const { idOrSlug } = await params
  const supabase = await createClient()
  const role = await getCurrentUserRole()
  const isAdmin = role === 'admin' || role === 'moderator'
  const { data: { user } } = await supabase.auth.getUser()

  // SP-039 dual lookup: a UUID keeps resolving by id (old links stay
  // valid), anything else resolves by the canonical lowercase slug.
  // Visibility of pending/rejected profiles is unchanged — RLS decides.
  const baseQuery = supabase.from('sauna_masters').select('*')
  const { data: master } = isUuid(idOrSlug)
    ? await baseQuery.eq('id', idOrSlug).maybeSingle()
    : await baseQuery.eq('slug', idOrSlug.toLowerCase()).maybeSingle()

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
  const id = master.id as string

  // SP-039 4C2: the ONE public-visibility verdict is the M9 helper (never
  // mirrored in TS). If this page rendered but the verdict is false, the
  // viewer is necessarily the owner or moderation (RLS) — preview mode.
  const publiclyVisible = await loadPublicVisibility(supabase, id)

  const { data: certificatesRaw } = await supabase
    .from('master_certificates')
    .select('id, year, notes, status, certificate_types(id, name, category)')
    .eq('master_id', id)
    .order('created_at', { ascending: false })

  // SP-039: approved affiliations are public content (RLS already limits
  // the visible rows to approved for anonymous readers).
  const { data: affiliationsRaw } = await supabase
    .from('master_affiliations')
    .select('id, is_primary, saunas(id, name, city)')
    .eq('master_id', id)
    .eq('status', 'approved')
    .order('is_primary', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const affiliations = (affiliationsRaw ?? []) as any[]

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

        {!publiclyVisible && (
          <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-amber-900">
              PODGLĄD — profil nie jest jeszcze publiczny
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Tę stronę widzisz tylko Ty {canManageProfile && !isOwnProfile ? '(moderacja)' : ''}
              — profil pojawi się w katalogu po publikacji.
            </p>
          </div>
        )}
        {publiclyVisible && canManageProfile && (
          <p className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
            🌍 publiczny
          </p>
        )}

        {/* Hero (SP-039): cover, identity, badges, city, experience, links */}
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          {master.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={master.cover_image_url}
              alt=""
              className="h-36 w-full object-cover sm:h-48"
            />
          )}
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex flex-col items-center gap-2">
                {master.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={master.avatar_url} alt={master.name} className="h-28 w-28 rounded-full object-cover" />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gray-200 text-5xl">🧖</div>
                )}
                {canManageProfile && (
                  <UploadAvatarButton masterId={id} currentAvatarUrl={master.avatar_url} />
                )}
              </div>

              <div className="min-w-0">
                <h1 className="text-3xl font-bold">{master.name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {master.level && (
                    <span className="rounded-full bg-gray-100 px-3 py-0.5 text-sm font-semibold capitalize text-gray-600">
                      {master.level}
                    </span>
                  )}
                  {master.is_founding_partner && (
                    <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-700">
                      🏅 Founding Partner
                    </span>
                  )}
                </div>
                {(master.city || master.experience_since_year) && (
                  <p className="mt-1.5 text-sm text-gray-500">
                    {master.city && <span>📍 {master.city}</span>}
                    {master.city && master.experience_since_year && ' · '}
                    {master.experience_since_year && (
                      <span>saunuje od {master.experience_since_year}</span>
                    )}
                  </p>
                )}
                {/* Legacy rating renders ONLY with real reviews (decision D5) */}
                {Number(master.review_count ?? 0) > 0 && (
                  <div className="mt-1.5 text-sm font-semibold text-yellow-600">
                    ⭐ {Number(master.rating ?? 0).toFixed(1)} ({master.review_count} opinii)
                  </div>
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

            {(master.website || master.social_links) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {master.website && (
                  <a
                    href={master.website}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    Strona WWW
                  </a>
                )}
                {SOCIAL_BUTTONS.map(([key, label]) => {
                  const href = (master.social_links as Record<string, string> | null)?.[key]
                  if (!href) return null
                  return (
                    <a
                      key={key}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {label}
                    </a>
                  )
                })}
              </div>
            )}

            {master.bio && <p className="mt-5 text-gray-700">{master.bio}</p>}

            {((master.specialties?.length ?? 0) > 0 || (master.languages?.length ?? 0) > 0) && (
              <div className="mt-4 space-y-2">
                {(master.specialties?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(master.specialties as string[]).map((s) => (
                      <span key={s} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                        {specialtyLabel(s)}
                      </span>
                    ))}
                  </div>
                )}
                {(master.languages?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(master.languages as string[]).map((l) => (
                      <span key={l} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                        🗣 {languageLabel(l)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canManageProfile && (
              <div className="mt-4">
                <UploadMasterImageButton masterId={id} kind="cover" currentUrl={master.cover_image_url ?? null} />
              </div>
            )}
          </div>
        </section>

        {/* Affiliations (SP-039): approved only; primary highlighted */}
        {affiliations.length > 0 && (
          <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold">🤝 Obiekty</h2>
            <div className="space-y-2">
              {affiliations.map((a) => (
                <Link
                  key={a.id}
                  href={`/sauna/${a.saunas?.id}`}
                  className={`flex items-center justify-between rounded-xl px-4 py-2.5 transition-colors ${
                    a.is_primary
                      ? 'bg-orange-50 hover:bg-orange-100'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <span className="font-semibold text-gray-800">
                    {a.saunas?.name}
                    {a.saunas?.city && <span className="ml-1 font-normal text-gray-400">· {a.saunas.city}</span>}
                  </span>
                  {a.is_primary && (
                    <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                      Obiekt macierzysty
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

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

        {/* Najbliższe wydarzenia — the very next appearance is highlighted */}
        <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold">🔥 Najbliższe wydarzenia</h2>
          {upcomingEvents.length === 0 ? (
            <div className="text-gray-500">Brak nadchodzących wydarzeń.</div>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((item, index) => {
                const event = item.sauna_events
                const isNext = index === 0
                return (
                  <Link
                    key={index}
                    href={`/events/${event?.id}`}
                    className={`block rounded-xl p-3 transition-colors ${
                      isNext
                        ? 'border-2 border-orange-400 bg-orange-50 hover:bg-orange-100'
                        : 'bg-orange-50 hover:bg-orange-100'
                    }`}
                  >
                    {isNext && (
                      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-orange-500">
                        Następny występ
                      </div>
                    )}
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
