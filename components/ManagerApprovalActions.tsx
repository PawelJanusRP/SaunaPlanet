'use client'

import { useTransition } from 'react'
import { approveManagerRequest, rejectManagerRequest } from '@/app/(main)/admin/actions'
import { toast } from 'sonner'

export default function ManagerApprovalActions({ managerId }: { managerId: string }) {
  const [isPending, startTransition] = useTransition()

  function handle(action: 'approve' | 'reject') {
    startTransition(async () => {
      try {
        if (action === 'approve') {
          await approveManagerRequest(managerId)
          toast.success('Manager zatwierdzony')
        } else {
          await rejectManagerRequest(managerId)
          toast.error('Wniosek odrzucony')
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Błąd')
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handle('approve')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        Zatwierdź
      </button>
      <button
        onClick={() => handle('reject')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        Odrzuć
      </button>
    </div>
  )
}
