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
  resolveExtraction,
  unmappedFields,
  type ImportableFormValues,
} from '../previewState'
import type { FacilityDraft } from '../types'

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
    ...overrides,
  }
}

const FAILURE: ExtractDraftResult = { ok: false, code: 'fetch-failed', message: 'Nie udało się pobrać danych' }

const EMPTY_FORM: ImportableFormValues = { name: '', description: '', city: '', website: '', lat: '', lng: '' }

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
    })
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
    expect(unmappedFields(DRAFT)).toEqual(['phone', 'email'])
    expect(unmappedFields({})).toEqual([])
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
