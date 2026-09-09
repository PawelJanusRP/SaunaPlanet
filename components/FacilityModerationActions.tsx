'use client'

import { useTransition } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { approveFacility, rejectFacility } from '@/app/saunas/actions'

/**
 * SP-036 slice 2: approve/reject for pending facility submissions.
 * Approval goes through the approve_facility_submission RPC (via the
 * shared server action), which also activates eligible bundled master
 * events — never a bare status update.
 */
export default function FacilityModerationActions({ saunaId }: { saunaId: string }) {
  const t = useTranslations('admin')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      const result = await approveFacility(saunaId)
      if (result.error) {
        // stale/already-resolved submissions surface here as a clean
        // message — repaint so the queue reflects reality
        toast.error(result.error)
        router.refresh()
        return
      }
      if ((result.activatedEvents ?? 0) > 0) {
        toast.success(
          t('facilityModeration.approvedWithEvents', { count: result.activatedEvents ?? 0 }) +
            ((result.approvedParticipations ?? 0) > 0
              ? t('facilityModeration.organizerJoined')
              : '') +
            ((result.skippedEvents ?? 0) > 0
              ? t('facilityModeration.skippedEvents', { count: result.skippedEvents ?? 0 })
              : '')
        )
      } else {
        toast.success(t('facilityModeration.approved'))
      }
      router.refresh()
    })
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectFacility(saunaId)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
        return
      }
      toast.error(
        (result.rejectedEvents ?? 0) > 0
          ? t('facilityModeration.rejectedWithEvent', { count: result.rejectedEvents ?? 0 })
          : t('facilityModeration.rejected')
      )
      router.refresh()
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        {t('facilityModeration.approve')}
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        {t('facilityModeration.reject')}
      </button>
    </div>
  )
}
