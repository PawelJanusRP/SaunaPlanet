'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import {
  submitFacility,
  submitFacilityWithEvent,
  findSimilarFacilities,
  type SimilarFacility,
} from '@/app/saunas/actions'
import BundledEventFields, {
  EMPTY_BUNDLED_EVENT,
  type BundledEventDraft,
} from '@/components/BundledEventFields'
import ImportFromUrlSection from '@/components/ImportFromUrlSection'
import { importSubmissionImage, linkImportToSubmission } from '@/app/saunas/importActions'
import {
  applyDraftToForm,
  clearImportedValues,
  openingHoursSummary,
  openingHoursToJson,
  type ImportableFormValues,
} from '@/lib/import/previewState'
import { SOCIAL_PLATFORMS, type SocialLinks } from '@/lib/import/social'
import type { FacilityDraft, OpeningHoursDraft } from '@/lib/import/types'

const SOCIAL_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

const CATEGORY_VALUES = ['public_sauna', 'spa', 'hotel', 'resort', 'private', 'other'] as const

export default function SubmitSaunaForm({ isMaster = false }: { isMaster?: boolean }) {
  const t = useTranslations('sauna')
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<false | 'facility' | 'bundle'>(false)
  const [withEvent, setWithEvent] = useState(false)
  const [eventDraft, setEventDraft] = useState<BundledEventDraft>(EMPTY_BUNDLED_EVENT)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('public_sauna')
  const [website, setWebsite] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  // Structured opening hours arrive only via import (no manual editor in
  // the MVP) — shown as a removable summary chip, serialized on submit.
  const [openingHours, setOpeningHours] = useState<OpeningHoursDraft | null>(null)
  // Editable social-profile URLs ('' = empty input, never persisted).
  const [social, setSocial] = useState<Record<string, string>>({
    facebook: '', instagram: '', youtube: '', tiktok: '',
  })
  const [duplicates, setDuplicates] = useState<SimilarFacility[] | null>(null)
  // Pre-import form snapshot: "Wyczyść zaimportowane dane" restores the
  // manual values instead of wiping the form (SP-038 slice 2).
  const [preImportSnapshot, setPreImportSnapshot] =
    useState<ImportableFormValues | null>(null)
  // import_log row id of the applied import — linked to the submission
  // after a successful submit (SP-038 slice 3, best-effort).
  const [appliedImportId, setAppliedImportId] = useState<string | null>(null)
  // User consent from the preview checkbox (slice 3C) — when false, no
  // image request of any kind happens after submission.
  const [importImageWanted, setImportImageWanted] = useState(false)
  // Honest post-submission status of the best-effort image import.
  const [imageNote, setImageNote] = useState<string | null>(null)

  function socialAsLinks(): SocialLinks {
    const result: SocialLinks = {}
    for (const p of SOCIAL_PLATFORMS) {
      if (social[p].trim()) result[p] = social[p].trim()
    }
    return result
  }

  function currentFormValues(): ImportableFormValues {
    return {
      name, description, city, website, lat, lng, phone, email, address,
      openingHours, socialLinks: socialAsLinks(),
    }
  }

  function setFormValues(values: ImportableFormValues) {
    setName(values.name)
    setDescription(values.description)
    setCity(values.city)
    setWebsite(values.website)
    setLat(values.lat)
    setLng(values.lng)
    setPhone(values.phone)
    setEmail(values.email)
    setAddress(values.address)
    setOpeningHours(values.openingHours)
    setSocial({
      facebook: values.socialLinks.facebook ?? '',
      instagram: values.socialLinks.instagram ?? '',
      youtube: values.socialLinks.youtube ?? '',
      tiktok: values.socialLinks.tiktok ?? '',
    })
  }

  function handleImportApply(draft: FacilityDraft, importId: string | null, importImage: boolean) {
    const { values, snapshot } = applyDraftToForm(draft, currentFormValues())
    // First apply wins as the restore point; a re-apply must not capture
    // already-imported values as the "manual" snapshot.
    setPreImportSnapshot((prev) => prev ?? snapshot)
    setFormValues(values)
    setAppliedImportId(importId)
    setImportImageWanted(importImage)
    setDuplicates(null)
  }

  function handleImportClear() {
    if (preImportSnapshot) {
      setFormValues(clearImportedValues(preImportSnapshot))
      setPreImportSnapshot(null)
    }
    setAppliedImportId(null)
    setImportImageWanted(false)
    setDuplicates(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error(t('submit.errorNoName'))
      return
    }

    const latNum = lat ? parseFloat(lat) : null
    const lngNum = lng ? parseFloat(lng) : null
    if ((lat && Number.isNaN(latNum)) || (lng && Number.isNaN(lngNum))) {
      toast.error(t('submit.errorBadCoords'))
      return
    }

    setSaving(true)

    // Duplicate check (warn-only, once per name). Server-side degradation
    // to an empty list keeps this from ever blocking a submission.
    if (duplicates === null) {
      const { matches } = await findSimilarFacilities({
        name: name.trim(),
        lat: latNum,
        lng: lngNum,
        website: website.trim() || null,
      })
      if (matches.length > 0) {
        setDuplicates(matches)
        setSaving(false)
        return
      }
      setDuplicates([])
    }

    // SP-036: single moderated server-side workflow — no client-side
    // inserts, no writes to the legacy sauna_submissions table. Verified
    // masters may bundle one event (SP-037B rule A).
    const facilityInput = {
      name,
      description: description || null,
      city: city || null,
      category,
      website: website || null,
      latitude: latNum,
      longitude: lngNum,
      phone: phone || null,
      email: email || null,
      address: address || null,
      openingHours: openingHours ? openingHoursToJson(openingHours) : null,
      socialLinks: socialAsLinks(),
    }
    const bundling = isMaster && withEvent
    const result = bundling
      ? await submitFacilityWithEvent(facilityInput, {
          title: eventDraft.title,
          eventDate: eventDraft.eventDate,
          eventTime: eventDraft.eventTime || null,
          price: eventDraft.price.trim() || null,
          description: eventDraft.description.trim() || null,
          maxParticipants: eventDraft.maxParticipants
            ? Number(eventDraft.maxParticipants)
            : null,
        })
      : await submitFacility(facilityInput)

    setSaving(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    // SP-038 slice 3: link the applied import operation to the created
    // pending sauna (moderation provenance). Best-effort by contract —
    // the RPC no-ops safely and a failed link never disturbs the
    // already-successful submission.
    const createdSaunaId = bundling
      ? (result as { facilityId?: string }).facilityId
      : (result as { id?: string }).id
    if (appliedImportId && createdSaunaId) {
      const { linked } = await linkImportToSubmission(appliedImportId, createdSaunaId)
      // Slice 3C: consent-gated image copy — runs ONLY after a successful
      // submission, only when the checkbox stayed selected, and never
      // fails the submission (honest note instead).
      if (importImageWanted) {
        if (linked) {
          const imageResult = await importSubmissionImage(appliedImportId, createdSaunaId)
          setImageNote(
            imageResult.ok
              ? t('submit.imageNoteAdded')
              : t('submit.imageNoteFailedManual', { message: imageResult.message })
          )
        } else {
          setImageNote(
            t('submit.imageNoteAutoFailed')
          )
        }
      }
    }

    // atomic bundle (SP-037B): either the whole submission succeeded or an
    // error was returned above — no partial outcomes exist
    setDone(bundling ? 'bundle' : 'facility')
  }

  if (done) {
    return (
      <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl">🎉</div>
        <h2 className="mb-2 text-xl font-bold">{t('submit.doneHeading')}</h2>
        <p className="mb-6 text-sm text-gray-500">
          {done === 'bundle'
            ? t('submit.doneBundle')
            : t('submit.doneFacility')}
          {' '}{t('submit.doneStatusHint')}
        </p>
        {imageNote && (
          <p className="mb-6 rounded-xl bg-gray-50 px-4 py-2 text-xs text-gray-600">
            📷 {imageNote}
          </p>
        )}
        <button
          onClick={() => router.refresh()}
          className="mr-2 rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
        >
          {t('submit.doneSeeStatus')}
        </button>
        <button
          onClick={() => router.push('/')}
          className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          {t('submit.doneBackToMap')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <ImportFromUrlSection onApply={handleImportApply} onClearImport={handleImportClear} />
      <form onSubmit={handleSubmit} className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDuplicates(null)
            }}
            required
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder={t('submit.namePlaceholder')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.categoryLabel')}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            {CATEGORY_VALUES.map((value) => (
              <option key={value} value={value}>{t(`submit.categories.${value}`)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.cityLabel')}
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder={t('submit.cityPlaceholder')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder={t('submit.descriptionPlaceholder')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.websiteLabel')}
          </label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.addressLabel')}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder={t('submit.addressPlaceholder')}
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('submit.phoneLabel')}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('submit.phonePlaceholder')}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('submit.emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('submit.emailPlaceholder')}
            />
          </div>
        </div>

        {openingHours && (
          <div className="rounded-xl border bg-gray-50 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-gray-500">
                  {t('submit.openingHoursLabel')}
                </p>
                <p className="mt-0.5 text-sm text-gray-800">
                  {openingHoursSummary(openingHours)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpeningHours(null)}
                className="shrink-0 text-xs text-gray-500 underline hover:text-gray-700"
              >
                {t('submit.openingHoursRemove')}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              {t('submit.openingHoursNote')}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.socialLabel')}
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <input
                key={p}
                type="url"
                value={social[p]}
                onChange={(e) => setSocial((prev) => ({ ...prev, [p]: e.target.value }))}
                placeholder={t('submit.socialPlaceholder', { platform: SOCIAL_LABELS[p] })}
                aria-label={t('submit.socialAriaLabel', { platform: SOCIAL_LABELS[p] })}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {t('submit.socialNote')}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('submit.locationLabel')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('submit.latPlaceholder')}
            />
            <input
              type="text"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('submit.lngPlaceholder')}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {t('submit.locationNote')}
          </p>
        </div>
      </div>

      {isMaster && (
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={withEvent}
              onChange={(e) => setWithEvent(e.target.checked)}
            />
            {t('submit.addEventLabel')}
          </label>
          {withEvent && (
            <div className="mt-2">
              <BundledEventFields value={eventDraft} onChange={setEventDraft} />
            </div>
          )}
        </div>
      )}

      {duplicates !== null && duplicates.length > 0 && (
        <div className="mt-4 rounded-xl border border-yellow-300 bg-yellow-50 p-3">
          <p className="mb-1 text-sm font-semibold text-yellow-800">
            {t('submit.duplicatesHeading')}
          </p>
          <ul className="mb-1 space-y-0.5 text-sm text-yellow-800">
            {duplicates.map((d) => (
              <li key={d.id}>
                • {d.name}
                {d.city && ` (${d.city})`}
                {d.status === 'pending' && t('submit.duplicatePending')}
              </li>
            ))}
          </ul>
          <p className="text-xs text-yellow-700">
            {t('submit.duplicatesHint')}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving
          ? t('submit.submitting')
          : duplicates !== null && duplicates.length > 0
            ? t('submit.submitAnyway')
            : t('submit.submit')}
      </button>
      </form>
    </div>
  )
}
