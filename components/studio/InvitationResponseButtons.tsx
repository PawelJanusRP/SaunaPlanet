'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import { respondToEventInvitation } from '@/app/[locale]/events/participationActions'

/**
 * SP-037B slice 5: the invited master accepts or declines. Acceptance
 * keeps the exact offered role (frozen by the database guard); rejection
 * follows the invariant. Refreshes on success AND on stale errors.
 */
export default function InvitationResponseButtons({
  invitationId,
  offeredRole,
}: {
  invitationId: string
  offeredRole: string | null
}) {
  const t = useTranslations('studio')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle(decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const result = await respondToEventInvitation(invitationId, decision)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
        return
      }
      if (decision === 'approved') {
        toast.success(t('invitationResponse.acceptedToast', { role: offeredRole ?? 'lead' }))
      } else {
        toast.error(t('invitationResponse.rejectedToast'))
      }
      router.refresh()
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handle('approved')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        {t('invitationResponse.accept', { role: offeredRole ?? 'lead' })}
      </button>
      <button
        onClick={() => handle('rejected')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        {t('invitationResponse.reject')}
      </button>
    </div>
  )
}
