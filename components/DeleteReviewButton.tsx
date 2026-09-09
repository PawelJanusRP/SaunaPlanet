'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { deleteReviewAdmin } from '@/app/[locale]/(main)/admin/actions'

export default function DeleteReviewButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations('admin')
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteReviewAdmin(reviewId)
        toast.success(t('deleteReview.deleted'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('deleteReview.deleteError'))
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
        {t('deleteReview.delete')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-red-600">{t('deleteReview.confirm')}</span>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {t('deleteReview.yes')}
      </button>
      <button
        onClick={() => setConfirm(false)}
        disabled={isPending}
        className="rounded-lg border px-2.5 py-1 text-xs text-gray-600 disabled:opacity-50"
      >
        {t('deleteReview.no')}
      </button>
    </div>
  )
}
