'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import AddEventModal from '@/components/AddEventModal'

/**
 * Owner Workspace entry point for event creation (SP-034). Reuses the shared
 * AddEventModal; the facility comes from the resolved active context, never
 * from user input — the server action re-verifies membership regardless.
 */
export default function OwnerCreateEventButton({
  saunaId,
  saunaName,
}: {
  saunaId: string
  saunaName: string
}) {
  const t = useTranslations('workspace')
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700"
      >
        {t('createEvent.add')}
      </button>
      {open && (
        <AddEventModal
          saunaId={saunaId}
          saunaName={saunaName}
          onClose={() => setOpen(false)}
          onAdded={() => router.refresh()}
        />
      )}
    </>
  )
}
