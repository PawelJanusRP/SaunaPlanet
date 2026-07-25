import { describe, expect, it } from 'vitest'
import type { ExtractDraftResult, ExtractDraftSuccess } from '../actionCore'
import {
  INITIAL_PREVIEW_STATE,
  applyDraftToForm,
  beginExtraction,
  cancelExtraction,
  clearImportedValues,
  clearPreview,
  isPreviewForDifferentUrl,
  openingHoursSummary,
  openingHoursToJson,
  resolveExtraction,
  unmappedFields,
  type ImportableFormValues,
} from '../previewState'
import type { FacilityDraft, OpeningHoursDraft } from '../types'

const DRAFT: FacilityDraft = {
  name: { value: 'Sauna Leśna', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD LocalBusiness.name' },
  description: { value: 'Opis', origin: 'opengraph', confidence: 'medium', sourceHint: 'og:description' },
  city: { value: 'Poznań', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD PostalAddress' },
  website: { value: 'https://saunalesna.pl', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD LocalBusiness.url' },
  geo: { value: { latitude: 52.4, longitude: 16.9 }, origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD geo' },
  phone: { value: '+48 600 100 200', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD telephone' },
  email: { value: 'x@saunalesna.pl', origin: 'html', confidence: 'low', sourceHint: 'mailto: link' },
}

function success(url: string, overrides: Partial<ExtractDraftSuccess> = {}): ExtractDraftSuccess {
  return {
    ok: true,
    sourceKind: 'website',
    requestedUrl: url,
    finalUrl: url,
    result: 'ok',
    draft: DRAFT,
    warnings: [],
    duplicates: [],
    importId: 'log-1',
    ...overrides,
  }
}

const FAILURE: ExtractDraftResult = { ok: false, code: 'fetch-failed', message: 'Nie udało się pobrać danych' }

const EMPTY_FORM: ImportableFormValues = {
  name: '',
  description: '',
  city: '',
  website: '',
  lat: '',
  lng: '',
  phone: '',
  email: '',
  address: '',
  openingHours: null,
  socialLinks: {},
}

const HOURS: OpeningHoursDraft = {
  specifications: [{ days: ['Mo', 'Tu'], opens: '09:00', closes: '21:00' }],
  raw: ['So-Nd 10:00-18:00'],
}

describe('preview state machine', () => {
  it('resolves the matching token into a success preview', () => {
    const { state, token } = beginExtraction(INITIAL_PREVIEW_STATE, 'https://saunalesna.pl/')
    expect(state.phase).toBe('loading')
    const resolved = resolveExtraction(state, token, success('https://saunalesna.pl/'))
    expect(resolved.phase).toBe('success')
    expect(resolved.result?.requestedUrl).toBe('https://saunalesna.pl/')
  })

  it('drops a stale response from an older extraction', () => {
    const first = beginExtraction(INITIAL_PREVIEW_STATE, 'https://old.pl/')
    const second = beginExtraction(first.state, 'https://new.pl/')
    // Old slow response arrives AFTER the new request started:
    const afterStale = resolveExtraction(second.state, first.token, success('https://old.pl/'))
    expect(afterStale).toBe(second.state) // untouched, still loading the new one
    const afterFresh = resolveExtraction(afterStale, second.token, success('https://new.pl/'))
    expect(afterFresh.phase).toBe('success')
    expect(afterFresh.result?.requestedUrl).toBe('https://new.pl/')
  })

  it('replaces the first preview cleanly on a second extraction', () => {
    const first = beginExtraction(INITIAL_PREVIEW_STATE, 'https://a.pl/')
    const done = resolveExtraction(first.state, first.token, success('https://a.pl/'))
    const second = beginExtraction(done, 'https://b.pl/')
    expect(second.state.result).toBeNull() // no stale preview during loading
    const resolved = resolveExtraction(second.state, second.token, success('https://b.pl/'))
    expect(resolved.result?.requestedUrl).toBe('https://b.pl/')
  })

  it('cancel drops the in-flight response', () => {
    const { state, token } = beginExtraction(INITIAL_PREVIEW_STATE, 'https://a.pl/')
    const cancelled = cancelExtraction(state)
    expect(cancelled.phase).toBe('idle')
    expect(resolveExtraction(cancelled, token, success('https://a.pl/'))).toBe(cancelled)
  })

  it('keeps the manual form usable after an import failure (form untouched)', () => {
    const { state, token } = beginExtraction(INITIAL_PREVIEW_STATE, 'https://a.pl/')
    const failed = resolveExtraction(state, token, FAILURE)
    expect(failed.phase).toBe('error')
    expect(failed.result).toBeNull()
    // Nothing in the machine touches form values — applying is a separate,
    // success-only user action.
  })

  it('flags a preview that belongs to a previously processed URL', () => {
    const { state, token } = beginExtraction(INITIAL_PREVIEW_STATE, 'https://a.pl/')
    const done = resolveExtraction(state, token, success('https://a.pl/'))
    expect(isPreviewForDifferentUrl(done, 'https://a.pl/')).toBe(false)
    expect(isPreviewForDifferentUrl(done, 'https://a.pl/ ')).toBe(false) // whitespace-insensitive
    expect(isPreviewForDifferentUrl(done, 'https://b.pl/')).toBe(true)
    expect(isPreviewForDifferentUrl(INITIAL_PREVIEW_STATE, 'https://b.pl/')).toBe(false)
  })

  it('exposes duplicate candidates in the success state', () => {
    const { state, token } = beginExtraction(INITIAL_PREVIEW_STATE, 'https://a.pl/')
    const done = resolveExtraction(
      state,
      token,
      success('https://a.pl/', {
        duplicates: [
          { id: 'd1', name: 'Sauna Leśna', city: 'Poznań', status: 'active', distance_m: 90, match_reasons: ['name'] },
        ],
      })
    )
    expect(done.result?.duplicates).toHaveLength(1)
  })
})

describe('form mapping', () => {
  it('prefills only extracted fields and preserves the rest', () => {
    const current = { ...EMPTY_FORM, name: 'Wpisane ręcznie', description: 'Mój opis' }
    const partialDraft: FacilityDraft = { city: DRAFT.city, website: DRAFT.website }
    const { values } = applyDraftToForm(partialDraft, current)
    expect(values).toEqual({
      name: 'Wpisane ręcznie', // untouched — not extracted
      description: 'Mój opis',
      city: 'Poznań',
      website: 'https://saunalesna.pl',
      lat: '',
      lng: '',
      phone: '',
      email: '',
      address: '',
      openingHours: null,
      socialLinks: {},
    })
  })

  it('maps recognized social links per platform and keeps manual ones (Slice 3C)', () => {
    const draft: FacilityDraft = {
      socialLinks: {
        value: [
          'https://www.facebook.com/saunalesna?fbclid=xyz',
          'https://www.youtube.com/@saunalesna',
          'https://unsupported.example.com/profil',
        ],
        origin: 'html',
        confidence: 'medium',
        sourceHint: 'page links',
      },
    }
    const current = { ...EMPTY_FORM, socialLinks: { instagram: 'https://www.instagram.com/manual/' } }
    const { values } = applyDraftToForm(draft, current)
    expect(values.socialLinks).toEqual({
      facebook: 'https://www.facebook.com/saunalesna', // tracking stripped
      youtube: 'https://www.youtube.com/@saunalesna',
      instagram: 'https://www.instagram.com/manual/', // manual value preserved
    })
  })

  it('maps phone, email, address and opening hours into the form (Slice 3)', () => {
    const draft: FacilityDraft = {
      ...DRAFT,
      address: { value: 'Termalna 1', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD PostalAddress' },
      openingHours: { value: HOURS, origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD openingHoursSpecification' },
    }
    const { values } = applyDraftToForm(draft, EMPTY_FORM)
    expect(values.phone).toBe('+48 600 100 200')
    expect(values.email).toBe('x@saunalesna.pl')
    expect(values.address).toBe('Termalna 1')
    expect(values.openingHours).toEqual(HOURS)
  })

  it('maps coordinates into the lat/lng string inputs', () => {
    const { values } = applyDraftToForm(DRAFT, EMPTY_FORM)
    expect(values.lat).toBe('52.4')
    expect(values.lng).toBe('16.9')
  })

  it('user edits after apply stand until an explicit re-apply overrides them', () => {
    const { values } = applyDraftToForm(DRAFT, EMPTY_FORM)
    const edited = { ...values, name: 'Poprawiona nazwa' }
    expect(edited.name).toBe('Poprawiona nazwa') // client state owns the value
    const reapplied = applyDraftToForm(DRAFT, edited)
    expect(reapplied.values.name).toBe('Sauna Leśna') // only re-apply overwrites
  })

  it('clearing restores the pre-import snapshot', () => {
    const manual = { ...EMPTY_FORM, name: 'Ręczna nazwa', city: 'Kraków' }
    const { values, snapshot } = applyDraftToForm(DRAFT, manual)
    expect(values.name).toBe('Sauna Leśna')
    expect(clearImportedValues(snapshot)).toEqual(manual)
  })

  it('lists extracted values without a form field instead of discarding them', () => {
    // phone/email/address/openingHours moved into the form in Slice 3
    expect(unmappedFields(DRAFT)).toEqual([])
    const withExtras: FacilityDraft = {
      ...DRAFT,
      country: { value: 'PL', origin: 'jsonld', confidence: 'high', sourceHint: 'JSON-LD addressCountry' },
      sourceTitle: { value: 'Sauna Leśna — oficjalna strona', origin: 'metadata', confidence: 'medium', sourceHint: 'og:site_name' },
    }
    expect(unmappedFields(withExtras)).toEqual(['country', 'sourceTitle'])
    expect(unmappedFields({})).toEqual([])
  })

  it('serializes opening hours into the JSONB object contract', () => {
    expect(openingHoursToJson(HOURS)).toEqual({
      specifications: [{ days: ['Mo', 'Tu'], opens: '09:00', closes: '21:00' }],
      raw: ['So-Nd 10:00-18:00'],
      note: null,
    })
  })

  it('summarizes opening hours for the form chip', () => {
    expect(openingHoursSummary(HOURS)).toBe('Mo, Tu: 09:00–21:00 · So-Nd 10:00-18:00')
    expect(openingHoursSummary({ specifications: [], raw: [] })).toBe('')
  })
})

describe('clearPreview', () => {
  it('returns to idle while keeping the token monotonic', () => {
    const { state, token } = beginExtraction(INITIAL_PREVIEW_STATE, 'https://a.pl/')
    const done = resolveExtraction(state, token, success('https://a.pl/'))
    const cleared = clearPreview(done)
    expect(cleared.phase).toBe('idle')
    expect(cleared.result).toBeNull()
    expect(cleared.token).toBeGreaterThan(done.token)
  })
})
