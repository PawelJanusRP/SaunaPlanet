'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  approveMasterPublication,
  requestMasterPublicationChanges,
  restoreMasterPublication,
  suspendMasterPublication,
  unpublishMasterAsModerator,
} from '@/app/(main)/admin/masters/publication/actions'
import type { PublicationTransitionResult } from '@/lib/master/publicationTransitions'
import {
  MODERATOR_ACTIONS_REQUIRING_REASON,
  type ModeratorPublicationAction,
} from '@/lib/master/publicationView'

const ACTION_LABELS: Record<ModeratorPublicationAction, string> = {
  approve: '✅ Zatwierdź publikację',
  request_changes: '✏️ Poproś o zmiany',
  unpublish: '🚫 Wycofaj z publikacji',
  suspend: '⛔ Zawieś publikację',
  restore: '♻️ Przywróć do wersji roboczej',
}

/**
 * Moderator transition controls. Rendered actions come from the live state
 * via the shared M10 matrix; the RPCs stay authoritative (a stale button
 * returns a stable already/invalid code, never a fabricated transition).
 * The reason is REQUIRED exactly where the database requires it and bounded
 * to the 2000-character contract.
 */
export default function PublicationModerationControls({
  masterId,
  actions,
}: {
  masterId: string
  actions: ModeratorPublicationAction[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState('')

  function run(action: ModeratorPublicationAction) {
    const trimmed = reason.trim()
    if (MODERATOR_ACTIONS_REQUIRING_REASON.includes(action) && trimmed === '') {
      toast.error('Podaj uzasadnienie tej operacji.')
      return
    }
    startTransition(async () => {
      let result: PublicationTransitionResult
      switch (action) {
        case 'approve':
          result = await approveMasterPublication(masterId, trimmed || undefined)
          break
        case 'request_changes':
          result = await requestMasterPublicationChanges(masterId, trimmed)
          break
        case 'unpublish':
          result = await unpublishMasterAsModerator(masterId, trimmed || undefined)
          break
        case 'suspend':
          result = await suspendMasterPublication(masterId, trimmed)
          break
        case 'restore':
          result = await restoreMasterPublication(masterId, trimmed)
          break
      }
      if (result.ok) {
        toast.success(result.message)
        setReason('')
      } else {
        toast.error(result.message)
      }
      router.refresh()
    })
  }

  if (actions.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Brak dostępnych akcji moderacyjnych w obecnym stanie publikacji.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">
          Uzasadnienie / notatka dla właściciela
          {actions.some((a) => MODERATOR_ACTIONS_REQUIRING_REASON.includes(a)) &&
            ' (wymagane dla próśb o zmiany, zawieszenia i przywrócenia)'}
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Widoczne dla właściciela profilu — nigdy publicznie."
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={isPending}
            onClick={() => run(action)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              action === 'approve'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : action === 'suspend'
                  ? 'border border-red-300 text-red-700 hover:bg-red-50'
                  : 'border hover:bg-gray-100'
            }`}
          >
            {isPending ? '…' : ACTION_LABELS[action]}
          </button>
        ))}
      </div>
    </div>
  )
}
