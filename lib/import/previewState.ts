// SP-038 Slice 2 — pure import-preview state machine and form mapping.
//
// All preview behavior that matters (stale-response protection, second
// extraction replacing the first, apply/clear with snapshot restore,
// preview-belongs-to-previous-URL detection) lives here as pure functions
// so it is deterministic and unit-tested; the React component in
// components/ImportFromUrlSection.tsx is a thin renderer.

import type { ExtractDraftResult, ExtractDraftSuccess } from './actionCore'
import type { FacilityDraft } from './types'

export type ImportPreviewState = {
  phase: 'idle' | 'loading' | 'success' | 'error'
  /** Token of the most recent request — older responses are dropped. */
  token: number
  /** Raw input the current preview/loading state belongs to. */
  processedInput: string | null
  result: ExtractDraftSuccess | null
  error: Extract<ExtractDraftResult, { ok: false }> | null
}

export const INITIAL_PREVIEW_STATE: ImportPreviewState = {
  phase: 'idle',
  token: 0,
  processedInput: null,
  result: null,
  error: null,
}

/** Starts a new extraction; the returned token authorizes its resolution. */
export function beginExtraction(
  state: ImportPreviewState,
  rawInput: string
): { state: ImportPreviewState; token: number } {
  const token = state.token + 1
  return {
    token,
    state: { phase: 'loading', token, processedInput: rawInput, result: null, error: null },
  }
}

/**
 * Resolves an extraction. A response carrying a token other than the
 * latest one is stale (an older slow response, or a cancelled request)
 * and leaves the state untouched.
 */
export function resolveExtraction(
  state: ImportPreviewState,
  token: number,
  outcome: ExtractDraftResult
): ImportPreviewState {
  if (token !== state.token || state.phase !== 'loading') return state
  if (outcome.ok) {
    return { ...state, phase: 'success', result: outcome, error: null }
  }
  return { ...state, phase: 'error', result: null, error: outcome }
}

/** Cancels an in-flight extraction: bumps the token so the response is dropped. */
export function cancelExtraction(state: ImportPreviewState): ImportPreviewState {
  return { ...INITIAL_PREVIEW_STATE, token: state.token + 1 }
}

/** Clears the preview entirely (keeps the token monotonic). */
export function clearPreview(state: ImportPreviewState): ImportPreviewState {
  return { ...INITIAL_PREVIEW_STATE, token: state.token + 1 }
}

/** True when the visible preview was produced for a different input URL. */
export function isPreviewForDifferentUrl(state: ImportPreviewState, currentInput: string): boolean {
  return (
    (state.phase === 'success' || state.phase === 'error') &&
    state.processedInput !== null &&
    state.processedInput.trim() !== currentInput.trim()
  )
}

/** The subset of the /submit form the importer may prefill (Slice 2). */
export type ImportableFormValues = {
  name: string
  description: string
  city: string
  website: string
  lat: string
  lng: string
}

/**
 * Maps extracted draft values onto the existing form fields. Only fields
 * with an extracted value are overwritten; everything else (including
 * category and any manual input in untouched fields) is preserved. The
 * returned snapshot restores the pre-import values on "clear".
 */
export function applyDraftToForm(
  draft: FacilityDraft,
  current: ImportableFormValues
): { values: ImportableFormValues; snapshot: ImportableFormValues } {
  const snapshot = { ...current }
  const values = { ...current }
  if (draft.name) values.name = draft.name.value
  if (draft.description) values.description = draft.description.value
  if (draft.city) values.city = draft.city.value
  if (draft.website) values.website = draft.website.value
  if (draft.geo) {
    values.lat = String(draft.geo.value.latitude)
    values.lng = String(draft.geo.value.longitude)
  }
  return { values, snapshot }
}

/** Restores the form to its pre-import snapshot. */
export function clearImportedValues(snapshot: ImportableFormValues): ImportableFormValues {
  return { ...snapshot }
}

/**
 * Draft fields that have no form input yet (kept visible in the preview's
 * information area and carried by the action result for Slice 3 —
 * extracted values are never silently discarded).
 */
export const UNMAPPED_DRAFT_KEYS = [
  'address',
  'country',
  'phone',
  'email',
  'openingHours',
  'imageUrl',
  'socialLinks',
  'sourceTitle',
] as const satisfies ReadonlyArray<keyof FacilityDraft>

export function unmappedFields(draft: FacilityDraft): Array<(typeof UNMAPPED_DRAFT_KEYS)[number]> {
  return UNMAPPED_DRAFT_KEYS.filter((key) => draft[key] !== undefined)
}
