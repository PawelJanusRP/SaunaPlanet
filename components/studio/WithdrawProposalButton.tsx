'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { withdrawMasterEventProposal } from '@/app/events/participationActions'

/**
 * SP-037B: withdraws a pending master-event PROPOSAL — deletes the whole
 * event (the organizer pair follows via cascade), unlike withdrawing an
 * ordinary participation request.
 */
export default function WithdrawProposalButton({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleWithdraw() {
    if (!confirm(`Wycofać propozycję „${eventTitle}”? Wydarzenie zostanie usunięte.`)) {
      return
    }
    startTransition(async () => {
      const result = await withdrawMasterEventProposal(eventId)
      if (result.error) toast.error(result.error)
      else toast.success('Propozycja wycofana')
    })
  }

  return (
    <button
      onClick={handleWithdraw}
      disabled={isPending}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      Wycofaj propozycję
    </button>
  )
}
