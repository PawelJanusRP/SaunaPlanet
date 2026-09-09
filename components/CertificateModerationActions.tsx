'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { approveCertificate, rejectCertificate } from '@/app/[locale]/(main)/admin/actions'

export default function CertificateModerationActions({ certId }: { certId: string }) {
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveCertificate(certId)
        toast.success(t('certificateModeration.approved'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('certificateModeration.approveError'))
      }
    })
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectCertificate(certId)
        toast.success(t('certificateModeration.rejected'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('certificateModeration.rejectError'))
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
        {isPending ? '...' : t('certificateModeration.approve')}
      </button>
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-xl border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {t('certificateModeration.reject')}
      </button>
    </div>
  )
}
