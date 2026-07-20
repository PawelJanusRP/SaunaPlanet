'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { withdrawEventInvitation } from '@/app/events/participationActions'

/**
 * SP-037B slice 5: staff withdraws a pending invitation. MVP limitation
 * (documented): DELETE removes the pending invitation history.
 */
export default function WithdrawInvitationButton({
  invitationId,
  masterName,
}: {
  invitationId: string
  masterName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleWithdraw() {
    if (!confirm(`Wycofać zaproszenie dla „${masterName}”?`)) return
    startTransition(async () => {
      const result = await withdrawEventInvitation(invitationId)
      if (result.error) toast.error(result.error)
      else toast.success('Zaproszenie wycofane')
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleWithdraw}
      disabled={isPending}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      Wycofaj
    </button>
  )
}
