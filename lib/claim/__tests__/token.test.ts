import { describe, expect, it } from 'vitest'
import {
  toBase64Url,
  sha256Hex,
  generateClaimTokenFallback,
} from '../token'
import { createHash } from 'node:crypto'

describe('base64url token encoding', () => {
  it('produces url-safe output with no +, /, or = padding', () => {
    // bytes chosen so standard base64 would contain + and / and padding
    const bytes = Uint8Array.from([0xfb, 0xff, 0xbf, 0x00, 0x10, 0x83])
    const b64url = toBase64Url(bytes)
    expect(b64url).not.toMatch(/[+/=]/)
    expect(b64url).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('encodes 32 random bytes as a 43-char base64url string', () => {
    const { token } = generateClaimTokenFallback()
    // 32 bytes -> ceil(32/3)*4 = 44 with one '=' pad -> 43 chars unpadded
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('round-trips to standard base64url (matches Buffer base64url)', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff)
    expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
  })
})

describe('token prefix', () => {
  it('is the first 8 characters (diagnostic only, not unique)', () => {
    const { token, prefix } = generateClaimTokenFallback()
    expect(prefix).toBe(token.slice(0, 8))
    expect(prefix).toHaveLength(8)
  })

  it('exposes ~208 bits of remaining secret (35 chars beyond the prefix)', () => {
    const { token, prefix } = generateClaimTokenFallback()
    expect(token.length - prefix.length).toBe(35)
  })
})

describe('sha256 hashing', () => {
  it('matches node crypto SHA-256 hex of the token', () => {
    const token = 'abc-DEF_123'
    expect(sha256Hex(token)).toBe(
      createHash('sha256').update(token, 'utf8').digest('hex')
    )
    expect(sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fallback returns token + prefix + matching digest', () => {
    const { token, prefix, sha256Hex: hex } = generateClaimTokenFallback()
    expect(prefix).toBe(token.slice(0, 8))
    expect(hex).toBe(createHash('sha256').update(token, 'utf8').digest('hex'))
  })

  it('two fallback tokens are distinct (CSPRNG)', () => {
    const a = generateClaimTokenFallback().token
    const b = generateClaimTokenFallback().token
    expect(a).not.toBe(b)
  })
})
