// SP-039P0 — first-steps checklist derivation. Completion is a pure
// function of existing facts (hard checklist, publication status, event
// data); publication requirements come from resolveHardChecklist — the same
// authority the submit RPC mirrors — never from a parallel predicate.

import { describe, expect, it } from 'vitest'
import { deriveFirstSteps, type FirstStepsInput } from '../onboarding'
import { resolveHardChecklist } from '../publicationView'
import { BIO_MIN_LENGTH } from '../completeness'

const COMPLETE_PROFILE = {
  name: 'Jan Testowy',
  city: 'Gdańsk',
  bio: 'x'.repeat(BIO_MIN_LENGTH),
  avatarUrl: 'https://example.test/avatar.jpg',
  specialties: ['aufguss'],
}

function input(overrides: Partial<FirstStepsInput> = {}): FirstStepsInput {
  return {
    checklist: resolveHardChecklist(COMPLETE_PROFILE),
    publicationStatus: 'draft',
    masterApproved: false,
    hasAnyEvent: false,
    previewHref: '/masters/jan-testowy',
    ...overrides,
  }
}

function step(result: ReturnType<typeof deriveFirstSteps>, key: string) {
  const found = result.steps.find((s) => s.key === key)
  if (!found) throw new Error(`missing step ${key}`)
  return found
}

describe('checklist structure', () => {
  it('has the eight approved steps in order, split required/recommended', () => {
    const result = deriveFirstSteps(input())
    expect(result.steps.map((s) => s.key)).toEqual([
      'claimed', 'details', 'avatar', 'specialty', 'preview',
      'submitted', 'published', 'first-event',
    ])
    expect(result.required.map((s) => s.key)).toEqual([
      'claimed', 'details', 'avatar', 'specialty', 'preview', 'submitted', 'published',
    ])
    expect(result.recommended.map((s) => s.key)).toEqual(['first-event'])
    expect(result.totalCount).toBe(8)
  })
  it('exposes the approved Polish labels', () => {
    const labels = deriveFirstSteps(input()).steps.map((s) => s.label)
    expect(labels).toEqual([
      'Profil został przejęty',
      'Uzupełniono wymagane dane wizytówki',
      'Dodano zdjęcie profilowe',
      'Dodano co najmniej jedną specjalizację',
      'Dostępny jest podgląd wizytówki',
      'Profil został wysłany do moderacji',
      'Profil został opublikowany',
      'Dodano pierwsze wydarzenie',
    ])
  })
  it('progress label counts derived completion (pending owner, draft)', () => {
    // claimed + details + avatar + specialty + preview done → 5 z 8
    const result = deriveFirstSteps(input())
    expect(result.progressLabel).toBe('5 z 8 kroków')
  })
})

describe('derivation matches the authoritative completeness logic', () => {
  it('avatar and specialty steps follow resolveHardChecklist exactly', () => {
    const noAvatar = deriveFirstSteps(
      input({ checklist: resolveHardChecklist({ ...COMPLETE_PROFILE, avatarUrl: null }) })
    )
    expect(step(noAvatar, 'avatar').done).toBe(false)
    expect(step(noAvatar, 'specialty').done).toBe(true)

    const noSpecialty = deriveFirstSteps(
      input({ checklist: resolveHardChecklist({ ...COMPLETE_PROFILE, specialties: [] }) })
    )
    expect(step(noSpecialty, 'specialty').done).toBe(false)
    expect(step(noSpecialty, 'avatar').done).toBe(true)
  })
  it('details step honours trimming and the minimum bio length', () => {
    const shortBio = deriveFirstSteps(
      input({
        checklist: resolveHardChecklist({
          ...COMPLETE_PROFILE,
          bio: ' '.repeat(5) + 'x'.repeat(BIO_MIN_LENGTH - 1) + ' ',
        }),
      })
    )
    expect(step(shortBio, 'details').done).toBe(false)

    const blankCity = deriveFirstSteps(
      input({ checklist: resolveHardChecklist({ ...COMPLETE_PROFILE, city: '   ' }) })
    )
    expect(step(blankCity, 'details').done).toBe(false)
  })
})

describe('publication and event states', () => {
  it('submitted state marks the submit step done', () => {
    for (const status of ['submitted', 'published', 'legacy_published'] as const) {
      expect(step(deriveFirstSteps(input({ publicationStatus: status })), 'submitted').done).toBe(true)
    }
    for (const status of ['draft', 'changes_requested', 'suspended'] as const) {
      expect(step(deriveFirstSteps(input({ publicationStatus: status })), 'submitted').done).toBe(false)
    }
  })
  it('published state marks the publication step done', () => {
    expect(step(deriveFirstSteps(input({ publicationStatus: 'published' })), 'published').done).toBe(true)
    expect(step(deriveFirstSteps(input({ publicationStatus: 'submitted' })), 'published').done).toBe(false)
  })
  it('first-event step derives from existing event data', () => {
    expect(step(deriveFirstSteps(input({ hasAnyEvent: true })), 'first-event').done).toBe(true)
    expect(step(deriveFirstSteps(input({ hasAnyEvent: false })), 'first-event').done).toBe(false)
  })
})

describe('pending vs approved owner', () => {
  it('a pending master gets NO event-creation link, only the explanation', () => {
    const pending = step(deriveFirstSteps(input({ masterApproved: false })), 'first-event')
    expect(pending.href).toBeNull()
    expect(pending.hint).toContain('po zatwierdzeniu profilu saunamistrza')
  })
  it('an approved master gets the real events route', () => {
    const approved = step(deriveFirstSteps(input({ masterApproved: true })), 'first-event')
    expect(approved.href).toBe('/studio/events')
    expect(approved.hint).toBeUndefined()
  })
})

describe('route correctness', () => {
  it('actionable steps link to real routes only', () => {
    const result = deriveFirstSteps(
      input({ masterApproved: true, previewHref: '/masters/slug-x' })
    )
    expect(step(result, 'details').href).toBe('/studio/profile')
    expect(step(result, 'avatar').href).toBe('/studio/profile')
    expect(step(result, 'specialty').href).toBe('/studio/profile')
    expect(step(result, 'preview').href).toBe('/masters/slug-x')
    expect(step(result, 'submitted').href).toBe('/studio#publikacja')
    expect(step(result, 'claimed').href).toBeNull()
    expect(step(result, 'published').href).toBeNull()
  })
})
