'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { endAffiliation } from '@/app/(main)/studio/actions'

/**
 * Ends an affiliation with a two-tap confirm: withdrawal of an own pending
 * handshake or ending an active relationship — the label tells which.
 */
export default function EndAffiliationButton({
  affiliationId,
  label = 'Zakończ',
  confirmLabel = 'Na pewno zakończ',
}: {
  affiliationId: string
  label?: string
  confirmLabel?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleEnd() {
    startTransition(async () => {
      try {
        await endAffiliation(affiliationId)
        toast.success('Afiliacja zakończona')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
      } finally {
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
      >
        {label}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={handleEnd}
        disabled={isPending}
        className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {isPending ? '...' : confirmLabel}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        Anuluj
      </button>
    </span>
  )
}
