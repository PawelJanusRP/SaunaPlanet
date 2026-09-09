'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import { withdrawEventInvitation } from '@/app/[locale]/events/participationActions'

/**
 * SP-037B slice 5: staff withdraws a pending invitation. MVP limitation
 * (documented): DELETE removes the pending invitation history.
 */
export default function WithdrawInvitationButton({
  invitationId,
  masterName,
}: {
  invitationId: string
  masterName: string
}) {
  const t = useTranslations('workspace')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleWithdraw() {
    if (!confirm(t('withdrawInvitation.confirm', { name: masterName }))) return
    startTransition(async () => {
      const result = await withdrawEventInvitation(invitationId)
      if (result.error) toast.error(result.error)
      else toast.success(t('withdrawInvitation.successToast'))
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleWithdraw}
      disabled={isPending}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      {t('withdrawInvitation.withdraw')}
    </button>
  )
}
