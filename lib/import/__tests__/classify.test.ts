import { describe, expect, it } from 'vitest'
import { classifyImportUrl } from '../classify'

describe('classifyImportUrl', () => {
  it('classifies ordinary official websites', () => {
    expect(classifyImportUrl('https://www.termymaltanskie.com.pl/strefa-saun')).toMatchObject({
      kind: 'website',
      url: 'https://www.termymaltanskie.com.pl/strefa-saun',
    })
    expect(classifyImportUrl('https://sauna-example.pl')).toMatchObject({ kind: 'website' })
  })

  it('classifies Facebook pages', () => {
    expect(classifyImportUrl('https://www.facebook.com/SaunaPoznan').kind).toBe('facebook_page')
    expect(classifyImportUrl('https://m.facebook.com/SaunaPoznan').kind).toBe('facebook_page')
    expect(classifyImportUrl('https://fb.com/SaunaPoznan').kind).toBe('facebook_page')
    expect(classifyImportUrl('https://www.facebook.com/profile.php?id=1234').kind).toBe('facebook_page')
  })

  it('classifies Facebook posts and events', () => {
    expect(classifyImportUrl('https://www.facebook.com/SaunaPoznan/posts/987').kind).toBe('facebook_post')
    expect(classifyImportUrl('https://www.facebook.com/permalink.php?story_fbid=1&id=2').kind).toBe('facebook_post')
    expect(classifyImportUrl('https://www.facebook.com/share/p/AbCdEf').kind).toBe('facebook_post')
    expect(classifyImportUrl('https://www.facebook.com/events/123456789').kind).toBe('facebook_event')
    expect(classifyImportUrl('https://www.facebook.com/SaunaPoznan/events').kind).toBe('facebook_event')
  })

  it('classifies Instagram profiles and posts', () => {
    expect(classifyImportUrl('https://www.instagram.com/sauna.poznan').kind).toBe('instagram_profile')
    expect(classifyImportUrl('https://instagram.com/sauna.poznan/').kind).toBe('instagram_profile')
    expect(classifyImportUrl('https://www.instagram.com/p/Cxyz123').kind).toBe('instagram_post')
    expect(classifyImportUrl('https://www.instagram.com/reel/Cxyz123').kind).toBe('instagram_post')
  })

  it('classifies Google Maps URLs', () => {
    expect(classifyImportUrl('https://www.google.com/maps/place/Termy+Maltanskie').kind).toBe('google_maps')
    expect(classifyImportUrl('https://google.pl/maps/place/Sauna').kind).toBe('google_maps')
    expect(classifyImportUrl('https://maps.google.com/?q=sauna').kind).toBe('google_maps')
    expect(classifyImportUrl('https://maps.app.goo.gl/AbCdEf123').kind).toBe('google_maps')
    expect(classifyImportUrl('https://goo.gl/maps/AbCdEf123').kind).toBe('google_maps')
  })

  it('does not classify a Google non-maps URL as google_maps', () => {
    expect(classifyImportUrl('https://www.google.com/search?q=sauna').kind).toBe('website')
  })

  it('classifies rejected inputs as unsupported with an error code', () => {
    expect(classifyImportUrl('http://insecure.example.pl')).toMatchObject({
      kind: 'unsupported',
      url: null,
      error: 'insecure-protocol',
    })
    expect(classifyImportUrl('ftp://example.pl/file').error).toBe('insecure-protocol')
    expect(classifyImportUrl('javascript:alert(1)').error).toBe('insecure-protocol')
    expect(classifyImportUrl('mailto:info@example.pl').error).toBe('insecure-protocol')
    expect(classifyImportUrl('not a url').error).toBe('invalid-url')
    expect(classifyImportUrl('https://user:pass@example.pl').error).toBe('credentials-in-url')
    expect(classifyImportUrl('https://example.pl:8443/x').error).toBe('blocked-port')
  })
})
