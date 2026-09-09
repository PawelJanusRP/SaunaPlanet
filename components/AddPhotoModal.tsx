'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function AddPhotoModal({
  itemId,
  onClose,
  onUploaded,
}: {
  itemId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const t = useTranslations('sauna')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function handleUpload() {
    if (!file) {
      toast.error(t('photo.errorNoFile'))
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${itemId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('sauna-images')
        .upload(path, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('sauna-images')
        .getPublicUrl(path)

      const { error: dbError } = await supabase.from('sauna_photos').insert([
        {
          sauna_id: itemId,
          image_url: data.publicUrl,
        },
      ])

      if (dbError) throw dbError

      setFile(null)

      if (fileRef.current) {
        fileRef.current.value = ''
      }

      await onUploaded()
      onClose()

      toast.success(t('photo.successAdded'))
    } catch (e) {
      console.error('UPLOAD ERROR FULL:', e)

	  if (e instanceof Error) {
	  toast.error(e.message)
	  } else {
	  toast.error(t('photo.errorUpload'))
	  }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('photo.heading')}</h2>

          <button
            onClick={onClose}
            className="text-gray-500"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="mb-3">
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            {t('photo.label')}
          </label>

          <label
            htmlFor="additional-photo-upload"
            className="
              flex cursor-pointer flex-col items-center justify-center
              rounded-xl border-2 border-dashed border-gray-300
              bg-gray-50 p-4 text-center
              transition hover:bg-gray-100 active:scale-[0.98] active:bg-gray-200
            "
          >
            {file ? (
              <>
                <img
                  src={URL.createObjectURL(file)}
                  alt={t('photo.previewAlt')}
                  className="mb-2 h-40 w-full rounded-lg object-cover"
                />

                <div className="text-sm font-semibold text-gray-700">
                  {t('photo.change')}
                </div>

                <div className="mt-1 text-xs text-green-700">
                  {t('photo.selected')}
                </div>
              </>
            ) : (
              <>
                <div className="text-3xl">📷</div>

                <div className="mt-2 text-sm font-semibold text-gray-700">
                  {t('photo.add')}
                </div>

                <div className="text-xs text-gray-500">
                  {t('photo.hint')}
                </div>
              </>
            )}
          </label>

          <input
            id="additional-photo-upload"
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0] ?? null
              setFile(selectedFile)
            }}
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={loading || !file}
          className="mb-2 w-full rounded-xl bg-black p-3 text-white disabled:opacity-50"
        >
          {loading ? t('photo.submitting') : t('photo.submit')}
        </button>

        <button
          onClick={onClose}
          disabled={loading}
          className="w-full rounded-xl border p-3 font-semibold"
        >
          {t('photo.close')}
        </button>
      </div>
    </div>
  )
}