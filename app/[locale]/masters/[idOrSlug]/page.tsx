import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/lib/i18n/navigation'
import UploadAvatarButton, { UploadMasterImageButton } from '@/components/UploadAvatarButton'
import EditSaunaMasterModal from '@/components/EditSaunaMasterModal'
import AddCertificateModal from '@/components/AddCertificateModal'
import Navbar from '@/components/Navbar'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { loadPublicVisibility } from '@/lib/master/publicationServer'
import { isUuid } from '@/lib/master/slug'
import { localizedAlternates } from '@/lib/i18n/seo'
import type { Locale } from '@/lib/i18n/locales'
import type { EventMasterRow } from '@/lib/types'

// SP-047E3 — international SEO. Every locale variant is canonical to ITSELF and
// declares the pl/en/de alternates for the SAME entity (slug/id is never
// translated). Only publicly-visible profiles are indexable; the public name is
// the only identity ever exposed (SP-044). No entity content is translated.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; idOrSlug: string }>
}): Promise<Metadata> {
  const { locale, idOrSlug } = await params
  const alternates = localizedAlternates(locale as Locale, `/masters/${idOrSlug}`)
  const supabase = await createClient()
  const { data: master } = isUuid(idOrSlug)
    ? await supabase.from('sauna_masters').select('id, name').eq('id', idOrSlug).maybeSingle()
    : await supabase.from('sauna_masters').select('id, name').eq('slug', idOrSlug.toLowerCase()).maybeSingle()
  if (!master) return { alternates, robots: { index: false, follow: false } }
  const visible = await loadPublicVisibility(supabase, master.id)
  return {
    title: master.name,
    alternates,
    robots: visible ? undefined : { index: false, follow: false },
    openGraph: { title: master.name, type: 'profile', locale },
  }
}

// Canonical category codes with a localized label (SP-047). Codes stay
// canonical; unknown codes fall back to the raw code at render time.
const CATEGORY_CODES = [
  'certification',
  'championship_pl',
  'gladiators',
  'aufguss_wm',
  'classic_cup',
  'cup',
  'other',
] as const

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
  const t = await getTranslations('masters')
  const tc = await getTranslations('common')
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
        <h1 className="text-2xl font-bold">{t('profile.notFound')}</h1>
        <Link href="/masters" className="mt-4 inline-block rounded-xl bg-black px-4 py-2 text-white">
          {t('profile.back')}
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
          {t('profile.backToDirectory')}
        </Link>

        {!publiclyVisible && (
          <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-amber-900">
              {t('profile.preview.title')}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {t('profile.preview.onlyYou')} {canManageProfile && !isOwnProfile ? t('profile.preview.moderation') : ''}
              {' '}{t('profile.preview.afterPublication')}
            </p>
          </div>
        )}
        {publiclyVisible && canManageProfile && (
          <p className="mb-4 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
            {t('profile.public')}
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
                      🏅 {t('profile.foundingPartner')}
                    </span>
                  )}
                </div>
                {(master.city || master.experience_since_year) && (
                  <p className="mt-1.5 text-sm text-gray-500">
                    {master.city && <span>📍 {master.city}</span>}
                    {master.city && master.experience_since_year && ' · '}
                    {master.experience_since_year && (
                      <span>{t('profile.saunaSince', { year: master.experience_since_year })}</span>
                    )}
                  </p>
                )}
                {/* Legacy rating renders ONLY with real reviews (decision D5) */}
                {Number(master.review_count ?? 0) > 0 && (
                  <div className="mt-1.5 text-sm font-semibold text-yellow-600">
                    ⭐ {Number(master.rating ?? 0).toFixed(1)} ({t('profile.reviewsCount', { count: Number(master.review_count ?? 0) })})
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
                    {t('profile.website')}
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
                        {tc.has(`specialties.${s}`) ? tc(`specialties.${s}`) : s}
                      </span>
                    ))}
                  </div>
                )}
                {(master.languages?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(master.languages as string[]).map((l) => (
                      <span key={l} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                        🗣 {tc.has(`languages.${l}`) ? tc(`languages.${l}`) : l}
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
            <h2 className="mb-4 text-2xl font-bold">{t('profile.affiliations.title')}</h2>
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
                      {t('profile.affiliations.primary')}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Certyfikaty */}
        <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold">{t('profile.certificates.title')}</h2>

          {approvedCerts.length === 0 && pendingCerts.length === 0 ? (
            <div className="text-gray-500">{t('profile.certificates.empty')}</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(certsByCategory).map(([cat, certs]) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    {(CATEGORY_CODES as readonly string[]).includes(cat) ? t(`profile.categories.${cat}`) : cat}
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
                    {t('profile.certificates.pendingAdminOnly')}
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
          <h2 className="mb-4 text-2xl font-bold">{t('profile.upcomingEvents.title')}</h2>
          {upcomingEvents.length === 0 ? (
            <div className="text-gray-500">{t('profile.upcomingEvents.empty')}</div>
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
                        {t('profile.upcomingEvents.nextAppearance')}
                      </div>
                    )}
                    <div className="font-bold text-orange-700">🔥 {event?.title}</div>
                    <div className="text-sm text-gray-500">{event?.event_date?.substring(0, 10)}</div>
                    <div className="text-sm">{t('profile.role', { role: item.role ?? '' })}</div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {pastEvents.length > 0 && (
          <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-gray-600">{t('profile.pastEvents.title')}</h2>
            <div className="space-y-3">
              {pastEvents.map((item, index) => {
                const event = item.sauna_events
                return (
                  <Link key={index} href={`/events/${event?.id}`} className="block rounded-xl bg-gray-50 p-3 hover:bg-gray-100 transition-colors">
                    <div className="font-bold text-gray-700">🔥 {event?.title}</div>
                    <div className="text-sm text-gray-500">{event?.event_date?.substring(0, 10)}</div>
                    <div className="text-sm text-gray-500">{t('profile.role', { role: item.role ?? '' })}</div>
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
