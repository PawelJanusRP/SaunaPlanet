'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import {
  resolveMasterEventProposal,
  type ParticipationRole,
} from '@/app/[locale]/events/participationActions'

const ROLE_VALUES: ParticipationRole[] = ['lead', 'assistant', 'guest']

/**
 * SP-037B slice 3: staff resolution of a master-created event proposal —
 * one atomic RPC call (event + organizer participation together). The
 * database, not this component, is the authorization and concurrency
 * boundary; a concurrently resolved proposal surfaces as a clean error.
 */
export default function EventProposalActions({ eventId }: { eventId: string }) {
  const t = useTranslations('workspace')
  const router = useRouter()
  const [role, setRole] = useState<ParticipationRole>('lead')
  const [isPending, startTransition] = useTransition()

  function handle(decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const result = await resolveMasterEventProposal(
        eventId,
        decision,
        decision === 'approved' ? role : undefined
      )
      if (result.error) {
        toast.error(result.error)
        router.refresh() // stale/concurrent case: repaint the queue
        return
      }
      if (decision === 'approved') {
        toast.success(t('eventProposalActions.publishedToast'))
      } else {
        toast.error(t('eventProposalActions.rejectedToast'))
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as ParticipationRole)}
        className="rounded-lg border px-2 py-1.5 text-xs"
        aria-label={t('eventProposalActions.ariaRole')}
      >
        {ROLE_VALUES.map((value) => (
          <option key={value} value={value}>{t(`roles.${value}`)}</option>
        ))}
      </select>
      <button
        onClick={() => handle('approved')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        {t('eventProposalActions.approve')}
      </button>
      <button
        onClick={() => handle('rejected')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        {t('eventProposalActions.reject')}
      </button>
    </div>
  )
}
