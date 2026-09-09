// SP-047E1 — presentation-mapping contract for the security/behaviour-sensitive
// pure-lib flows (claim, pilot/invitation, public claim, publication
// transitions, import). The pure libs keep their canonical CODES and their PL
// reference maps (behaviour/security tested elsewhere); this test asserts that
// EVERY canonical code has a user-visible message in ALL supported locales, so
// the presentation boundary can resolve any code without gaps.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../locales'
import { CLAIM_RESULT_CODES } from '@/lib/claim/types'
import {
  PUBLIC_CLAIM_STATES,
  PUBLIC_CLAIM_RESULT_CODES,
} from '@/lib/claim/publicClaim'
import {
  PUBLICATION_TRANSITION_CODES,
  PUBLICATION_MISSING_FIELD_CODES,
} from '@/lib/master/publicationTransitions'

const catalogs = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    {
      claim: JSON.parse(readFileSync(`messages/${l}/claim.json`, 'utf8')),
      publication: JSON.parse(readFileSync(`messages/${l}/publication.json`, 'utf8')),
      sauna: JSON.parse(readFileSync(`messages/${l}/sauna.json`, 'utf8')),
    },
  ]),
) as Record<string, { claim: Record<string, Record<string, string>>; publication: Record<string, Record<string, string>>; sauna: { import: Record<string, Record<string, string>> } }>

// Invitation-control-only extra codes (superset over claim codes).
const INVITATION_EXTRA_CODES = [
  'payload_malformed',
  'invalid_input',
  'claim_origin_not_configured',
  'claim_origin_invalid',
]
// Public inspection adds the frontend-only transport failure state.
const PUBLIC_INSPECTION_STATES = [...PUBLIC_CLAIM_STATES, 'unavailable']
// Import failure codes surfaced to users (from lib/import/*).
const IMPORT_RESULT_CODES = [
  'unauthenticated',
  'invalid-url',
  'rate-limited',
  'unsupported-source',
  'fetch-blocked',
  'fetch-failed',
]
const IMPORT_IMAGE_CODES = [
  'not-available',
  'fetch-failed',
  'unsupported-image',
  'upload-failed',
  'attach-failed',
]

function check(section: string, codes: readonly string[], get: (loc: string, code: string) => unknown) {
  describe(`${section} — every code has a message in every locale`, () => {
    for (const code of codes) {
      it(`${code}`, () => {
        for (const locale of LOCALES) {
          const value = get(locale, code)
          expect(typeof value, `${locale}:${section}:${code}`).toBe('string')
          expect((value as string).length).toBeGreaterThan(0)
        }
      })
    }
  })
}

check('claim.results', CLAIM_RESULT_CODES, (l, c) => catalogs[l].claim.results[c])
check('claim.invitationExtra', INVITATION_EXTRA_CODES, (l, c) => catalogs[l].claim.invitationExtra[c])
check('claim.publicState', PUBLIC_INSPECTION_STATES, (l, c) => catalogs[l].claim.publicState[c])
check('claim.publicResult', PUBLIC_CLAIM_RESULT_CODES, (l, c) => catalogs[l].claim.publicResult[c])
check('publication.results', PUBLICATION_TRANSITION_CODES, (l, c) => catalogs[l].publication.results[c])
check('publication.missingFields', PUBLICATION_MISSING_FIELD_CODES, (l, c) => catalogs[l].publication.missingFields[c])
check('sauna.import.results', IMPORT_RESULT_CODES, (l, c) => catalogs[l].sauna.import.results[c])
check('sauna.import.imageResults', IMPORT_IMAGE_CODES, (l, c) => catalogs[l].sauna.import.imageResults[c])
