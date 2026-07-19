'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { approveFacility, rejectFacility } from '@/app/saunas/actions'

/**
 * SP-036 slice 2: approve/reject for pending facility submissions.
 * Approval goes through the approve_facility_submission RPC (via the
 * shared server action), which also activates eligible bundled master
 * events — never a bare status update.
 */
export default function FacilityModerationActions({ saunaId }: { saunaId: string }) {
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
          `Obiekt zatwierdzony · opublikowano eventy: ${result.activatedEvents}` +
            ((result.approvedParticipations ?? 0) > 0
              ? ` · organizator dołączył do lineupu (lead)`
              : '') +
            ((result.skippedEvents ?? 0) > 0
              ? ` · pominięto niekwalifikujące się: ${result.skippedEvents}`
              : '')
        )
      } else {
        toast.success('Obiekt zatwierdzony')
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
          ? `Zgłoszenie odrzucone wraz z dołączonym eventem (${result.rejectedEvents})`
          : 'Zgłoszenie odrzucone'
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
        Zatwierdź
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        Odrzuć
      </button>
    </div>
  )
}
