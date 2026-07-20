'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { respondToEventInvitation } from '@/app/events/participationActions'

/**
 * SP-037B slice 5: the invited master accepts or declines. Acceptance
 * keeps the exact offered role (frozen by the database guard); rejection
 * follows the invariant. Refreshes on success AND on stale errors.
 */
export default function InvitationResponseButtons({
  invitationId,
  offeredRole,
}: {
  invitationId: string
  offeredRole: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle(decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const result = await respondToEventInvitation(invitationId, decision)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
        return
      }
      if (decision === 'approved') {
        toast.success(`Zaproszenie przyjęte — występujesz w roli ${offeredRole ?? 'lead'}`)
      } else {
        toast.error('Zaproszenie odrzucone')
      }
      router.refresh()
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handle('approved')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        Przyjmij ({offeredRole ?? 'lead'})
      </button>
      <button
        onClick={() => handle('rejected')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        Odrzuć
      </button>
    </div>
  )
}
