'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { approveSubmission, rejectSubmission } from '@/app/(main)/admin/actions'

export default function SubmissionActions({ submissionId }: { submissionId: string }) {
  const [isPending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveSubmission(submissionId)
        toast.success('Sauna zatwierdzona i dodana do mapy')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zatwierdzania')
      }
    })
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectSubmission(submissionId, note)
        toast.success('Zgłoszenie odrzucone')
        setRejecting(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd odrzucania')
      }
    })
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Powód odrzucenia (opcjonalnie)"
          className="rounded-xl border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isPending}
            className="rounded-xl bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Odrzucanie...' : 'Potwierdź odrzucenie'}
          </button>
          <button
            onClick={() => setRejecting(false)}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Anuluj
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="rounded-xl bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isPending ? '...' : '✓ Zatwierdź'}
      </button>
      <button
        onClick={() => setRejecting(true)}
        disabled={isPending}
        className="rounded-xl border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        ✕ Odrzuć
      </button>
    </div>
  )
}
