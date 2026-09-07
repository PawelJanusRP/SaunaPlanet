'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  submitOwnMasterForPublication,
  unpublishOwnMasterProfile,
  withdrawOwnMasterSubmission,
} from '@/app/(main)/studio/publicationActions'
import {
  PUBLICATION_MISSING_FIELD_LABELS_PL,
  type PublicationTransitionResult,
} from '@/lib/master/publicationTransitions'
import type { OwnerPublicationAction } from '@/lib/master/publicationView'

/**
 * Owner-side transition buttons for the Studio publication card. Which
 * buttons render is decided server-side from the live publication state
 * (lib/master/publicationView matrix); the RPC remains the authority — an
 * out-of-date button simply returns a stable already/invalid code.
 */
export default function OwnerPublicationActions({
  actions,
}: {
  actions: OwnerPublicationAction[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [missing, setMissing] = useState<string[]>([])

  function run(action: () => Promise<PublicationTransitionResult>) {
    startTransition(async () => {
      const result = await action()
      if (result.code === 'profile_incomplete') {
        setMissing(
          result.missing.map((code) => PUBLICATION_MISSING_FIELD_LABELS_PL[code])
        )
        toast.error(result.message)
        return
      }
      setMissing([])
      if (result.ok) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
      router.refresh()
    })
  }

  if (actions.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.includes('submit') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => submitOwnMasterForPublication())}
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
          >
            {isPending ? 'Wysyłanie…' : '📤 Zgłoś do publikacji'}
          </button>
        )}
        {actions.includes('withdraw') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => withdrawOwnMasterSubmission())}
            className="rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            {isPending ? 'Wycofywanie…' : '↩️ Wycofaj zgłoszenie'}
          </button>
        )}
        {actions.includes('unpublish') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => unpublishOwnMasterProfile())}
            className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
          >
            {isPending ? 'Wycofywanie…' : '🚫 Wycofaj z publikacji'}
          </button>
        )}
      </div>
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">Uzupełnij przed zgłoszeniem:</p>
          <ul className="mt-1 list-inside list-disc">
            {missing.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
