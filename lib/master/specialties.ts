// SP-039 — controlled specialties vocabulary (decision R3).
//
// The DATABASE stores only the stable identifiers below; Polish labels are
// UI-only. The list is application-controlled and may evolve without a
// migration (the DB pins just array cardinality 1–12).

export const SPECIALTY_OPTIONS = [
  { id: 'classic-aufguss', label: 'Aufguss klasyczny' },
  { id: 'show-aufguss', label: 'Aufguss show' },
  { id: 'relaxation-ceremony', label: 'Ceremonia relaksacyjna' },
  { id: 'herbal-ceremony', label: 'Ceremonia ziołowa' },
  { id: 'meditation-ceremony', label: 'Ceremonia medytacyjna' },
  { id: 'peeling-ritual', label: 'Rytuał peelingowy' },
  { id: 'cosmetic-ritual', label: 'Rytuał kosmetyczny' },
  { id: 'sound-ceremony', label: 'Ceremonia dźwiękowa' },
  { id: 'themed-ceremony', label: 'Ceremonia tematyczna' },
  { id: 'competition-ceremony', label: 'Ceremonia konkursowa' },
  { id: 'large-event-hosting', label: 'Prowadzenie dużych wydarzeń' },
  { id: 'training-workshops', label: 'Szkolenia i warsztaty' },
] as const

export type SpecialtyId = (typeof SPECIALTY_OPTIONS)[number]['id']

export const SPECIALTY_IDS: ReadonlySet<string> = new Set(
  SPECIALTY_OPTIONS.map((o) => o.id)
)

export function specialtyLabel(id: string): string {
  return SPECIALTY_OPTIONS.find((o) => o.id === id)?.label ?? id
}

/** Language chips offered by the Studio editor (codes are what's stored). */
export const LANGUAGE_OPTIONS = [
  { code: 'pl', label: 'polski' },
  { code: 'en', label: 'angielski' },
  { code: 'de', label: 'niemiecki' },
  { code: 'uk', label: 'ukraiński' },
  { code: 'cs', label: 'czeski' },
  { code: 'sk', label: 'słowacki' },
  { code: 'fr', label: 'francuski' },
  { code: 'es', label: 'hiszpański' },
] as const

export function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.label ?? code
}
