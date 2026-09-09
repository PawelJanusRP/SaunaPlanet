'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { withdrawMasterEventProposal } from '@/app/[locale]/events/participationActions'

/**
 * SP-037B: withdraws a pending master-event PROPOSAL — deletes the whole
 * event (the organizer pair follows via cascade), unlike withdrawing an
 * ordinary participation request.
 */
export default function WithdrawProposalButton({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const t = useTranslations('studio')
  const [isPending, startTransition] = useTransition()

  function handleWithdraw() {
    if (!confirm(t('withdrawProposal.confirm', { title: eventTitle }))) {
      return
    }
    startTransition(async () => {
      const result = await withdrawMasterEventProposal(eventId)
      if (result.error) toast.error(result.error)
      else toast.success(t('withdrawProposal.withdrawnToast'))
    })
  }

  return (
    <button
      onClick={handleWithdraw}
      disabled={isPending}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      {t('withdrawProposal.button')}
    </button>
  )
}
