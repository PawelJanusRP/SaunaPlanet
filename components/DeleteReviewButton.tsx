'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deleteReviewAdmin } from '@/app/(main)/admin/actions'

export default function DeleteReviewButton({ reviewId }: { reviewId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteReviewAdmin(reviewId)
        toast.success('Recenzja usunięta')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
      }
    })
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        disabled={isPending}
        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Usuń
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-red-600">Na pewno?</span>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Tak
      </button>
      <button
        onClick={() => setConfirm(false)}
        disabled={isPending}
        className="rounded-lg border px-2.5 py-1 text-xs text-gray-600 disabled:opacity-50"
      >
        Nie
      </button>
    </div>
  )
}
