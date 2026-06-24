'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateSaunaAdmin, deleteSaunaAdmin } from '@/app/(main)/admin/actions'

const CATEGORIES = [
  { value: 'public_sauna', label: 'Sauna publiczna' },
  { value: 'hotel_sauna', label: 'Sauna hotelowa' },
  { value: 'private_sauna', label: 'Sauna prywatna' },
  { value: 'sports_sauna', label: 'Sauna sportowa' },
  { value: 'wellness_sauna', label: 'Wellness / SPA' },
  { value: 'other', label: 'Inne' },
]

const STATUSES = [
  { value: 'active', label: 'Aktywna' },
  { value: 'pending', label: 'Oczekuje' },
  { value: 'inactive', label: 'Nieaktywna' },
]

type Props = {
  sauna: {
    id: string
    name: string
    city: string | null
    description: string | null
    website: string | null
    category: string
    status: string
  }
}

export default function EditSaunaAdminForm({ sauna }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: sauna.name,
    city: sauna.city ?? '',
    description: sauna.description ?? '',
    website: sauna.website ?? '',
    category: sauna.category,
    status: sauna.status,
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateSaunaAdmin(sauna.id, {
          name: form.name,
          city: form.city || null,
          description: form.description || null,
          website: form.website || null,
          category: form.category,
          status: form.status,
        })
        toast.success('Sauna zaktualizowana')
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteSaunaAdmin(sauna.id)
        toast.success('Sauna usunięta')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Edytuj
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-2xl border bg-gray-50 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Nazwa *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Miasto</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">Opis</label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Strona WWW</label>
          <input
            type="text"
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Kategoria</label>
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Status</label>
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? 'Zapisywanie...' : 'Zapisz'}
          </button>
          <button
            onClick={() => { setOpen(false); setConfirmDelete(false) }}
            disabled={isPending}
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Anuluj
          </button>
        </div>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Usuń saunę
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">Na pewno?</span>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Tak, usuń
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={isPending}
              className="rounded-xl border px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Nie
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
