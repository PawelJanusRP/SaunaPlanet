'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateEvent } from '@/app/[locale]/events/actions'

type Props = {
  eventId: string
  title: string
  event_date: string
  event_time: string | null
  price: string | null
  description: string | null
  max_participants?: number | null
}

export default function EditEventForm({ eventId, title, event_date, event_time, price, description, max_participants }: Props) {
  const t = useTranslations('events')
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    title,
    event_date,
    event_time: event_time ?? '',
    price: price ?? '',
    description: description ?? '',
    max_participants: max_participants != null ? String(max_participants) : '',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateEvent(eventId, {
          title: form.title,
          event_date: form.event_date,
          event_time: form.event_time || null,
          price: form.price || null,
          description: form.description || null,
          max_participants: form.max_participants ? Number(form.max_participants) : null,
        })
        toast.success(t('editForm.saveSuccess'))
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('editForm.saveError'))
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
      >
        {t('editForm.openButton')}
      </button>
    )
  }

  return (
    <div className="mt-4 w-full rounded-2xl border bg-gray-50 p-4 space-y-3">
      <p className="text-sm font-bold text-gray-700">{t('editForm.heading')}</p>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('editForm.titleLabel')}</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-500">{t('editForm.dateLabel')}</label>
          <input
            type="date"
            value={form.event_date}
            onChange={(e) => set('event_date', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-500">{t('editForm.timeLabel')}</label>
          <input
            type="time"
            value={form.event_time}
            onChange={(e) => set('event_time', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-500">{t('editForm.priceLabel')}</label>
          <input
            type="text"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder={t('editForm.pricePlaceholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-500">{t('editForm.maxParticipantsLabel')}</label>
          <input
            type="number"
            min={1}
            value={form.max_participants}
            onChange={(e) => set('max_participants', e.target.value)}
            placeholder={t('editForm.maxParticipantsPlaceholder')}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">{t('editForm.descriptionLabel')}</label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? t('editForm.saving') : t('editForm.save')}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          {t('editForm.cancel')}
        </button>
      </div>
    </div>
  )
}
