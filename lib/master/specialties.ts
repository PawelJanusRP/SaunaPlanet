// SP-039 — controlled specialties vocabulary (decision R3).
//
// The DATABASE stores only the stable identifiers below. SP-047: display labels
// are localized at render via next-intl (common.specialties.<id> /
// common.languages.<code>) — the config carries only the canonical codes. The
// list is application-controlled and may evolve without a migration (the DB
// pins just array cardinality 1–12).

export const SPECIALTY_OPTIONS = [
  { id: 'classic-aufguss' },
  { id: 'show-aufguss' },
  { id: 'relaxation-ceremony' },
  { id: 'herbal-ceremony' },
  { id: 'meditation-ceremony' },
  { id: 'peeling-ritual' },
  { id: 'cosmetic-ritual' },
  { id: 'sound-ceremony' },
  { id: 'themed-ceremony' },
  { id: 'competition-ceremony' },
  { id: 'large-event-hosting' },
  { id: 'training-workshops' },
] as const

export type SpecialtyId = (typeof SPECIALTY_OPTIONS)[number]['id']

export const SPECIALTY_IDS: ReadonlySet<string> = new Set(
  SPECIALTY_OPTIONS.map((o) => o.id)
)

/** Language chips offered by the Studio editor (codes are what's stored). */
export const LANGUAGE_OPTIONS = [
  { code: 'pl' },
  { code: 'en' },
  { code: 'de' },
  { code: 'uk' },
  { code: 'cs' },
  { code: 'sk' },
  { code: 'fr' },
  { code: 'es' },
] as const
