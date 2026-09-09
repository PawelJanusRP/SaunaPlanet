/**
 * SP-038 Slice 3 — import provenance context for facility moderation.
 *
 * Server-rendered, read-only. Shows WHERE a linked pending submission's
 * data came from: source URL, provider kind, operation timestamp and the
 * per-field provenance (origin + confidence + source hint) that Slice 2
 * already persists in import_log.extracted.draft. Nothing here mutates
 * anything — moderation decisions stay in FacilityModerationActions.
 */

import { getLocale, getTranslations } from 'next-intl/server'
import { openingHoursSummary } from '@/lib/import/previewState'
import type { OpeningHoursDraft } from '@/lib/import/types'

export type ImportLogProvenanceRow = {
  id: string
  url: string
  source_kind: string
  result: string
  created_at: string
  extracted: Record<string, unknown> | null
}

const DB_SOURCE_KIND_KEYS = new Set([
  'website',
  'facebook_page',
  'facebook_event',
  'instagram',
  'google_maps',
  'other',
])

const FIELD_KEYS = new Set([
  'name',
  'description',
  'address',
  'city',
  'country',
  'phone',
  'email',
  'website',
  'geo',
  'openingHours',
  'imageUrl',
  'socialLinks',
  'sourceTitle',
])

const ORIGIN_KEYS = new Set([
  'jsonld',
  'opengraph',
  'metadata',
  'html',
  'inferred',
  'user',
])

const CONFIDENCE_KEYS = new Set(['high', 'medium', 'low'])

type DraftField = {
  value: unknown
  origin?: string
  confidence?: string
  sourceHint?: string
}

function fieldValueText(key: string, value: unknown): string {
  if (value == null) return ''
  if (key === 'geo' && typeof value === 'object') {
    const geo = value as { latitude?: number; longitude?: number }
    return `${geo.latitude}, ${geo.longitude}`
  }
  if (key === 'openingHours' && typeof value === 'object') {
    return openingHoursSummary(value as OpeningHoursDraft)
  }
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

export default async function ImportProvenancePanel({ row }: { row: ImportLogProvenanceRow }) {
  const t = await getTranslations('sauna')
  const locale = await getLocale()
  const extracted = row.extracted ?? {}
  const draft = (extracted.draft ?? {}) as Record<string, DraftField>
  const fields = Object.entries(draft).filter(
    ([, field]) => field && typeof field === 'object' && 'value' in field
  )

  return (
    <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-900">
      <p className="font-semibold">
        {t('provenance.heading')}
      </p>
      <p className="mt-0.5">
        {DB_SOURCE_KIND_KEYS.has(row.source_kind)
          ? t(`provenance.sourceKind.${row.source_kind}`)
          : row.source_kind}
        {' · '}
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="break-all font-mono underline"
        >
          {row.url}
        </a>
        {' · '}
        {new Date(row.created_at).toLocaleString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {row.result === 'partial' && t('provenance.partialImport')}
      </p>
      {fields.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {fields.map(([key, field]) => (
            <li key={key} className="text-blue-800">
              <span className="font-medium">
                {FIELD_KEYS.has(key) ? t(`provenance.field.${key}`) : key}:
              </span>{' '}
              <span className="break-words">{fieldValueText(key, field.value)}</span>
              <span className="text-blue-500">
                {' — '}
                {field.origin && ORIGIN_KEYS.has(field.origin)
                  ? t(`provenance.origin.${field.origin}`)
                  : field.origin}
                {field.confidence && field.confidence !== 'high' && (
                  <> · {CONFIDENCE_KEYS.has(field.confidence)
                    ? t(`provenance.confidence.${field.confidence}`)
                    : field.confidence}</>
                )}
                {field.sourceHint && <> ({field.sourceHint})</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-blue-500">
        {t('provenance.footnote')}
      </p>
    </div>
  )
}
