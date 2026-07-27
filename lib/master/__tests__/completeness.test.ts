import { describe, expect, it } from 'vitest'
import {
  BIO_MIN_LENGTH,
  computeMasterCompleteness,
  type MasterCompletenessExtras,
  type MasterCompletenessProfile,
} from '../completeness'

const EMPTY_PROFILE: MasterCompletenessProfile = {
  avatarUrl: null,
  bio: null,
  slug: null,
  city: null,
  specialties: null,
  socialLinks: null,
  website: null,
}

const NO_EXTRAS: MasterCompletenessExtras = { hasAffiliation: false, hasUpcomingEvent: false }

describe('computeMasterCompleteness', () => {
  it('scores an empty profile at 0 with every item undone', () => {
    const result = computeMasterCompleteness(EMPTY_PROFILE, NO_EXTRAS)
    expect(result.score).toBe(0)
    expect(result.items).toHaveLength(8)
    expect(result.items.every((i) => !i.done)).toBe(true)
    expect(result.items.reduce((s, i) => s + i.weight, 0)).toBe(100)
  })

  it('scores a partially complete profile by summing done weights', () => {
    const result = computeMasterCompleteness(
      { ...EMPTY_PROFILE, avatarUrl: 'https://x/a.jpg', city: 'Poznań' },
      NO_EXTRAS
    )
    expect(result.score).toBe(25) // avatar 15 + city 10
  })

  it('counts bio only from the 80-character threshold', () => {
    const exactly80 = 'a'.repeat(BIO_MIN_LENGTH)
    const seventyNine = 'a'.repeat(BIO_MIN_LENGTH - 1)
    expect(
      computeMasterCompleteness({ ...EMPTY_PROFILE, bio: exactly80 }, NO_EXTRAS).score
    ).toBe(20)
    expect(
      computeMasterCompleteness({ ...EMPTY_PROFILE, bio: seventyNine }, NO_EXTRAS).score
    ).toBe(0)
  })

  it('counts links from a social link alone or a website alone', () => {
    expect(
      computeMasterCompleteness(
        { ...EMPTY_PROFILE, socialLinks: { instagram: 'https://www.instagram.com/x' } },
        NO_EXTRAS
      ).score
    ).toBe(10)
    expect(
      computeMasterCompleteness({ ...EMPTY_PROFILE, website: 'https://x.pl' }, NO_EXTRAS).score
    ).toBe(10)
    expect(
      computeMasterCompleteness({ ...EMPTY_PROFILE, socialLinks: {} }, NO_EXTRAS).score
    ).toBe(0)
  })

  it('counts a pending affiliation the same as an approved one', () => {
    const pending = computeMasterCompleteness(EMPTY_PROFILE, {
      hasAffiliation: true,
      hasUpcomingEvent: false,
    })
    expect(pending.score).toBe(5)
  })

  it('counts an upcoming event', () => {
    expect(
      computeMasterCompleteness(EMPTY_PROFILE, { hasAffiliation: false, hasUpcomingEvent: true })
        .score
    ).toBe(10)
  })

  it('reaches exactly 100 on a full profile', () => {
    const result = computeMasterCompleteness(
      {
        avatarUrl: 'https://x/a.jpg',
        bio: 'b'.repeat(120),
        slug: 'jan-kowalski',
        city: 'Poznań',
        specialties: ['classic-aufguss'],
        socialLinks: { facebook: 'https://www.facebook.com/x' },
        website: 'https://x.pl',
      },
      { hasAffiliation: true, hasUpcomingEvent: true }
    )
    expect(result.score).toBe(100)
    expect(result.items.every((i) => i.done)).toBe(true)
  })

  it('every item carries a destination link for the Slice 2 checklist', () => {
    const result = computeMasterCompleteness(EMPTY_PROFILE, NO_EXTRAS)
    expect(result.items.every((i) => i.href.startsWith('/studio'))).toBe(true)
  })
})
