'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { setPrimaryAffiliation } from '@/app/[locale]/(main)/studio/actions'

/** Marks an approved affiliation as the master's primary one. */
export default function SetPrimaryAffiliationButton({ affiliationId }: { affiliationId: string }) {
  const t = useTranslations('studio')
  const [isPending, startTransition] = useTransition()

  function handleSet() {
    startTransition(async () => {
      try {
        await setPrimaryAffiliation(affiliationId)
        toast.success(t('setPrimary.setToast'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('setPrimary.saveError'))
      }
    })
  }

  return (
    <button
      onClick={handleSet}
      disabled={isPending}
      className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
    >
      {isPending ? t('setPrimary.pending') : t('setPrimary.setButton')}
    </button>
  )
}
