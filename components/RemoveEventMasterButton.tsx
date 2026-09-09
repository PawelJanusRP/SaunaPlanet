'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { removeEventMaster } from '@/app/[locale]/events/actions'

export default function RemoveEventMasterButton({
  eventId,
  masterId,
  masterName,
}: {
  eventId: string
  masterId: string
  masterName: string
}) {
  const t = useTranslations('events')
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeEventMaster(eventId, masterId)
        toast.success(t('eventMaster.removeSuccess', { name: masterName }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('eventMaster.removeError'))
      }
    })
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      title={t('eventMaster.removeTitle')}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs text-red-600 hover:bg-red-200 disabled:opacity-50"
    >
      {isPending ? '…' : '×'}
    </button>
  )
}
