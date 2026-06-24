'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { addCertificateType, toggleCertificateType } from '@/app/(main)/admin/actions'

const CATEGORY_LABELS: Record<string, string> = {
  certification:   'Certyfikaty',
  championship_pl: 'Mistrzostwa Polski',
  gladiators:      'Battle of Gladiators',
  aufguss_wm:      'Aufguss WM',
  classic_cup:     'Modern Classic Cup',
  cup:             'Puchary',
  other:           'Inne',
}

type CertType = {
  id: string
  name: string
  category: string
  is_active: boolean
  sort_order: number
}

export default function ManageCertificateTypes({ types }: { types: CertType[] }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('certification')

  function handleAdd() {
    if (!name.trim()) { toast.error('Podaj nazwę'); return }
    startTransition(async () => {
      try {
        await addCertificateType(name.trim(), category)
        toast.success('Dodano pozycję słownika')
        setName('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd')
      }
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      try {
        await toggleCertificateType(id, !current)
        toast.success(!current ? 'Aktywowano' : 'Dezaktywowano')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd')
      }
    })
  }

  const grouped = types.reduce<Record<string, CertType[]>>((acc, ct) => {
    if (!acc[ct.category]) acc[ct.category] = []
    acc[ct.category].push(ct)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Add new */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <p className="mb-3 font-semibold text-gray-700">Dodaj nową pozycję</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border p-2 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa certyfikatu"
            className="flex-1 rounded-xl border p-2 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={isPending}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Dodaj
          </button>
        </div>
      </div>

      {/* List by category */}
      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat}>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
            {CATEGORY_LABELS[cat] ?? cat}
          </h3>
          <div className="rounded-2xl border bg-white shadow-sm divide-y">
            {items.map((ct) => (
              <div key={ct.id} className="flex items-center justify-between px-4 py-3">
                <span className={`text-sm ${ct.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                  {ct.name}
                </span>
                <button
                  onClick={() => handleToggle(ct.id, ct.is_active)}
                  disabled={isPending}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    ct.is_active
                      ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {ct.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
