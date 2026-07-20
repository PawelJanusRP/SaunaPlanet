'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  inviteMasterToEvent,
  type ParticipationRole,
} from '@/app/events/participationActions'
import FacilityCombobox from '@/components/FacilityCombobox'

export type InvitableEvent = { id: string; title: string; eventDate: string; saunaName: string | null }
export type InvitableMaster = {
  id: string
  name: string
  level: string | null
  avatarUrl: string | null
}

const ROLE_OPTIONS: { value: ParticipationRole; label: string }[] = [
  { value: 'lead', label: 'Lead (prowadzący)' },
  { value: 'assistant', label: 'Assistant (wsparcie)' },
  { value: 'guest', label: 'Guest (gościnnie)' },
]

/**
 * SP-037B slice 5 (rule D): the facility invites a master to a specific
 * future event with an offered role — the master must accept; nothing
 * appears on the public lineup from this form alone. The database
 * contract (invitation policy + frozen offered role + invited-master
 * resolution) is the boundary.
 */
export default function InviteMasterToEventForm({
  events,
  masters,
}: {
  events: InvitableEvent[]
  masters: InvitableMaster[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eventId, setEventId] = useState('')
  const [masterId, setMasterId] = useState<string | null>(null)
  const [role, setRole] = useState<ParticipationRole>('lead')

  const selectedMaster = masterId ? masters.find((m) => m.id === masterId) ?? null : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId) { toast.error('Wybierz wydarzenie'); return }
    if (!masterId) { toast.error('Wybierz saunamistrza'); return }

    setSaving(true)
    const result = await inviteMasterToEvent(eventId, masterId, role)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      router.refresh()
      return
    }
    toast.success('Zaproszenie wysłane — saunamistrz musi je przyjąć')
    setOpen(false)
    setEventId('')
    setMasterId(null)
    setRole('lead')
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50"
      >
        📨 Zaproś saunamistrza
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Zaproś saunamistrza</h2>
            <p className="text-sm text-gray-500">
              Saunamistrz pojawi się w lineupie dopiero po przyjęciu
              zaproszenia — z dokładnie zaoferowaną rolą.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-gray-500">✕</button>
        </div>

        <div className="space-y-3">
          <select
            className="w-full rounded-xl border p-3 text-sm"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            aria-label="Wydarzenie"
          >
            <option value="">— wybierz wydarzenie —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} · {ev.eventDate}{ev.saunaName ? ` · ${ev.saunaName}` : ''}
              </option>
            ))}
          </select>

          <FacilityCombobox
            saunas={masters.map((m) => ({ id: m.id, name: m.name, city: m.level }))}
            value={masterId}
            onChange={setMasterId}
            placeholder="Wpisz imię saunamistrza"
            emptyLabel="Nie znaleziono saunamistrza"
            groupWhenEmpty={false}
            ariaLabel="Saunamistrz do zaproszenia"
          />

          {selectedMaster && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
              {selectedMaster.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedMaster.avatarUrl} alt={selectedMaster.name} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200">🧖</div>
              )}
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{selectedMaster.name}</p>
                <p className="text-xs text-gray-500">
                  {selectedMaster.level ?? 'saunamistrz'} ·{' '}
                  <Link href={`/masters/${selectedMaster.id}`} target="_blank" className="underline">
                    profil
                  </Link>
                </p>
              </div>
            </div>
          )}

          <select
            className="w-full rounded-xl border p-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as ParticipationRole)}
            aria-label="Oferowana rola"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Oferowana rola: {o.label}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? 'Wysyłanie...' : 'Wyślij zaproszenie'}
          </button>
        </div>
      </form>
    </div>
  )
}
