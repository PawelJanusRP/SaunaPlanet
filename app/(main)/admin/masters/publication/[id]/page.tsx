import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import PublicationModerationControls from '@/components/admin/PublicationModerationControls'
import {
  loadPublicVisibility,
  loadPublicationAudit,
  loadPublicationState,
} from '@/lib/master/publicationServer'
import {
  PUBLICATION_STATUS_LABELS_PL,
  effectivePublicationStatus,
  resolveHardChecklist,
  resolveModeratorPublicationActions,
} from '@/lib/master/publicationView'

// SP-039 Slice 4C2-App — moderator publication review. Shows the state,
// completeness, internal review note and the moderation-facing audit trail;
// transition controls mirror the M10 matrix exactly (the RPCs stay the
// authority). No claim/invitation data and no owner identifiers appear.

const AUDIT_LABELS_PL: Record<string, string> = {
  legacy_publication_granted: 'Nadano publikację legacy (backfill M9)',
  profile_submitted: 'Zgłoszono do publikacji',
  changes_requested: 'Poproszono o zmiany',
  publication_approved: 'Zatwierdzono publikację',
  profile_unpublished: 'Wycofano z publikacji',
  profile_suspended: 'Zawieszono publikację',
  owner_publication_withdrawn: 'Publikacja wycofana po usunięciu konta właściciela',
  submission_withdrawn: 'Właściciel wycofał zgłoszenie',
  publication_restored: 'Przywrócono do wersji roboczej',
  publication_demoted: 'Cofnięto po edycji pól publicznych',
}

export default async function PublicationReviewPage({
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
  const { data: master } = await supabase
    .from('sauna_masters')
    .select('id, name, city, bio, avatar_url, specialties, status, user_id, slug')
    .eq('id', id)
    .maybeSingle()
  if (!master) notFound()

  const [publication, publiclyVisible, audit] = await Promise.all([
    loadPublicationState(supabase, master.id),
    loadPublicVisibility(supabase, master.id),
    loadPublicationAudit(supabase, master.id),
  ])
  const publicationStatus = effectivePublicationStatus(
    publication?.publicationStatus ?? null
  )
  const actions = resolveModeratorPublicationActions(publicationStatus)
  const checklist = resolveHardChecklist({
    name: master.name,
    city: master.city,
    bio: master.bio,
    avatarUrl: master.avatar_url,
    specialties: master.specialties,
  })

  return (
    <main className="mx-auto max-w-3xl p-4">
      <Link
        href="/admin/masters/publication"
        className="mb-4 inline-block rounded-xl border px-4 py-2 text-sm"
      >
        ← Kolejka publikacji
      </Link>

      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
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
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">{master.name}</h1>
            <p className="text-sm text-gray-500">{master.city ?? 'brak miasta'}</p>
          </div>
          <Link
            href={`/masters/${master.slug ?? master.id}`}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            👁️ Podgląd profilu
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">
            {PUBLICATION_STATUS_LABELS_PL[publicationStatus]}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            profil: {master.status}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {master.user_id !== null ? 'ma właściciela' : 'bez właściciela'}
          </span>
          <span
            className={`rounded-full px-3 py-1 font-semibold ${
              publiclyVisible ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {publiclyVisible ? '🌍 widoczny publicznie' : '🔒 niewidoczny'}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border bg-white p-5">
        <h2 className="mb-2 font-semibold">Kompletność (wymogi twarde)</h2>
        <ul className="space-y-1 text-sm">
          {checklist.map((item) => (
            <li key={item.code} className={item.ok ? 'text-green-700' : 'text-red-600'}>
              {item.ok ? '✅' : '❌'} {item.label}
            </li>
          ))}
        </ul>
      </section>

      {publication?.reviewNote && (
        <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <h2 className="mb-1 text-sm font-semibold text-orange-900">
            Aktualna notatka recenzji (widoczna dla właściciela)
          </h2>
          <p className="whitespace-pre-wrap text-sm text-orange-800">
            {publication.reviewNote}
          </p>
        </section>
      )}

      <section className="mt-4 rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Akcje moderacyjne</h2>
        <PublicationModerationControls masterId={master.id} actions={actions} />
      </section>

      <section className="mt-4 rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Historia publikacji</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-gray-400">Brak zdarzeń.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audit.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="font-medium text-gray-800">
                  {AUDIT_LABELS_PL[entry.eventType] ?? entry.eventType}
                  <span className="ml-2 font-normal text-gray-400">
                    {new Date(entry.createdAt).toLocaleString('pl-PL')}
                    {' · '}
                    {entry.actorPresent ? 'z kontem sprawcy' : 'sprawca systemowy/usunięty'}
                  </span>
                </p>
                {entry.reason && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500">
                    {entry.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
