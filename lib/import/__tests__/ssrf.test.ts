import { describe, expect, it } from 'vitest'
import { isPublicAddress, validateFetchTarget } from '../ssrf'

describe('isPublicAddress', () => {
  it('rejects IPv4 loopback, private, link-local and special ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '169.254.0.1',
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '192.0.2.10', // documentation
      '198.51.100.7',
      '203.0.113.9',
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('accepts public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '91.198.174.192', '172.32.0.1', '11.0.0.1']) {
      expect(isPublicAddress(ip), ip).toBe(true)
    }
  })

  it('rejects IPv6 loopback, unspecified, unique-local, link-local and mapped-private', () => {
    for (const ip of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '::ffff:192.168.1.1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '64:ff9b::808:808', // NAT64 — rejected by policy
      '100::1',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('accepts public IPv6 and mapped-public IPv4', () => {
    for (const ip of ['2606:4700:4700::1111', '2a00:1450:401b:810::200e', '::ffff:8.8.8.8']) {
      expect(isPublicAddress(ip), ip).toBe(true)
    }
  })

  it('rejects non-IP garbage', () => {
    expect(isPublicAddress('not-an-ip')).toBe(false)
  })
})

describe('validateFetchTarget', () => {
  it('rejects localhost and blocked hostnames', () => {
    expect(validateFetchTarget('https://localhost/x')).toEqual({ ok: false, code: 'blocked-host' })
    expect(validateFetchTarget('https://app.localhost/x')).toEqual({ ok: false, code: 'blocked-host' })
    expect(validateFetchTarget('https://metadata.google.internal/computeMetadata/v1/')).toEqual({
      ok: false,
      code: 'blocked-host',
    })
    expect(validateFetchTarget('https://foo.internal/x')).toEqual({ ok: false, code: 'blocked-host' })
  })

  it('rejects private IP literals (IPv4 and IPv6)', () => {
    expect(validateFetchTarget('https://10.0.0.1/x')).toEqual({ ok: false, code: 'blocked-address' })
    expect(validateFetchTarget('https://169.254.169.254/latest/meta-data/')).toEqual({
      ok: false,
      code: 'blocked-address',
    })
    expect(validateFetchTarget('https://[::1]/x')).toEqual({ ok: false, code: 'blocked-address' })
    expect(validateFetchTarget('https://[fe80::1]/x')).toEqual({ ok: false, code: 'blocked-address' })
  })

  it('rejects credentials, non-https and nonstandard ports', () => {
    expect(validateFetchTarget('https://a:b@example.pl/')).toEqual({ ok: false, code: 'credentials-in-url' })
    expect(validateFetchTarget('http://example.pl/')).toEqual({ ok: false, code: 'insecure-protocol' })
    expect(validateFetchTarget('https://example.pl:8443/')).toEqual({ ok: false, code: 'blocked-port' })
  })

  it('accepts a normal public https URL', () => {
    const result = validateFetchTarget('https://example.pl/kontakt')
    expect(result.ok).toBe(true)
  })
})
