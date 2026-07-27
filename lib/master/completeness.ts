// SP-039 — master-profile completeness (calculated, never stored).
//
// Weights approved 2026-07-27. Slice 1 ships the pure function and data
// contract; the guided-onboarding checklist UI consumes it in Slice 2.

export type MasterCompletenessProfile = {
  avatarUrl: string | null
  bio: string | null
  slug: string | null
  city: string | null
  specialties: string[] | null
  socialLinks: Record<string, string> | null
  website: string | null
}

export type MasterCompletenessExtras = {
  /** Any pending OR approved affiliation counts (the handshake is started). */
  hasAffiliation: boolean
  /** At least one approved upcoming appearance. */
  hasUpcomingEvent: boolean
}

export type CompletenessItem = {
  key:
    | 'avatar'
    | 'bio'
    | 'slug'
    | 'city'
    | 'specialties'
    | 'links'
    | 'affiliation'
    | 'upcoming-event'
  label: string
  done: boolean
  weight: number
  href: string
}

export type MasterCompleteness = {
  /** 0–100; the weights below sum to exactly 100. */
  score: number
  items: CompletenessItem[]
}

export const BIO_MIN_LENGTH = 80

export function computeMasterCompleteness(
  profile: MasterCompletenessProfile,
  extras: MasterCompletenessExtras
): MasterCompleteness {
  const hasLink =
    !!profile.website ||
    Object.values(profile.socialLinks ?? {}).some((v) => typeof v === 'string' && v.length > 0)

  const items: CompletenessItem[] = [
    {
      key: 'avatar',
      label: 'Dodaj zdjęcie profilowe',
      done: !!profile.avatarUrl,
      weight: 15,
      href: '/studio/profile',
    },
    {
      key: 'bio',
      label: `Napisz o sobie (min. ${BIO_MIN_LENGTH} znaków)`,
      done: (profile.bio ?? '').trim().length >= BIO_MIN_LENGTH,
      weight: 20,
      href: '/studio/profile',
    },
    {
      key: 'slug',
      label: 'Ustaw własny adres profilu',
      done: !!profile.slug,
      weight: 15,
      href: '/studio/profile',
    },
    {
      key: 'city',
      label: 'Podaj miasto, w którym działasz',
      done: !!profile.city,
      weight: 10,
      href: '/studio/profile',
    },
    {
      key: 'specialties',
      label: 'Wybierz specjalizacje',
      done: (profile.specialties?.length ?? 0) > 0,
      weight: 15,
      href: '/studio/profile',
    },
    {
      key: 'links',
      label: 'Dodaj profil społecznościowy lub stronę WWW',
      done: hasLink,
      weight: 10,
      href: '/studio/profile',
    },
    {
      key: 'affiliation',
      label: 'Nawiąż afiliację z obiektem',
      done: extras.hasAffiliation,
      weight: 5,
      href: '/studio/affiliations',
    },
    {
      key: 'upcoming-event',
      label: 'Dodaj nadchodzący seans',
      done: extras.hasUpcomingEvent,
      weight: 10,
      href: '/studio/events',
    },
  ]

  const score = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0)
  return { score, items }
}
