// SP-047 — regression tests for the sensitive locale-routing decisions:
// root negotiation, legacy 308 to Polish, query/deep-link preservation, bare
// infra endpoints, and post-auth callback locale resolution.

import { describe, expect, it } from 'vitest'
import {
  isBarePath,
  hasLocalePrefix,
  legacyRedirectPath,
  callbackDestination,
} from '../routingPolicy'

describe('bare infra endpoints stay unprefixed', () => {
  it('treats the Supabase callback and claim subtree as bare', () => {
    expect(isBarePath('/auth/callback')).toBe(true)
    expect(isBarePath('/claim')).toBe(true)
    expect(isBarePath('/claim/master/abc')).toBe(true)
  })
  it('does not treat localized app paths as bare', () => {
    expect(isBarePath('/pl/auth/login')).toBe(false)
    expect(isBarePath('/pl/masters')).toBe(false)
  })
})

describe('locale prefix detection', () => {
  it('recognizes supported locale prefixes', () => {
    expect(hasLocalePrefix('/pl')).toBe(true)
    expect(hasLocalePrefix('/en/masters')).toBe(true)
    expect(hasLocalePrefix('/de/events/123')).toBe(true)
  })
  it('rejects unprefixed and unsupported prefixes', () => {
    expect(hasLocalePrefix('/')).toBe(false)
    expect(hasLocalePrefix('/masters')).toBe(false)
    expect(hasLocalePrefix('/fr/masters')).toBe(false)
  })
})

describe('legacy redirect (unprefixed content -> permanent /pl)', () => {
  it('maps historical public paths to their Polish equivalent', () => {
    expect(legacyRedirectPath('/masters/jan-kowalski')).toBe('/pl/masters/jan-kowalski')
    expect(legacyRedirectPath('/events/123')).toBe('/pl/events/123')
    expect(legacyRedirectPath('/sauna/uuid')).toBe('/pl/sauna/uuid')
    expect(legacyRedirectPath('/help/saunamaster')).toBe('/pl/help/saunamaster')
  })
  it('preserves the query string, including the /?sauna deep link on a path', () => {
    expect(legacyRedirectPath('/masters', '?q=abc')).toBe('/pl/masters?q=abc')
  })
  it('does NOT redirect the root (it must negotiate instead)', () => {
    expect(legacyRedirectPath('/')).toBeNull()
    // The /?sauna=<uuid> deep link lives on the ROOT and is handled by
    // negotiation (which preserves the query) — never forced to Polish here.
    expect(legacyRedirectPath('/', '?sauna=uuid')).toBeNull()
  })
  it('does NOT redirect already-localized or bare paths', () => {
    expect(legacyRedirectPath('/pl/masters')).toBeNull()
    expect(legacyRedirectPath('/de/events')).toBeNull()
    expect(legacyRedirectPath('/auth/callback')).toBeNull()
    expect(legacyRedirectPath('/claim/master/token')).toBeNull()
  })
})

describe('auth callback destination — locale resolved after auth', () => {
  it('localizes the sanitized return path with the cookie locale', () => {
    expect(callbackDestination('/studio', 'de')).toBe('/de/studio')
    expect(callbackDestination('/', 'en')).toBe('/en')
    expect(callbackDestination('/studio', 'pl')).toBe('/pl/studio')
  })
  it('falls back to Polish for a missing/invalid cookie', () => {
    expect(callbackDestination('/studio')).toBe('/pl/studio')
    expect(callbackDestination('/studio', 'fr')).toBe('/pl/studio')
  })
  it('keeps claim deep links unprefixed (token stays in the path)', () => {
    const claim = '/claim/master/abcdefghijklmnopqrstuvwxyz0123456789ABCDEF012'
    expect(callbackDestination(claim, 'de')).toBe(claim)
  })
})
