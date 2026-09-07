import Link from 'next/link'
import OwnerPublicationActions from '@/components/studio/OwnerPublicationActions'
import type { PublicationStatus } from '@/lib/master/publicationTransitions'
import {
  PUBLICATION_STATUS_HINTS_PL,
  PUBLICATION_STATUS_LABELS_PL,
  needsMaterialEditWarning,
  resolveOwnerPublicationActions,
  type HardChecklistItem,
} from '@/lib/master/publicationView'

/**
 * Studio publication dashboard card (server component). All data is loaded
 * by the page from the RLS-visible publication row + the M9 visibility
 * helper; nothing here re-derives visibility or transition rules.
 */
export default function PublicationStatusCard({
  publicationStatus,
  publiclyVisible,
  masterPendingModeration,
  checklist,
  completenessScore,
  recommended,
  reviewNote,
  previewHref,
}: {
  publicationStatus: PublicationStatus
  publiclyVisible: boolean
  masterPendingModeration: boolean
  checklist: HardChecklistItem[]
  completenessScore: number
  recommended: { key: string; label: string; done: boolean }[]
  reviewNote: string | null
  previewHref: string
}) {
  const actions = resolveOwnerPublicationActions(publicationStatus)
  const missingCount = checklist.filter((i) => !i.ok).length
  const showReviewNote =
    reviewNote !== null &&
    (publicationStatus === 'changes_requested' ||
      publicationStatus === 'suspended')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
          {PUBLICATION_STATUS_LABELS_PL[publicationStatus]}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            publiclyVisible
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {publiclyVisible ? '🌍 Widoczny publicznie' : '🔒 Niewidoczny publicznie'}
        </span>
      </div>

      <p className="text-sm text-gray-600">
        {PUBLICATION_STATUS_HINTS_PL[publicationStatus]}
      </p>

      {masterPendingModeration && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          Profil czeka też na zatwierdzenie przez moderację platformy — publikacja
          stanie się widoczna dopiero po obu zatwierdzeniach.
        </div>
      )}

      {showReviewNote && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <p className="font-semibold">Wiadomość od moderacji:</p>
          <p className="mt-1 whitespace-pre-wrap">{reviewNote}</p>
        </div>
      )}

      {needsMaterialEditWarning(publicationStatus) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ Zapisanie zmian w publicznych polach profilu tymczasowo ukryje go z
          katalogu do czasu ponownego zatwierdzenia przez moderację.
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Wymagane do publikacji{' '}
          <span className="font-normal text-gray-400">
            (kompletność profilu: {completenessScore}%)
          </span>
        </p>
        <ul className="space-y-1 text-sm">
          {checklist.map((item) => (
            <li key={item.code} className={item.ok ? 'text-green-700' : 'text-gray-500'}>
              {item.ok ? '✅' : '⬜'} {item.label}
            </li>
          ))}
        </ul>
        {missingCount > 0 && (
          <Link
            href="/studio/profile"
            className="mt-2 inline-block text-sm font-semibold text-orange-700 hover:underline"
          >
            Uzupełnij brakujące pola →
          </Link>
        )}
        {recommended.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-sm font-semibold text-gray-700">
              Zalecane <span className="font-normal text-gray-400">(nie blokują publikacji)</span>
            </p>
            <ul className="space-y-1 text-sm">
              {recommended.map((item) => (
                <li key={item.key} className={item.done ? 'text-green-700' : 'text-gray-400'}>
                  {item.done ? '✅' : '▫️'} {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <OwnerPublicationActions actions={actions} />
        <Link
          href={previewHref}
          className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
        >
          👁️ Podgląd profilu
        </Link>
      </div>
    </div>
  )
}
