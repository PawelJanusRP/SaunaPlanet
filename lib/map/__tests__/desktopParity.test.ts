// SP-045 desktop parity — contracts pinning the map-first UX across ALL
// breakpoints. One interaction model (floating controls, unified search,
// on-demand filters, compact popup, pictogram actions); desktop adapts the
// *presentation* (floating side panels) without stretching mobile full-screen
// sheets and without touching the SP-045 privacy surface. Text-level contract
// tests: they read the source so a regression in the shared components or the
// SaunaMap wiring fails fast.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mapControls = readFileSync('components/map/MapControls.tsx', 'utf8')
const searchPanel = readFileSync('components/map/MapSearchPanel.tsx', 'utf8')
const filtersPanel = readFileSync('components/map/MapFiltersPanel.tsx', 'utf8')
const saunaMap = readFileSync('components/SaunaMap.tsx', 'utf8')

describe('SP-045 desktop parity — shared floating controls', () => {
  it('MapControls render on every breakpoint (no lg:hidden gate)', () => {
    expect(mapControls).not.toContain('lg:hidden')
  })
  it('MapControls expose all four accessible corner actions', () => {
    for (const label of ['Filtry', 'Menu', 'Szukaj', 'Moja lokalizacja']) {
      expect(mapControls).toContain(`aria-label="${label}"`)
    }
  })
  it('SaunaMap wires the single shared control set (no legacy desktop chrome)', () => {
    expect(saunaMap).toContain('<MapControls')
    expect(saunaMap).toContain('<MapSearchPanel')
    expect(saunaMap).toContain('<MapFiltersPanel')
    // Legacy desktop UI retired: permanent ~320px sidebar + hardcoded filter bar.
    expect(saunaMap).not.toContain('w-80 overflow-y-auto')
    expect(saunaMap).not.toContain('MAP_FILTER_CATEGORIES')
  })
})

describe('SP-045 desktop parity — adaptive panel presentation', () => {
  it('search panel is a floating desktop side panel, full-screen on mobile', () => {
    expect(searchPanel).toContain('fixed inset-0') // mobile full surface
    expect(searchPanel).toContain('lg:w-[440px]') // desktop: floating, not stretched
    expect(searchPanel).toContain('lg:inset-y-4')
    expect(searchPanel).toContain('lg:right-auto')
  })
  it('filters panel is a desktop floating panel, bottom sheet on mobile', () => {
    expect(filtersPanel).toContain('max-h-[80dvh]') // mobile sheet uses dynamic vh
    expect(filtersPanel).toContain('lg:w-[360px]') // desktop: floating, not stretched
    expect(filtersPanel).toContain('lg:top-16')
  })
})

describe('SP-045 desktop parity — compact popup + pictogram actions everywhere', () => {
  it('popup action row is shared across breakpoints (no lg:hidden / desktop text block)', () => {
    // The compact pictogram row must not be mobile-only, and the old desktop
    // text-button block + its expanded media must be gone.
    expect(saunaMap).not.toContain('flex items-center gap-2 lg:hidden')
    expect(saunaMap).not.toContain('hidden flex-col gap-2 lg:flex')
    expect(saunaMap).not.toContain('📖 Szczegóły obiektu') // desktop text link retired
    expect(saunaMap).not.toContain('🌍 Oficjalna strona') // desktop text link retired
    expect(saunaMap).not.toContain('lg:h-44')
    expect(saunaMap).not.toContain('lg:h-40')
    expect(saunaMap).not.toContain('lg:line-clamp-none')
  })
})

describe('SP-045 desktop parity — privacy surface unchanged', () => {
  it('search stays on the public RPC surface and never touches private identity', () => {
    // Strip comments so the "never queries master_private_identity" doc note
    // does not trip the assertion — we forbid the string in executable code.
    const code = searchPanel
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    expect(code).not.toContain('master_private_identity')
    expect(code).not.toContain("from('sauna_masters')") // no direct table reads
    expect(searchPanel).toContain('get_public_master_upcoming_events')
  })
})
