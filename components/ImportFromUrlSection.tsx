'use client'

/**
 * SP-038 Slice 2 — "Importuj dane z adresu URL" section on /submit.
 *
 * Progressive enhancement over the manual form: import is optional and an
 * import failure never makes the manual form unusable. All state
 * transitions (stale-response drop, cancel, second extraction replacing
 * the first) delegate to the pure, unit-tested machine in
 * lib/import/previewState.ts. Authorization lives in the server action —
 * this component is presentation only.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { extractFacilityDraft } from '@/app/saunas/importActions'
import {
  INITIAL_PREVIEW_STATE,
  beginExtraction,
  cancelExtraction,
  clearPreview,
  isPreviewForDifferentUrl,
  resolveExtraction,
  unmappedFields,
  type ImportPreviewState,
} from '@/lib/import/previewState'
import type { ExtractedField, FacilityDraft, SourceKind } from '@/lib/import/types'

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  website: 'Strona internetowa',
  facebook_page: 'Strona na Facebooku',
  facebook_post: 'Post na Facebooku',
  facebook_event: 'Wydarzenie na Facebooku',
  instagram_profile: 'Profil na Instagramie',
  instagram_post: 'Post na Instagramie',
  google_maps: 'Google Maps',
  unsupported: 'Nieobsługiwane źródło',
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nazwa',
  description: 'Opis',
  address: 'Adres',
  city: 'Miasto',
  country: 'Kraj',
  phone: 'Telefon',
  email: 'E-mail',
  website: 'Strona WWW',
  geo: 'Współrzędne',
  openingHours: 'Godziny otwarcia',
  imageUrl: 'Obraz ze źródła',
  socialLinks: 'Profile społecznościowe',
  sourceTitle: 'Tytuł źródła',
}

const MATCH_REASON_LABELS: Record<string, string> = {
  name: 'podobna nazwa',
  location: 'bliska lokalizacja',
  website: 'ta sama strona WWW',
  source_url: 'ten sam adres źródłowy',
  phone: 'ten sam numer telefonu',
}

function provenanceLabel(field: ExtractedField<unknown>): string {
  if (field.origin === 'jsonld') return 'Znalezione w danych strukturalnych strony'
  if (field.origin === 'opengraph' || field.origin === 'metadata') {
    return 'Znalezione w metadanych strony'
  }
  return 'Prawdopodobna wartość — sprawdź przed wysłaniem'
}

function confidenceLabel(field: ExtractedField<unknown>): string | null {
  if (field.confidence === 'low') return 'sprawdź przed wysłaniem'
  if (field.confidence === 'medium') return 'średnia pewność'
  return null
}

function unsupportedMessage(kind: SourceKind | undefined): string {
  if (kind === 'google_maps') {
    return 'Import z Google Maps nie jest obsługiwany. Wklej adres oficjalnej strony obiektu albo wypełnij formularz ręcznie.'
  }
  if (kind === 'facebook_page' || kind === 'facebook_post' || kind === 'facebook_event') {
    return 'Facebook nie udostępnia tych danych do automatycznego importu. Skopiuj informacje ręcznie do formularza poniżej.'
  }
  if (kind === 'instagram_profile' || kind === 'instagram_post') {
    return 'Instagram nie udostępnia danych do automatycznego importu. Skopiuj informacje ręcznie do formularza poniżej.'
  }
  return 'Automatyczny import z tego źródła nie jest obsługiwany — wypełnij formularz ręcznie.'
}

function fieldValueText(key: string, field: ExtractedField<unknown>): string {
  if (key === 'geo') {
    const geo = field.value as { latitude: number; longitude: number }
    return `${geo.latitude}, ${geo.longitude}`
  }
  if (key === 'openingHours') {
    const hours = field.value as {
      specifications: Array<{ days: string[]; opens: string | null; closes: string | null }>
      raw: string[]
    }
    const specs = hours.specifications.map(
      (s) => `${s.days.join(', ')}: ${s.opens ?? '?'}–${s.closes ?? '?'}`
    )
    return [...specs, ...hours.raw].join(' · ')
  }
  if (key === 'socialLinks') return (field.value as string[]).join(', ')
  return String(field.value)
}

export default function ImportFromUrlSection({
  onApply,
  onClearImport,
}: {
  onApply: (draft: FacilityDraft) => void
  onClearImport: () => void
}) {
  const [inputUrl, setInputUrl] = useState('')
  const [preview, setPreview] = useState<ImportPreviewState>(INITIAL_PREVIEW_STATE)
  const [applied, setApplied] = useState(false)
  // The ref mirrors the state so async resolutions always see the LATEST
  // token — the tested stale-drop logic in resolveExtraction stays in charge.
  const stateRef = useRef<ImportPreviewState>(INITIAL_PREVIEW_STATE)

  function update(next: ImportPreviewState) {
    stateRef.current = next
    setPreview(next)
  }

  async function handleExtract() {
    const trimmed = inputUrl.trim()
    if (!trimmed) {
      toast.error('Podaj adres URL do zaimportowania')
      return
    }
    const { state: loading, token } = beginExtraction(stateRef.current, trimmed)
    update(loading)
    setApplied(false)
    const outcome = await extractFacilityDraft(trimmed)
    update(resolveExtraction(stateRef.current, token, outcome))
  }

  function handleCancel() {
    update(cancelExtraction(stateRef.current))
  }

  function handleClear() {
    update(clearPreview(stateRef.current))
    setApplied(false)
    onClearImport()
  }

  function handleApply() {
    if (preview.phase !== 'success' || !preview.result) return
    onApply(preview.result.draft)
    setApplied(true)
    toast.success('Dane przeniesione do formularza — sprawdź i uzupełnij przed wysłaniem')
  }

  const result = preview.phase === 'success' ? preview.result : null
  const draftEntries = result
    ? (Object.entries(result.draft) as Array<[string, ExtractedField<unknown>]>).filter(
        ([, field]) => field !== undefined
      )
    : []
  const extraKeys = result ? unmappedFields(result.draft) : []
  const staleUrl = isPreviewForDifferentUrl(preview, inputUrl)

  return (
    <div className="mb-4 rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-gray-800">
        🔗 Importuj dane z adresu URL
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Wklej adres strony obiektu — spróbujemy wstępnie wypełnić formularz.
        Wszystkie dane sprawdzisz i poprawisz przed wysłaniem; nic nie
        publikuje się automatycznie.
      </p>

      <div className="flex gap-2">
        <input
          type="url"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="https://adres-strony-obiektu.pl"
          aria-label="Adres URL do zaimportowania"
        />
        {preview.phase === 'loading' ? (
          <button
            type="button"
            onClick={handleCancel}
            className="shrink-0 rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Anuluj
          </button>
        ) : (
          <button
            type="button"
            onClick={handleExtract}
            className="shrink-0 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Pobierz dane
          </button>
        )}
      </div>

      {preview.phase === 'loading' && (
        <p className="mt-3 text-sm text-gray-500">⏳ Pobieranie danych ze strony…</p>
      )}

      {staleUrl && (
        <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
          Poniższy podgląd dotyczy wcześniej przetworzonego adresu:{' '}
          <span className="font-mono">{preview.processedInput}</span>
        </p>
      )}

      {preview.phase === 'error' && preview.error && (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-sm text-orange-800">
            {preview.error.code === 'unsupported-source'
              ? unsupportedMessage(preview.error.sourceKind)
              : preview.error.message}
          </p>
          {preview.error.sourceKind && (
            <p className="mt-1 text-xs text-orange-700">
              Rozpoznane źródło: {SOURCE_KIND_LABELS[preview.error.sourceKind]}
              {preview.error.requestedUrl && (
                <>
                  {' · '}
                  <span className="break-all font-mono">{preview.error.requestedUrl}</span>
                </>
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-orange-700">
            Formularz poniżej działa normalnie — możesz wypełnić go ręcznie.
          </p>
          {(preview.error.code === 'fetch-failed' || preview.error.code === 'fetch-blocked') && (
            <button
              type="button"
              onClick={handleExtract}
              className="mt-2 rounded-xl border border-orange-300 px-3 py-1.5 text-xs text-orange-800 hover:bg-orange-100"
            >
              Spróbuj ponownie
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-semibold text-green-800">
              {result.result === 'ok' ? '✅ Pobrano dane ze strony' : '🟡 Pobrano częściowe dane'}
            </p>
            <p className="mt-1 text-xs text-green-700">
              Źródło: {SOURCE_KIND_LABELS[result.sourceKind]} ·{' '}
              <span className="break-all font-mono">{result.requestedUrl}</span>
            </p>
          </div>

          <ul className="space-y-2">
            {draftEntries.map(([key, field]) => (
              <li key={key} className="rounded-xl border p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    {FIELD_LABELS[key] ?? key}
                  </span>
                  {confidenceLabel(field) && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                      {confidenceLabel(field)}
                    </span>
                  )}
                </div>
                {key === 'imageUrl' ? (
                  <div>
                    {/* Remote source preview ONLY — never persisted, never
                        uploaded, never used as the submitted image (SP-038
                        decision 2). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={String(field.value)}
                      alt="Podgląd obrazu ze strony źródłowej"
                      className="mt-1 max-h-40 rounded-lg border object-cover"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      Podgląd ze źródła — obraz nie zostanie zapisany automatycznie.
                    </p>
                  </div>
                ) : (
                  <p className="break-words text-sm text-gray-800">{fieldValueText(key, field)}</p>
                )}
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {provenanceLabel(field)} ({field.sourceHint})
                </p>
              </li>
            ))}
          </ul>

          {extraKeys.length > 0 && (
            <p className="text-xs text-gray-500">
              ℹ️ Pola{' '}
              {extraKeys.map((k) => FIELD_LABELS[k] ?? k).join(', ')} nie mają
              jeszcze miejsca w formularzu — zostały zapisane w dzienniku importu
              i będą wykorzystane w kolejnych wersjach.
            </p>
          )}

          {result.duplicates.length > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3">
              <p className="mb-1 text-sm font-semibold text-yellow-800">
                ⚠️ Ten obiekt może już istnieć w SaunaPlanet.
              </p>
              <ul className="mb-1 space-y-1 text-sm text-yellow-800">
                {result.duplicates.map((d) => (
                  <li key={d.id}>
                    • {d.name}
                    {d.city && ` (${d.city})`}
                    {d.status === 'pending' && ' — czeka na moderację'}
                    {d.distance_m !== null && ` · ${(d.distance_m / 1000).toFixed(1)} km`}
                    {d.match_reasons.length > 0 &&
                      ` · ${d.match_reasons.map((r) => MATCH_REASON_LABELS[r] ?? r).join(', ')}`}
                    {d.status === 'active' && (
                      <>
                        {' · '}
                        <a href={`/sauna/${d.id}`} target="_blank" className="underline">
                          zobacz obiekt
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-yellow-700">
                Jeśli to ten sam obiekt, nie zgłaszaj go ponownie. Decyzję
                ostatecznie podejmuje moderacja.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {applied ? 'Wypełnij ponownie' : 'Wypełnij formularz danymi'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Wyczyść zaimportowane dane
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
