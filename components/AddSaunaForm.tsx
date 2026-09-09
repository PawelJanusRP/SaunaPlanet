'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import imageCompression from 'browser-image-compression'
import { useAuth } from '@/components/AuthProvider'
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

const CATEGORY_VALUES = ['public_sauna', 'spa', 'hotel', 'outdoor', 'event'] as const

export default function AddItemForm({
  onAdded,
  onClose,
  latitude,
  longitude,
  onCenterOnDuplicate,
}: {
  onAdded: () => void
  onClose: () => void
  latitude: number | undefined
  longitude: number | undefined
  /** Pan the map to a duplicate candidate so the user can compare places. */
  onCenterOnDuplicate?: (lat: number, lng: number) => void
}) {
  const t = useTranslations('sauna')
  const { user, access, loading: authLoading } = useAuth()
  // approved-master flag: visibility only — the server action re-verifies
  const isMaster = access?.hasLinkedMasterProfile === true
  const [withEvent, setWithEvent] = useState(false)
  const [eventDraft, setEventDraft] = useState<BundledEventDraft>(EMPTY_BUNDLED_EVENT)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('public_sauna')
  const [city, setCity] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  // Duplicate warning state: null = not checked yet; [] = checked, clean.
  // Warn-only by contract — the user can always proceed.
  const [duplicates, setDuplicates] = useState<SimilarFacility[] | null>(null)
  // Coordinates of duplicate candidates, fetched client-side under RLS —
  // resolves only for active saunas and the caller's own pending rows, so
  // other users' pending submissions stay location-private.
  const [dupCoords, setDupCoords] = useState<Record<string, [number, number]>>({})

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function uploadPhoto(saunaId: string) {
    if (!photo) return
    const supabase = createClient()
    const compressedPhoto = await imageCompression(photo, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
    })
    const fileExt = compressedPhoto.name.split('.').pop() || 'jpg'
    const filePath = `${saunaId}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('sauna-images')
      .upload(filePath, compressedPhoto)
    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage
      .from('sauna-images')
      .getPublicUrl(filePath)

    // RLS: allowed for the submitter's own pending sauna (or an active
    // one); created_by/source are filled by column defaults and pinned by
    // the policy.
    const { error: photoError } = await supabase.from('sauna_photos').insert([
      { sauna_id: saunaId, image_url: publicUrlData.publicUrl },
    ])
    if (photoError) throw photoError
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error(t('addForm.errorNoName'))
      return
    }
    if (latitude === undefined || longitude === undefined) {
      toast.error(t('addForm.errorNoLocation'))
      return
    }

    setLoading(true)
    try {
      // Step 1: duplicate check (once). Provisional until V7 passes
      // end-to-end; failures degrade to an empty list server-side.
      if (duplicates === null) {
        const { matches } = await findSimilarFacilities({
          name: name.trim(),
          lat: latitude,
          lng: longitude,
        })
        if (matches.length > 0) {
          setDuplicates(matches)
          // Resolve coordinates for APPROVED candidates only and center
          // the map on the nearest one. Pending submissions (even the
          // caller's own) are excluded from centering/pin links — the map
          // anchor should always be a confirmed public facility.
          const supabase = createClient()
          const { data: coordRows } = await supabase
            .from('saunas')
            .select('id, latitude, longitude')
            .in('id', matches.map((m) => m.id))
            .eq('status', 'active')
          const coords: Record<string, [number, number]> = {}
          for (const row of (coordRows ?? []) as {
            id: string
            latitude: number | null
            longitude: number | null
          }[]) {
            if (row.latitude != null && row.longitude != null) {
              coords[row.id] = [row.latitude, row.longitude]
            }
          }
          setDupCoords(coords)
          const nearestActive = matches
            .filter((m) => coords[m.id])
            .sort(
              (a, b) =>
                (a.distance_m ?? Number.POSITIVE_INFINITY) -
                (b.distance_m ?? Number.POSITIVE_INFINITY)
            )[0]
          if (nearestActive && onCenterOnDuplicate) {
            onCenterOnDuplicate(...coords[nearestActive.id])
          }
          setLoading(false)
          return // show the warning; user resubmits to proceed
        }
        setDuplicates([])
      }

      // Step 2: moderated server-side submission (SP-036) — with the
      // optional master-only bundled event (SP-037B rule A).
      const facilityInput = {
        name,
        description: description || null,
        category,
        city: city || null,
        latitude,
        longitude,
      }
      const bundling = isMaster && withEvent
      let facilityId: string | undefined
      let facilityStatus: 'pending' | 'active' | undefined
      let errorMsg: string | undefined
      if (bundling) {
        // atomic bundle: whole submission succeeds or nothing is created
        const r = await submitFacilityWithEvent(facilityInput, {
          title: eventDraft.title,
          eventDate: eventDraft.eventDate,
          eventTime: eventDraft.eventTime || null,
          price: eventDraft.price.trim() || null,
          description: eventDraft.description.trim() || null,
          maxParticipants: eventDraft.maxParticipants
            ? Number(eventDraft.maxParticipants)
            : null,
        })
        facilityId = r.facilityId
        facilityStatus = r.facilityStatus
        errorMsg = r.error
      } else {
        const r = await submitFacility(facilityInput)
        facilityId = r.id
        facilityStatus = r.status
        errorMsg = r.error
      }
      if (errorMsg || !facilityId) {
        toast.error(errorMsg ?? t('addForm.errorSubmitFailed'))
        setLoading(false)
        return
      }

      try {
        await uploadPhoto(facilityId)
      } catch (photoError) {
        console.error(photoError)
        toast.error(t('addForm.errorPhotoFailed'))
      }

      if (facilityStatus === 'active') {
        toast.success(t('addForm.successAdded'))
      } else if (bundling) {
        toast.success(t('addForm.successBundle'))
      } else {
        toast.success(t('addForm.successFacility'))
      }

      setName('')
      setDescription('')
      setCity('')
      setPhoto(null)
      setDuplicates(null)
      setDupCoords({})
      setWithEvent(false)
      setEventDraft(EMPTY_BUNDLED_EVENT)
      if (fileInputRef.current) fileInputRef.current.value = ''

      onAdded()
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(t('addForm.errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
  <>
    <div
      className="fixed inset-0 z-[9998] bg-black/30"
      onClick={onClose}
    />

    <div
      className="
        fixed z-[9999] border bg-white p-4 shadow-lg
        left-3 right-3 bottom-3 rounded-2xl
        lg:left-auto lg:right-4 lg:top-10 lg:bottom-auto lg:w-72 lg:rounded
      "
    >
      <button
        onClick={onClose}
        className="absolute right-3 top-3 text-gray-500"
      >
        ✕
      </button>

      <h2 className="mb-2 font-bold">{t('addForm.heading')}</h2>

      {!authLoading && !user ? (
        <div className="py-4 text-center">
          <p className="mb-3 text-sm text-gray-600">
            {t('addForm.loginRequired')}
          </p>
          <Link
            href="/auth/login"
            className="inline-block rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            {t('addForm.loginLink')}
          </Link>
        </div>
      ) : (
      <>
      <p className="mb-2 text-xs text-gray-600">
        {t('addForm.locationLabel')}{' '}
        {latitude !== undefined && longitude !== undefined
          ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : t('addForm.locationPlaceholder')}
      </p>

      <input
        className="mb-2 w-full border p-2"
        placeholder={t('addForm.namePlaceholder')}
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setDuplicates(null) // name changed → re-check duplicates
          setDupCoords({})
        }}
      />

      <input
        className="mb-2 w-full border p-2"
        placeholder={t('addForm.cityPlaceholder')}
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />

      <textarea
        className="mb-2 w-full border p-2"
        placeholder={t('addForm.descriptionPlaceholder')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

	<select
	  className="mb-2 w-full rounded border p-2"
	  value={category}
	  onChange={(e) => setCategory(e.target.value)}
	>
	  {CATEGORY_VALUES.map((value) => (
		<option key={value} value={value}>
		  {t(`addForm.categories.${value}`)}
		</option>
	  ))}
	</select>

 <div className="mb-3">
  <label className="mb-2 block text-sm font-semibold text-gray-700">
    {t('addForm.photoLabel')}
  </label>

  <label
    htmlFor="photo-upload"
className="
  flex cursor-pointer flex-col items-center justify-center
  rounded-xl border-2 border-dashed border-gray-300
  bg-gray-50 p-4 text-center
  transition hover:bg-gray-100
  active:scale-[0.98] active:bg-gray-200
"
  >
    {photo ? (
      <>
        <img
          loading="lazy"
          src={URL.createObjectURL(photo)}
          alt={t('addForm.photoPreviewAlt')}
          className="mb-2 h-32 w-full rounded-lg object-cover"
        />

        <div className="text-sm font-semibold text-gray-700">
          {t('addForm.photoChange')}
        </div>
      </>
    ) : (
      <>
        <div className="text-3xl">📷</div>

        <div className="mt-2 text-sm font-semibold text-gray-700">
          {t('addForm.photoAdd')}
        </div>

        <div className="text-xs text-gray-500">
          {t('addForm.photoHint')}
        </div>
      </>
    )}
  </label>

  <input
    id="photo-upload"
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => {
      const selectedFile = e.target.files?.[0] ?? null
      setPhoto(selectedFile)
    }}
  />

{photo && (
  <div className="mt-2 text-xs text-green-700">
    {t('addForm.photoSelected')}
  </div>
)}

</div>

      {isMaster && (
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={withEvent}
            onChange={(e) => setWithEvent(e.target.checked)}
          />
          {t('addForm.addEventLabel')}
        </label>
      )}
      {isMaster && withEvent && (
        <div className="mb-3">
          <BundledEventFields value={eventDraft} onChange={setEventDraft} />
        </div>
      )}

      {duplicates !== null && duplicates.length > 0 && (
        <div className="mb-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3">
          <p className="mb-1 text-xs font-semibold text-yellow-800">
            {t('addForm.duplicatesHeading')}
          </p>
          <ul className="mb-1 space-y-0.5 text-xs text-yellow-800">
            {duplicates.map((d) => (
              <li key={d.id}>
                {dupCoords[d.id] ? (
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() =>
                      onCenterOnDuplicate?.(...(dupCoords[d.id] as [number, number]))
                    }
                  >
                    📍 {d.name}
                  </button>
                ) : (
                  <span>• {d.name}</span>
                )}
                {d.city && ` (${d.city})`}
                {d.status === 'pending' && t('addForm.duplicatePending')}
                {d.distance_m !== null && d.distance_m < 1000 &&
                  t('addForm.duplicateDistance', { distance: Math.round(d.distance_m) })}
              </li>
            ))}
          </ul>
          <p className="text-xs text-yellow-700">
            {t('addForm.duplicatesHint')}
          </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full rounded-xl bg-black p-3 text-white disabled:opacity-50"
      >
        {loading
          ? t('addForm.submitting')
          : duplicates !== null && duplicates.length > 0
            ? t('addForm.submitAnyway')
            : t('addForm.submit')}
      </button>

      <p className="mt-2 text-center text-[11px] text-gray-400">
        {t('addForm.moderationNote')}
      </p>
      </>
      )}
    </div>
  </>
)
}
