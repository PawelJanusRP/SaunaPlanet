'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { approveSubmission, rejectSubmission } from '@/app/[locale]/(main)/admin/actions'

export default function SubmissionActions({ submissionId }: { submissionId: string }) {
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveSubmission(submissionId)
        toast.success(t('submissionActions.approved'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('submissionActions.approveError'))
      }
    })
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectSubmission(submissionId, note)
        toast.success(t('submissionActions.rejected'))
        setRejecting(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('submissionActions.rejectError'))
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
          placeholder={t('submissionActions.rejectReasonPlaceholder')}
          className="rounded-xl border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isPending}
            className="rounded-xl bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? t('submissionActions.rejecting') : t('submissionActions.confirmReject')}
          </button>
          <button
            onClick={() => setRejecting(false)}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {t('submissionActions.cancel')}
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
        {isPending ? '...' : t('submissionActions.approve')}
      </button>
      <button
        onClick={() => setRejecting(true)}
        disabled={isPending}
        className="rounded-xl border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {t('submissionActions.reject')}
      </button>
    </div>
  )
}
