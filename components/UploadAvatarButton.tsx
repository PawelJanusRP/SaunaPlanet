'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

/**
 * SP-039: one upload path for both master images. Storage authorization is
 * the boundary (master_avatars_insert_own: first path segment must be a
 * master record owned by the caller, or moderation) — no service role.
 * The DB column update is RLS-guarded and FAILS LOUD when zero rows match,
 * so a file can never be attached to a foreign profile even if uploaded.
 */
const KINDS = {
  avatar: {
    column: 'avatar_url',
    path: (masterId: string, file: string) => `${masterId}/${file}`,
    addLabel: '📷 Dodaj avatar',
    changeLabel: '📷 Zmień avatar',
    successMessage: 'Avatar zaktualizowany',
    errorMessage: 'Błąd uploadu avatara',
    deniedMessage: 'Brak uprawnień do zmiany avatara tego profilu',
  },
  cover: {
    column: 'cover_image_url',
    path: (masterId: string, file: string) => `${masterId}/covers/${file}`,
    addLabel: '🖼️ Dodaj zdjęcie w tle',
    changeLabel: '🖼️ Zmień zdjęcie w tle',
    successMessage: 'Zdjęcie w tle zaktualizowane',
    errorMessage: 'Błąd uploadu zdjęcia w tle',
    deniedMessage: 'Brak uprawnień do zmiany zdjęcia tego profilu',
  },
} as const

export function UploadMasterImageButton({
  masterId,
  kind,
  currentUrl,
}: {
  masterId: string
  kind: keyof typeof KINDS
  currentUrl: string | null
}) {
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()
  const config = KINDS[kind]
  const inputId = `master-image-upload-${kind}-${masterId}`

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = config.path(masterId, `${Date.now()}.${ext}`)

      const { error: uploadError } = await supabase.storage
        .from('master-avatars')
        .upload(path, file, { upsert: false })

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('master-avatars')
        .getPublicUrl(path)

      const { data: updated, error: dbError } = await supabase
        .from('sauna_masters')
        .update({ [config.column]: data.publicUrl })
        .eq('id', masterId)
        .select('id')

      if (dbError) throw dbError
      // RLS mismatch updates 0 rows without an error — fail loud instead
      if (!updated || updated.length === 0) {
        throw new Error(config.deniedMessage)
      }

      router.refresh()
      toast.success(config.successMessage)
    } catch (e) {
      if (e instanceof Error) {
        toast.error(e.message)
      } else {
        toast.error(config.errorMessage)
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
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={loading}
        onChange={handleFileChange}
      />

      <label
        htmlFor={inputId}
        className={`inline-block cursor-pointer rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 ${
          loading ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        {loading ? 'Wysyłanie...' : currentUrl ? config.changeLabel : config.addLabel}
      </label>
    </>
  )
}

/** Backward-compatible avatar wrapper (existing call sites unchanged). */
export default function UploadAvatarButton({
  masterId,
  currentAvatarUrl,
}: {
  masterId: string
  currentAvatarUrl: string | null
}) {
  return <UploadMasterImageButton masterId={masterId} kind="avatar" currentUrl={currentAvatarUrl} />
}
