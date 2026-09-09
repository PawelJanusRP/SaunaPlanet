'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateRegistrationStatus } from '@/app/[locale]/events/actions'
import { toast } from 'sonner'

export default function RegistrationModerationActions({ registrationId }: { registrationId: string }) {
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()

  function handle(status: 'confirmed' | 'cancelled') {
    startTransition(async () => {
      try {
        await updateRegistrationStatus(registrationId, status)
        toast.success(status === 'confirmed' ? t('registrationModeration.confirmed') : t('registrationModeration.rejected'))
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : t('registrationModeration.error'))
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handle('confirmed')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        {t('registrationModeration.confirm')}
      </button>
      <button
        onClick={() => handle('cancelled')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        {t('registrationModeration.reject')}
      </button>
    </div>
  )
}
