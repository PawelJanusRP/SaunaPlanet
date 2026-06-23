'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import imageCompression from 'browser-image-compression'

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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('public_sauna')
  const [city, setCity] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
      const supabase = createClient()
      const { data: itemData, error: itemError } = await supabase
        .from('saunas')
        .insert([
          {
            name: name.trim(),
            description: description.trim(),
            category,
            latitude,
            longitude,
            city: city.trim() || null,
            status: 'active',
          },
        ])
        .select('id')
        .single()

      if (itemError || !itemData) {
        throw itemError ?? new Error('Nie udało się dodać sauny')
      }

      if (photo) {
  const compressedPhoto = await imageCompression(photo, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
  })

  const fileExt = compressedPhoto.name.split('.').pop() || 'jpg'
  const filePath = `${itemData.id}/${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('sauna-images')
    .upload(filePath, compressedPhoto)

        if (uploadError) {
          throw uploadError
        }

        const { data: publicUrlData } = supabase.storage
          .from('sauna-images')
          .getPublicUrl(filePath)

        const { error: photoError } = await supabase.from('sauna_photos').insert([
          {
            sauna_id: itemData.id,
            image_url: publicUrlData.publicUrl,
          },
        ])

        if (photoError) {
          throw photoError
        }
      }

      setName('')
      setDescription('')
      setCity('')
      setPhoto(null)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      onAdded()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Wystąpił błąd')
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
        onChange={(e) => setName(e.target.value)}
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
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full rounded-xl bg-black p-3 text-white disabled:opacity-50"
      >
        {loading ? 'Dodawanie...' : 'Dodaj saunę'}
      </button>
    </div>
  </>
)
}