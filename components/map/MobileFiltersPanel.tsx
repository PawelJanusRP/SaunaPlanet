'use client'

// SP-045 Slice C — compact mobile filters bottom sheet. Owns no state; the map
// passes the current values + setters. Exposes exactly the controls that were
// in the permanent desktop bars + the old mobile sheet (map mode, category,
// feature filters, radius) so nothing is lost. Changes apply immediately.

import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  mapMode: 'saunas' | 'events' | 'all'
  setMapMode: (m: 'saunas' | 'events' | 'all') => void
  categoryFilter: string
  setCategoryFilter: (c: string) => void
  onlyWithPhotos: boolean
  setOnlyWithPhotos: (v: boolean) => void
  onlyWithEvents: boolean
  setOnlyWithEvents: (v: boolean) => void
  radiusKm: number
  setRadiusKm: (r: number) => void
  hasActiveFilters: boolean
  onReset: () => void
}

const MODES: { value: 'all' | 'saunas' | 'events'; label: string }[] = [
  { value: 'all', label: '🧖+🔥 Wszystko' },
  { value: 'saunas', label: '🧖 Sauny' },
  { value: 'events', label: '🔥 Eventy' },
]
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'Wszystko' },
  { value: 'public_sauna', label: '🧖 Publiczna' },
  { value: 'spa', label: '♨️ SPA' },
  { value: 'hotel', label: '🏨 Hotel' },
  { value: 'event', label: '🔥 Event' },
  { value: 'outdoor', label: '🌲 Plenerowa' },
]
const RADII = [3, 10, 30, 100]

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold transition ${
    active ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
  }`

export default function MobileFiltersPanel(p: Props) {
  if (!p.open) return null
  return (
    <div className="fixed inset-0 z-[11000] lg:hidden" role="dialog" aria-modal="true" aria-label="Filtry">
      <div className="absolute inset-0 bg-black/30" onClick={p.onClose} aria-hidden="true" />
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Filtry</h2>
          <div className="flex items-center gap-1">
            {p.hasActiveFilters && (
              <button
                type="button"
                onClick={p.onReset}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
              >
                Wyczyść
              </button>
            )}
            <button
              type="button"
              onClick={p.onClose}
              aria-label="Zamknij filtry"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <Section title="Tryb mapy">
          {MODES.map((m) => (
            <button key={m.value} type="button" onClick={() => p.setMapMode(m.value)} className={chip(p.mapMode === m.value)}>
              {m.label}
            </button>
          ))}
        </Section>

        <Section title="Kategoria">
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" onClick={() => p.setCategoryFilter(c.value)} className={chip(p.categoryFilter === c.value)}>
              {c.label}
            </button>
          ))}
        </Section>

        <Section title="Filtry">
          <button type="button" onClick={() => p.setOnlyWithPhotos(!p.onlyWithPhotos)} className={chip(p.onlyWithPhotos)}>
            📷 Ze zdjęciem
          </button>
          <button type="button" onClick={() => p.setOnlyWithEvents(!p.onlyWithEvents)} className={chip(p.onlyWithEvents)}>
            🔥 Event w 7 dni
          </button>
        </Section>

        <Section title="Promień">
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => p.setRadiusKm(r)} className={chip(p.radiusKm === r)}>
              {r} km
            </button>
          ))}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
