import { describe, expect, it } from 'vitest'
import {
  normalizeSocialUrl,
  platformForHost,
  sanitizeSocialLinks,
  socialLinksFromUrls,
} from '../social'

describe('platformForHost', () => {
  it('recognizes canonical hosts including short domains and subdomains', () => {
    expect(platformForHost('facebook.com')).toBe('facebook')
    expect(platformForHost('www.facebook.com')).toBe('facebook')
    expect(platformForHost('m.facebook.com')).toBe('facebook')
    expect(platformForHost('fb.com')).toBe('facebook')
    expect(platformForHost('instagram.com')).toBe('instagram')
    expect(platformForHost('instagr.am')).toBe('instagram')
    expect(platformForHost('www.youtube.com')).toBe('youtube')
    expect(platformForHost('youtu.be')).toBe('youtube')
    expect(platformForHost('www.tiktok.com')).toBe('tiktok')
    expect(platformForHost('example.com')).toBeNull()
    expect(platformForHost('notfacebook.com')).toBeNull()
  })
})

describe('normalizeSocialUrl', () => {
  it('keeps meaningful path and query, strips tracking parameters', () => {
    expect(normalizeSocialUrl('https://www.facebook.com/profile.php?id=61558462103846&fbclid=abc')).toEqual({
      platform: 'facebook',
      url: 'https://www.facebook.com/profile.php?id=61558462103846',
    })
    expect(normalizeSocialUrl('https://www.instagram.com/lakehill_mazury/?igsh=xyz&utm_source=qr')).toEqual({
      platform: 'instagram',
      url: 'https://www.instagram.com/lakehill_mazury/',
    })
  })

  it('lowercases the host and keeps https default port', () => {
    expect(normalizeSocialUrl('https://WWW.Facebook.COM/Sauna')?.url).toBe('https://www.facebook.com/Sauna')
    expect(normalizeSocialUrl('https://www.tiktok.com:443/@sauna')?.platform).toBe('tiktok')
  })

  it('rejects http, credentials, odd ports, blanks and malformed values', () => {
    expect(normalizeSocialUrl('http://facebook.com/sauna')).toBeNull()
    expect(normalizeSocialUrl('https://user:pass@facebook.com/x')).toBeNull()
    expect(normalizeSocialUrl('https://facebook.com:8443/x')).toBeNull()
    expect(normalizeSocialUrl('')).toBeNull()
    expect(normalizeSocialUrl('   ')).toBeNull()
    expect(normalizeSocialUrl('not a url')).toBeNull()
    expect(normalizeSocialUrl('https://example.com/facebook.com')).toBeNull() // host decides
  })

  it('does not dereference shorteners — youtu.be stays as-is', () => {
    expect(normalizeSocialUrl('https://youtu.be/abc123')).toEqual({
      platform: 'youtube',
      url: 'https://youtu.be/abc123',
    })
  })
})

describe('socialLinksFromUrls', () => {
  it('keys links by platform; first valid per platform wins; unsupported skipped', () => {
    expect(
      socialLinksFromUrls([
        'https://unsupported.example.com/x',
        'https://www.facebook.com/first',
        'https://www.facebook.com/second',
        'http://www.tiktok.com/@insecure',
        'https://www.youtube.com/@channel',
      ])
    ).toEqual({
      facebook: 'https://www.facebook.com/first',
      youtube: 'https://www.youtube.com/@channel',
    })
  })
})

describe('sanitizeSocialLinks', () => {
  it('accepts only matching-platform https values and never stores blanks', () => {
    expect(
      sanitizeSocialLinks({
        facebook: 'https://www.facebook.com/sauna?fbclid=x',
        instagram: '',
        youtube: 'https://www.facebook.com/wrong-field', // host mismatch → dropped
        tiktok: 'not a url',
        unknown_platform: 'https://www.facebook.com/ignored-key',
      })
    ).toEqual({ facebook: 'https://www.facebook.com/sauna' })
  })

  it('returns null instead of an empty object', () => {
    expect(sanitizeSocialLinks({})).toBeNull()
    expect(sanitizeSocialLinks({ facebook: '' })).toBeNull()
    expect(sanitizeSocialLinks(null)).toBeNull()
    expect(sanitizeSocialLinks(undefined)).toBeNull()
  })
})
