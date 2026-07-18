'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import imageCompression from 'browser-image-compression'
import { useAuth } from '@/components/AuthProvider'
import {
  submitFacility,
  findSimilarFacilities,
  type SimilarFacility,
} from '@/app/saunas/actions'

const categories = [
  { value: 'public_sauna', label: '🧖 Sauna publiczna' },
  { value: 'spa', label: '♨️ SPA / wellness' },
  { value: 'hotel', label: '🏨 Sauna hotelowa' },
  { value: 'outdoor', label: '🌲 Sauna plenerowa' },
  { value: 'event', label: '🔥 Event saunowy' },
]

export default function AddItemForm({
  onAdded,
  onClose,
  latitude,
  longitude,
}: {
  onAdded: () => void
  onClose: () => void
  latitude: number | undefined
  longitude: number | undefined
}) {
  const { user, loading: authLoading } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('public_sauna')
  const [city, setCity] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  // Duplicate warning state: null = not checked yet; [] = checked, clean.
  // Warn-only by contract — the user can always proceed.
  const [duplicates, setDuplicates] = useState<SimilarFacility[] | null>(null)

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
      toast.error('Podaj nazwę sauny lub obiektu')
      return
    }
    if (latitude === undefined || longitude === undefined) {
      toast.error('Kliknij na mapie, aby ustawić lokalizację')
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
          setLoading(false)
          return // show the warning; user resubmits to proceed
        }
        setDuplicates([])
      }

      // Step 2: moderated server-side submission (SP-036).
      const result = await submitFacility({
        name,
        description: description || null,
        category,
        city: city || null,
        latitude,
        longitude,
      })
      if (result.error || !result.id) {
        toast.error(result.error ?? 'Nie udało się zgłosić sauny')
        setLoading(false)
        return
      }

      try {
        await uploadPhoto(result.id)
      } catch (photoError) {
        console.error(photoError)
        toast.error('Saunę zgłoszono, ale nie udało się dodać zdjęcia')
      }

      if (result.status === 'active') {
        toast.success('Dodano saunę')
      } else {
        toast.success(
          'Zgłoszenie przyjęte! Sauna pojawi się na mapie po zatwierdzeniu przez moderację.'
        )
      }

      setName('')
      setDescription('')
      setCity('')
      setPhoto(null)
      setDuplicates(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      onAdded()
      onClose()
    } catch (error) {
      console.error(error)
      toast.error('Wystąpił błąd — spróbuj ponownie')
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

      <h2 className="mb-2 font-bold">Dodaj saunę</h2>

      {!authLoading && !user ? (
        <div className="py-4 text-center">
          <p className="mb-3 text-sm text-gray-600">
            Zgłaszanie saun wymaga zalogowania.
          </p>
          <Link
            href="/auth/login"
            className="inline-block rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            Zaloguj się
          </Link>
        </div>
      ) : (
      <>
      <p className="mb-2 text-xs text-gray-600">
        Lokalizacja:{' '}
        {latitude !== undefined && longitude !== undefined
          ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : 'kliknij na mapie'}
      </p>

      <input
        className="mb-2 w-full border p-2"
        placeholder="Nazwa sauny/obiektu"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setDuplicates(null) // name changed → re-check duplicates
        }}
      />

      <input
        className="mb-2 w-full border p-2"
        placeholder="Miasto (opcjonalnie)"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />

      <textarea
        className="mb-2 w-full border p-2"
        placeholder="Opis, godziny otwarcia, zasady, atrakcje"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

	<select
	  className="mb-2 w-full rounded border p-2"
	  value={category}
	  onChange={(e) => setCategory(e.target.value)}
	>
	  {categories.map((cat) => (
		<option key={cat.value} value={cat.value}>
		  {cat.label}
		</option>
	  ))}
	</select>

 <div className="mb-3">
  <label className="mb-2 block text-sm font-semibold text-gray-700">
    Zdjęcie
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
          alt="Preview"
          className="mb-2 h-32 w-full rounded-lg object-cover"
        />

        <div className="text-sm font-semibold text-gray-700">
          Zmień zdjęcie
        </div>
      </>
    ) : (
      <>
        <div className="text-3xl">📷</div>

        <div className="mt-2 text-sm font-semibold text-gray-700">
          Dodaj zdjęcie
        </div>

        <div className="text-xs text-gray-500">
          Otwieranie może chwilę potrwać
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
    Zdjęcie wybrane
  </div>
)}

</div>

      {duplicates !== null && duplicates.length > 0 && (
        <div className="mb-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3">
          <p className="mb-1 text-xs font-semibold text-yellow-800">
            ⚠️ Podobne obiekty już istnieją:
          </p>
          <ul className="mb-1 space-y-0.5 text-xs text-yellow-800">
            {duplicates.map((d) => (
              <li key={d.id}>
                • {d.name}
                {d.city && ` (${d.city})`}
                {d.status === 'pending' && ' — czeka na moderację'}
                {d.distance_m !== null && d.distance_m < 1000 &&
                  ` — ${Math.round(d.distance_m)} m stąd`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-yellow-700">
            Jeśli to inny obiekt, kliknij „Wyślij mimo to”.
          </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full rounded-xl bg-black p-3 text-white disabled:opacity-50"
      >
        {loading
          ? 'Wysyłanie...'
          : duplicates !== null && duplicates.length > 0
            ? 'Wyślij mimo to'
            : 'Zgłoś saunę'}
      </button>

      <p className="mt-2 text-center text-[11px] text-gray-400">
        Zgłoszenie trafi do moderacji przed publikacją na mapie.
      </p>
      </>
      )}
    </div>
  </>
)
}
