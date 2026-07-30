// SP-039 Slice 4B — auth-callback return-path allow-list tests.

import { describe, expect, it } from 'vitest'
import { sanitizeReturnPath, FALLBACK_RETURN_PATH } from '../returnPath'

const TOKEN = 'aB3-_'.repeat(8) + 'xyz' // 43 chars, legal alphabet incl. - and _

describe('allow-listed destinations', () => {
  it('accepts the exact internal destinations', () => {
    expect(sanitizeReturnPath('/')).toBe('/')
    expect(sanitizeReturnPath('/studio')).toBe('/studio')
  })
  it('accepts a well-formed tokenized claim path (incl. - and _ in the token)', () => {
    expect(sanitizeReturnPath(`/claim/master/${TOKEN}`)).toBe(`/claim/master/${TOKEN}`)
  })
  it('rejects claim paths with a malformed token', () => {
    expect(sanitizeReturnPath('/claim/master/short')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath(`/claim/master/${'A'.repeat(44)}`)).toBe(
      FALLBACK_RETURN_PATH
    )
    expect(sanitizeReturnPath(`/claim/master/${'A'.repeat(42)}=`)).toBe(
      FALLBACK_RETURN_PATH
    )
    expect(sanitizeReturnPath(`/claim/master/${TOKEN}/extra`)).toBe(
      FALLBACK_RETURN_PATH
    )
  })
})

describe('open-redirect and evasion rejection', () => {
  it('rejects absolute external URLs', () => {
    expect(sanitizeReturnPath('https://attacker.example')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('http://attacker.example/')).toBe(FALLBACK_RETURN_PATH)
  })
  it('rejects protocol-relative URLs', () => {
    expect(sanitizeReturnPath('//attacker.example')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('//attacker.example/studio')).toBe(FALLBACK_RETURN_PATH)
  })
  it('rejects encoded bypasses wholesale (any percent-encoding)', () => {
    expect(sanitizeReturnPath('/%2F%2Fattacker.example')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/studio%2F..%2Fadmin')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/%61dmin')).toBe(FALLBACK_RETURN_PATH)
  })
  it('rejects backslashes, traversal, query strings, fragments, whitespace', () => {
    expect(sanitizeReturnPath('/\\attacker.example')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/studio/../admin')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/studio?x=1')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/studio#frag')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/stu dio')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/studio\n')).toBe(FALLBACK_RETURN_PATH)
  })
  it('rejects unrelated internal paths (no implicit widening — incl. /admin)', () => {
    expect(sanitizeReturnPath('/admin')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/admin/masters/pilot')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/masters')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('/studio/profile')).toBe(FALLBACK_RETURN_PATH)
  })
  it('falls back safely on malformed state', () => {
    expect(sanitizeReturnPath(null)).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath(undefined)).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('')).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath(42)).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('x'.repeat(201))).toBe(FALLBACK_RETURN_PATH)
    expect(sanitizeReturnPath('studio')).toBe(FALLBACK_RETURN_PATH)
  })
})
