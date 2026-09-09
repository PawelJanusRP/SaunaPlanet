'use client'

// SP-045 — compact floating map controls, shared across ALL breakpoints
// (desktop parity). Four safe-area-aware corner controls (44px targets) that
// keep the map the dominant surface. Business logic stays in the caller; this
// component only renders the controls and forwards intent.

import { Menu, Search, SlidersHorizontal, LocateFixed } from 'lucide-react'

type Props = {
  onSearch: () => void
  onFilters: () => void
  onMenu: () => void
  onGeolocate: () => void
  /** Show a dot on Filters when any filter differs from its default. */
  filtersActive?: boolean
}

// Shared on every breakpoint, with pointer affordances for desktop.
const BTN =
  'flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-800 shadow-lg ' +
  'ring-1 ring-black/5 transition active:scale-95 cursor-pointer hover:bg-gray-50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 absolute z-[10000]'

// Safe-area-aware corner offsets (notch / home indicator).
const TL = { top: 'calc(env(safe-area-inset-top) + 0.75rem)', left: 'calc(env(safe-area-inset-left) + 0.75rem)' }
const TR = { top: 'calc(env(safe-area-inset-top) + 0.75rem)', right: 'calc(env(safe-area-inset-right) + 0.75rem)' }
const BL = { bottom: 'calc(env(safe-area-inset-bottom) + 1rem)', left: 'calc(env(safe-area-inset-left) + 0.75rem)' }
const BR = { bottom: 'calc(env(safe-area-inset-bottom) + 1rem)', right: 'calc(env(safe-area-inset-right) + 0.75rem)' }

export default function MapControls({
  onSearch,
  onFilters,
  onMenu,
  onGeolocate,
  filtersActive = false,
}: Props) {
  return (
    <>
      <button type="button" onClick={onFilters} aria-label="Filtry" title="Filtry" className={BTN} style={TL}>
        <SlidersHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />
        {filtersActive && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-orange-500"
          />
        )}
      </button>

      <button type="button" onClick={onMenu} aria-label="Menu" title="Menu" className={BTN} style={TR}>
        <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>

      <button type="button" onClick={onSearch} aria-label="Szukaj" title="Szukaj" className={BTN} style={BL}>
        <Search className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>

      <button type="button" onClick={onGeolocate} aria-label="Moja lokalizacja" title="Moja lokalizacja" className={BTN} style={BR}>
        <LocateFixed className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>
    </>
  )
}
