'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { endAffiliation } from '@/app/[locale]/(main)/studio/actions'

/**
 * Ends an affiliation with a two-tap confirm: withdrawal of an own pending
 * handshake or ending an active relationship — the label tells which.
 */
export default function EndAffiliationButton({
  affiliationId,
  label,
  confirmLabel,
}: {
  affiliationId: string
  label?: string
  confirmLabel?: string
}) {
  const t = useTranslations('studio')
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  const resolvedLabel = label ?? t('endAffiliation.defaultLabel')
  const resolvedConfirmLabel = confirmLabel ?? t('endAffiliation.defaultConfirmLabel')

  function handleEnd() {
    startTransition(async () => {
      try {
        await endAffiliation(affiliationId)
        toast.success(t('endAffiliation.endedToast'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('endAffiliation.saveError'))
      } finally {
        setConfirming(false)
      }
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
      >
        {resolvedLabel}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={handleEnd}
        disabled={isPending}
        className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {isPending ? t('endAffiliation.pending') : resolvedConfirmLabel}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        {t('endAffiliation.cancel')}
      </button>
    </span>
  )
}
