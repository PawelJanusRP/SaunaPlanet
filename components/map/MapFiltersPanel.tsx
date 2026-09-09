'use client'

// SP-045 Slice C — compact mobile filters bottom sheet. Owns no state; the map
// passes the current values + setters. Exposes exactly the controls that were
// in the permanent desktop bars + the old mobile sheet (map mode, category,
// feature filters, radius) so nothing is lost. Changes apply immediately.

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

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

// Canonical map-mode / category codes stay language-independent; only the
// presentation label is localized. Emojis are presentation and live here.
const MODES: { value: 'all' | 'saunas' | 'events'; emoji: string }[] = [
  { value: 'all', emoji: '🧖+🔥' },
  { value: 'saunas', emoji: '🧖' },
  { value: 'events', emoji: '🔥' },
]
const CATEGORIES: { value: string; emoji: string }[] = [
  { value: 'all', emoji: '' },
  { value: 'public_sauna', emoji: '🧖' },
  { value: 'spa', emoji: '♨️' },
  { value: 'hotel', emoji: '🏨' },
  { value: 'event', emoji: '🔥' },
  { value: 'outdoor', emoji: '🌲' },
]
const RADII = [3, 10, 30, 100]

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold transition ${
    active ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
  }`

export default function MapFiltersPanel(p: Props) {
  const t = useTranslations('map.filters')
  if (!p.open) return null
  return (
    <div className="fixed inset-0 z-[11000]" role="dialog" aria-modal="true" aria-label={t('title')}>
      {/* Backdrop for click-outside; dimmed on mobile, transparent on desktop. */}
      <div className="absolute inset-0 bg-black/30 lg:bg-transparent" onClick={p.onClose} aria-hidden="true" />
      {/* Mobile: bottom sheet. Desktop parity: a floating panel near the
          top-left Filters control (not a full-width sheet). */}
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl lg:bottom-auto lg:left-4 lg:right-auto lg:top-16 lg:w-[360px] lg:max-h-[75vh] lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{t('title')}</h2>
          <div className="flex items-center gap-1">
            {p.hasActiveFilters && (
              <button
                type="button"
                onClick={p.onReset}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
              >
                {t('clear')}
              </button>
            )}
            <button
              type="button"
              onClick={p.onClose}
              aria-label={t('close')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <Section title={t('mapMode')}>
          {MODES.map((m) => (
            <button key={m.value} type="button" onClick={() => p.setMapMode(m.value)} className={chip(p.mapMode === m.value)}>
              {m.emoji} {t(`modes.${m.value}`)}
            </button>
          ))}
        </Section>

        <Section title={t('category')}>
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" onClick={() => p.setCategoryFilter(c.value)} className={chip(p.categoryFilter === c.value)}>
              {c.emoji ? `${c.emoji} ` : ''}{t(`categories.${c.value}`)}
            </button>
          ))}
        </Section>

        <Section title={t('features')}>
          <button type="button" onClick={() => p.setOnlyWithPhotos(!p.onlyWithPhotos)} className={chip(p.onlyWithPhotos)}>
            📷 {t('withPhoto')}
          </button>
          <button type="button" onClick={() => p.setOnlyWithEvents(!p.onlyWithEvents)} className={chip(p.onlyWithEvents)}>
            🔥 {t('eventWithin7Days')}
          </button>
        </Section>

        <Section title={t('radius')}>
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
