'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  requestEventParticipation,
  withdrawEventParticipation,
} from '@/app/events/participationActions'

/**
 * SP-037: the master-facing state of event participation, rendered on the
 * event page for verified masters. Visibility gating happens server-side;
 * the database (RLS + guard triggers) stays the security boundary.
 */
export default function EventParticipationControls({
  eventId,
  assignment,
}: {
  eventId: string
  assignment: { id: string; status: string; role: string | null } | null
}) {
  const [isPending, startTransition] = useTransition()

  function handleRequest() {
    startTransition(async () => {
      const result = await requestEventParticipation(eventId)
      if (result.error) toast.error(result.error)
      else toast.success('Zgłoszenie wysłane — obiekt zdecyduje o Twoim udziale')
    })
  }

  function handleWithdraw() {
    if (!assignment) return
    startTransition(async () => {
      const result = await withdrawEventParticipation(assignment.id)
      if (result.error) toast.error(result.error)
      else toast.success('Zgłoszenie wycofane')
    })
  }

  if (!assignment) {
    return (
      <button
        onClick={handleRequest}
        disabled={isPending}
        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        🧖 Zgłoś udział jako saunamistrz
      </button>
    )
  }

  if (assignment.status === 'pending') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-700">
          ⏳ Zgłoszenie oczekuje na decyzję obiektu
        </span>
        <button
          onClick={handleWithdraw}
          disabled={isPending}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          Wycofaj
        </button>
      </div>
    )
  }

  if (assignment.status === 'approved') {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
        ✓ Występujesz na tym wydarzeniu{assignment.role ? ` (${assignment.role})` : ''}
      </span>
    )
  }

  // rejected
  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
      ✗ Zgłoszenie odrzucone przez obiekt
    </span>
  )
}
