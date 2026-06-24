'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function UploadEventPhotoButton({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${eventId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('event-photos')
        .upload(path, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('event-photos').getPublicUrl(path)

      const { error: dbError } = await supabase
        .from('event_photos')
        .insert({ event_id: eventId, image_url: data.publicUrl })

      if (dbError) throw dbError

      router.refresh()
      toast.success('Zdjęcie dodane')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd uploadu')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        id="event-photo-upload"
        disabled={loading}
        onChange={handleFileChange}
      />
      <label
        htmlFor="event-photo-upload"
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        {loading ? 'Wysyłanie...' : '📷 Dodaj zdjęcie'}
      </label>
    </>
  )
}
