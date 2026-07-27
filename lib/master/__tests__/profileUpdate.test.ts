import { describe, expect, it } from 'vitest'
import { buildOwnMasterProfilePatch } from '../profileUpdate'

describe('buildOwnMasterProfilePatch', () => {
  it('builds a full patch from a complete payload', () => {
    const result = buildOwnMasterProfilePatch({
      name: '  Jan Kowalski ',
      bio: ' opis ',
      slug: 'jan-kowalski',
      city: '  Zielona   Góra ',
      specialties: ['classic-aufguss', 'classic-aufguss', 'nonsense'],
      languages: ['PL', 'en'],
      experienceSinceYear: 2018,
      socialLinks: { facebook: 'https://www.facebook.com/x', youtube: '' },
      website: 'https://x.pl',
    })
    expect(result).toMatchObject({
      ok: true,
      requestedSlug: 'jan-kowalski',
      patch: {
        name: 'Jan Kowalski',
        bio: 'opis',
        slug: 'jan-kowalski',
        city: 'Zielona Góra',
        specialties: ['classic-aufguss'],
        languages: ['pl', 'en'],
        experience_since_year: 2018,
        social_links: { facebook: 'https://www.facebook.com/x' },
        website: 'https://x.pl/',
      },
    })
  })

  it('omits undefined fields entirely (do-not-touch contract)', () => {
    const result = buildOwnMasterProfilePatch({ city: 'Poznań' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.keys(result.patch)).toEqual(['city'])
  })

  it('explicit null/blank clears to NULL', () => {
    const result = buildOwnMasterProfilePatch({
      bio: null, slug: '', city: null, specialties: [], languages: [],
      experienceSinceYear: null, socialLinks: {}, website: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch).toEqual({
        bio: null, slug: null, city: null, specialties: null, languages: null,
        experience_since_year: null, social_links: null, website: null,
      })
      expect(result.requestedSlug).toBeNull()
    }
  })

  it('returns user-facing Polish errors instead of throwing (D1)', () => {
    expect(buildOwnMasterProfilePatch({ name: '  ' })).toMatchObject({
      ok: false, error: 'Imię i nazwisko nie może być puste',
    })
    expect(buildOwnMasterProfilePatch({ slug: 'admin' })).toMatchObject({
      ok: false, error: 'Ten adres profilu jest zarezerwowany — wybierz inny',
    })
    expect(buildOwnMasterProfilePatch({ slug: 'A--b' })).toMatchObject({ ok: false })
    expect(buildOwnMasterProfilePatch({ website: 'http://x.pl' })).toMatchObject({
      ok: false, error: 'Strona WWW musi używać https://',
    })
    expect(
      buildOwnMasterProfilePatch({ experienceSinceYear: new Date().getFullYear() + 1 })
    ).toMatchObject({ ok: false, error: 'Rok rozpoczęcia nie może być w przyszłości' })
  })

  it('empty payload builds an empty patch (no-op)', () => {
    const result = buildOwnMasterProfilePatch({})
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.patch).toEqual({})
  })
})
