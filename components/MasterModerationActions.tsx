'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { approveMaster, rejectMaster } from '@/app/[locale]/(main)/admin/actions'

export default function MasterModerationActions({ masterId }: { masterId: string }) {
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveMaster(masterId)
        toast.success(t('masterModeration.approved'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('masterModeration.approveError'))
      }
    })
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectMaster(masterId, note)
        toast.success(t('masterModeration.rejected'))
        setRejecting(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('masterModeration.rejectError'))
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
          placeholder={t('masterModeration.rejectReasonPlaceholder')}
          className="rounded-xl border px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isPending}
            className="rounded-xl bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? t('masterModeration.rejecting') : t('masterModeration.confirmReject')}
          </button>
          <button
            onClick={() => setRejecting(false)}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {t('masterModeration.cancel')}
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
        {isPending ? '...' : t('masterModeration.approve')}
      </button>
      <button
        onClick={() => setRejecting(true)}
        disabled={isPending}
        className="rounded-xl border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {t('masterModeration.reject')}
      </button>
    </div>
  )
}
