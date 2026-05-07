'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export default function AddItemForm({
  onAdded,
  latitude,
  longitude,
}: {
  onAdded: () => void
  latitude: number | undefined
  longitude: number | undefined
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let id = localStorage.getItem('device_id')

    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('device_id', id)
    }

    setDeviceId(id)
  }, [])

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('Podaj tytuł')
      return
    }

    if (latitude === undefined || longitude === undefined) {
      toast.error('Kliknij na mapie, aby ustawić lokalizację')
      return
    }

    if (!deviceId) {
      toast.error('Nie udało się ustalić identyfikatora urządzenia')
      return
    }

    setLoading(true)

    try {
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .insert([
          {
            title: title.trim(),
            description: description.trim(),
            category: 'furniture',
            condition: 'good',
            size: 'medium',
            latitude,
            longitude,
            location: `POINT(${longitude} ${latitude})`,
            user_id: null,
            status: 'active',
            expires_at: new Date(
              Date.now() + 24 * 60 * 60 * 1000
            ).toISOString(),
            created_by_device_id: deviceId,
          },
        ])
        .select('id')
        .single()

      if (itemError || !itemData) {
        throw itemError ?? new Error('Nie udało się dodać przedmiotu')
      }

      if (photo) {
        const fileExt = photo.name.split('.').pop() || 'jpg'
        const filePath = `${itemData.id}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('item-images')
          .upload(filePath, photo)

        if (uploadError) {
          throw uploadError
        }

        const { data: publicUrlData } = supabase.storage
          .from('item-images')
          .getPublicUrl(filePath)

        const { error: photoError } = await supabase.from('item_photos').insert([
          {
            item_id: itemData.id,
            image_url: publicUrlData.publicUrl,
          },
        ])

        if (photoError) {
          throw photoError
        }
      }

      setTitle('')
      setDescription('')
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
    <div className="fixed right-4 top-10 z-[9999] w-72 rounded border bg-white p-4 shadow-lg">
      <h2 className="mb-2 font-bold">Dodaj przedmiot</h2>

      <p className="mb-2 text-xs text-gray-600">
        Lokalizacja:{' '}
        {latitude !== undefined && longitude !== undefined
          ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : 'kliknij na mapie'}
      </p>

      <input
        className="mb-2 w-full border p-2"
        placeholder="Tytuł"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        className="mb-2 w-full border p-2"
        placeholder="Opis"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <input
        ref={fileInputRef}
        className="mb-2 w-full text-sm"
        type="file"
        accept="image/*"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-black p-2 text-white disabled:opacity-50"
      >
        {loading ? 'Dodawanie...' : 'Dodaj'}
      </button>
    </div>
  )
}