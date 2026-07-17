'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function UploadAvatarButton({
  masterId,
  currentAvatarUrl,
}: {
  masterId: string
  currentAvatarUrl: string | null
}) {
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
      const path = `${masterId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('master-avatars')
        .upload(path, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('master-avatars')
        .getPublicUrl(path)

      const { data: updated, error: dbError } = await supabase
        .from('sauna_masters')
        .update({ avatar_url: data.publicUrl })
        .eq('id', masterId)
        .select('id')

      if (dbError) throw dbError
      // RLS mismatch updates 0 rows without an error — fail loud instead
      if (!updated || updated.length === 0) {
        throw new Error('Brak uprawnień do zmiany avatara tego profilu')
      }

      router.refresh()
      toast.success('Avatar zaktualizowany')
    } catch (e) {
      if (e instanceof Error) {
        toast.error(e.message)
      } else {
        toast.error('Błąd uploadu avatara')
      }
    } finally {
      setLoading(false)
      if (fileRef.current) {
        fileRef.current.value = ''
      }
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        id="avatar-upload"
        type="file"
        accept="image/*"
        className="hidden"
        disabled={loading}
        onChange={handleFileChange}
      />

      <label
        htmlFor="avatar-upload"
        className={`inline-block cursor-pointer rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 ${
          loading ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        {loading ? 'Wysyłanie...' : currentAvatarUrl ? '📷 Zmień avatar' : '📷 Dodaj avatar'}
      </label>
    </>
  )
}
