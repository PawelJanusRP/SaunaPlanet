'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AddPhotoModal({
  itemId,
  onClose,
  onUploaded,
}: {
  itemId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function handleUpload() {
    if (!file) return

    setLoading(true)

    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${itemId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('item-images')
        .upload(path, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('item-images')
        .getPublicUrl(path)

      const { error: dbError } = await supabase
        .from('item_photos')
        .insert([
          {
            item_id: itemId,
            image_url: data.publicUrl,
          },
        ])

      if (dbError) throw dbError

      setFile(null)
      if (fileRef.current) fileRef.current.value = ''

      onUploaded()
      onClose()
    } catch (e) {
      console.error(e)
      alert('Błąd uploadu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-white p-4 rounded w-80">
        <h2 className="font-bold mb-2">Dodaj zdjęcie</h2>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="mb-2"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <button
          onClick={handleUpload}
          disabled={loading}
          className="w-full bg-black text-white p-2 mb-2"
        >
          {loading ? 'Wysyłanie...' : 'Wyślij'}
        </button>

        <button
          onClick={onClose}
          className="w-full border p-2"
        >
          Zamknij
        </button>
      </div>
    </div>
  )
}