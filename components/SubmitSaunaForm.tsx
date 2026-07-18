'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  submitFacility,
  findSimilarFacilities,
  type SimilarFacility,
} from '@/app/saunas/actions'

const CATEGORIES = [
  { value: 'public_sauna',   label: 'Sauna publiczna' },
  { value: 'spa',            label: 'SPA / Wellness' },
  { value: 'hotel',          label: 'Sauna hotelowa' },
  { value: 'resort',         label: 'Ośrodek / Resort' },
  { value: 'private',        label: 'Sauna prywatna' },
  { value: 'other',          label: 'Inne' },
]

export default function SubmitSaunaForm() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('public_sauna')
  const [website, setWebsite] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [duplicates, setDuplicates] = useState<SimilarFacility[] | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Podaj nazwę sauny')
      return
    }

    const latNum = lat ? parseFloat(lat) : null
    const lngNum = lng ? parseFloat(lng) : null
    if ((lat && Number.isNaN(latNum)) || (lng && Number.isNaN(lngNum))) {
      toast.error('Współrzędne muszą być liczbami')
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
    // inserts, no writes to the legacy sauna_submissions table.
    const result = await submitFacility({
      name,
      description: description || null,
      city: city || null,
      category,
      website: website || null,
      latitude: latNum,
      longitude: lngNum,
    })

    setSaving(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl">🎉</div>
        <h2 className="mb-2 text-xl font-bold">Zgłoszenie przyjęte!</h2>
        <p className="mb-6 text-sm text-gray-500">
          Dziękujemy. Zgłoszenie trafi do moderacji i po zatwierdzeniu sauna pojawi się na mapie.
          Status znajdziesz poniżej na tej stronie.
        </p>
        <button
          onClick={() => router.refresh()}
          className="mr-2 rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Zobacz status zgłoszenia
        </button>
        <button
          onClick={() => router.push('/')}
          className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          Wróć do mapy
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nazwa sauny *
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
            placeholder="np. Termy Maltańskie"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Kategoria
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Miasto
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="np. Poznań"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Opis
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="Krótki opis obiektu..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Strona WWW
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
            Lokalizacja (opcjonalnie)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Szerokość (np. 52.4069)"
            />
            <input
              type="text"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Długość (np. 16.9299)"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Współrzędne możesz skopiować z Google Maps (prawy przycisk → Jakie tu jest miejsce?)
          </p>
        </div>
      </div>

      {duplicates !== null && duplicates.length > 0 && (
        <div className="mt-4 rounded-xl border border-yellow-300 bg-yellow-50 p-3">
          <p className="mb-1 text-sm font-semibold text-yellow-800">
            ⚠️ Podobne obiekty już istnieją:
          </p>
          <ul className="mb-1 space-y-0.5 text-sm text-yellow-800">
            {duplicates.map((d) => (
              <li key={d.id}>
                • {d.name}
                {d.city && ` (${d.city})`}
                {d.status === 'pending' && ' — czeka na moderację'}
              </li>
            ))}
          </ul>
          <p className="text-xs text-yellow-700">
            Jeśli zgłaszasz inny obiekt, kliknij „Wyślij mimo to”.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving
          ? 'Wysyłanie...'
          : duplicates !== null && duplicates.length > 0
            ? 'Wyślij mimo to'
            : 'Wyślij zgłoszenie'}
      </button>
    </form>
  )
}
