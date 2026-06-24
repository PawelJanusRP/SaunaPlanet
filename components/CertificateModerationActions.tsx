'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { approveCertificate, rejectCertificate } from '@/app/(main)/admin/actions'

export default function CertificateModerationActions({ certId }: { certId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveCertificate(certId)
        toast.success('Certyfikat zatwierdzony')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zatwierdzania')
      }
    })
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectCertificate(certId)
        toast.success('Certyfikat odrzucony')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd odrzucania')
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="rounded-xl bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isPending ? '...' : '✓ Zatwierdź'}
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-xl border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        ✕ Odrzuć
      </button>
    </div>
  )
}
