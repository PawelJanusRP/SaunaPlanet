'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  resolveEventParticipation,
  type ParticipationRole,
} from '@/app/events/participationActions'

const ROLE_OPTIONS: { value: ParticipationRole; label: string }[] = [
  { value: 'lead', label: 'Lead (prowadzący)' },
  { value: 'assistant', label: 'Assistant (wsparcie)' },
  { value: 'guest', label: 'Guest (gościnnie)' },
]

/**
 * SP-037: staff-side resolution of a master participation request.
 * Approval requires choosing a role — enforced again by the database
 * guard trigger (role vocabulary + trusted approved_at).
 */
export default function ParticipationModerationActions({
  assignmentId,
}: {
  assignmentId: string
}) {
  const [role, setRole] = useState<ParticipationRole>('lead')
  const [isPending, startTransition] = useTransition()

  function handle(decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const result = await resolveEventParticipation(
        assignmentId,
        decision,
        decision === 'approved' ? role : undefined
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (decision === 'approved') toast.success('Saunamistrz dołączył do wydarzenia')
      else toast.error('Zgłoszenie odrzucone')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as ParticipationRole)}
        className="rounded-lg border px-2 py-1.5 text-xs"
        aria-label="Rola saunamistrza"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        onClick={() => handle('approved')}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
      >
        Zatwierdź
      </button>
      <button
        onClick={() => handle('rejected')}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
      >
        Odrzuć
      </button>
    </div>
  )
}
