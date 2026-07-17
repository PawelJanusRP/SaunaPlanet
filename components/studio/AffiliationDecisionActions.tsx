'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { respondToAffiliation } from '@/app/(main)/studio/actions'

/**
 * Approve/reject pair for a pending affiliation handshake. Used by BOTH
 * sides of the relationship (the receiving side): the master for facility
 * invitations, facility staff for master requests — one lifecycle, one
 * component. The server action verifies which side may decide.
 */
export default function AffiliationDecisionActions({ affiliationId }: { affiliationId: string }) {
  const [isPending, startTransition] = useTransition()

  function decide(decision: 'approved' | 'rejected') {
    startTransition(async () => {
      try {
        await respondToAffiliation(affiliationId, decision)
        toast.success(decision === 'approved' ? 'Afiliacja zatwierdzona' : 'Afiliacja odrzucona')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
      }
    })
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button
        onClick={() => decide('approved')}
        disabled={isPending}
        className="rounded-xl bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        ✓ Zatwierdź
      </button>
      <button
        onClick={() => decide('rejected')}
        disabled={isPending}
        className="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50"
      >
        ✗ Odrzuć
      </button>
    </div>
  )
}
