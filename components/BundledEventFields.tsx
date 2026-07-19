'use client'

/**
 * SP-037B slice 4: event fields for a bundled facility submission (rule A)
 * — shared by the map form and /submit. Verified masters only (the caller
 * gates rendering; the server action and RLS re-verify).
 */

export type BundledEventDraft = {
  title: string
  eventDate: string
  eventTime: string
  price: string
  maxParticipants: string
  description: string
}

export const EMPTY_BUNDLED_EVENT: BundledEventDraft = {
  title: '',
  eventDate: '',
  eventTime: '',
  price: '',
  maxParticipants: '',
  description: '',
}

export default function BundledEventFields({
  value,
  onChange,
}: {
  value: BundledEventDraft
  onChange: (v: BundledEventDraft) => void
}) {
  const set = (patch: Partial<BundledEventDraft>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
      <p className="text-xs text-orange-800">
        🔥 <span className="font-semibold">Wydarzenie dołączone do zgłoszenia.</span>{' '}
        Całość trafia do moderacji platformy — po zatwierdzeniu obiekt i
        wydarzenie opublikują się <span className="font-semibold">razem</span>,
        a Ty zostaniesz organizatorem wydarzenia (rola: lead). Zgłoszenie nie
        daje żadnych praw do zarządzania obiektem.
      </p>

      <input
        className="w-full rounded-xl border bg-white p-2.5 text-sm"
        placeholder="Nazwa wydarzenia, np. Noc saunowa"
        value={value.title}
        onChange={(e) => set({ title: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className="w-full rounded-xl border bg-white p-2.5 text-sm"
          value={value.eventDate}
          onChange={(e) => set({ eventDate: e.target.value })}
        />
        <input
          type="time"
          className="w-full rounded-xl border bg-white p-2.5 text-sm"
          value={value.eventTime}
          onChange={(e) => set({ eventTime: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          className="w-full rounded-xl border bg-white p-2.5 text-sm"
          placeholder="Cena, np. 120 zł"
          value={value.price}
          onChange={(e) => set({ price: e.target.value })}
        />
        <input
          type="number"
          min={1}
          className="w-full rounded-xl border bg-white p-2.5 text-sm"
          placeholder="Limit miejsc"
          value={value.maxParticipants}
          onChange={(e) => set({ maxParticipants: e.target.value })}
        />
      </div>

      <textarea
        className="min-h-20 w-full rounded-xl border bg-white p-2.5 text-sm"
        placeholder="Opis wydarzenia"
        value={value.description}
        onChange={(e) => set({ description: e.target.value })}
      />
    </div>
  )
}
