'use client'

import { useMemo, useRef, useState } from 'react'

export type FacilityOption = { id: string; name: string; city: string | null }

const VISIBLE_LIMIT = 100

/** Fold Polish diacritics so "maltanskie" finds "Maltańskie". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
}

/**
 * Ranking (SP-037B UX fix): exact name (0) → name starts with query (1) →
 * city match (2) → other substring match (3) → no match (-1).
 */
function rank(option: FacilityOption, q: string): number {
  const name = fold(option.name)
  const city = fold(option.city ?? '')
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (city === q || city.startsWith(q) || city.includes(q)) return 2
  if (name.includes(q)) return 3
  return -1
}

/**
 * Searchable facility combobox — filters the dataset the page already
 * loaded (no extra API); the selected value stays the facility ID.
 */
export default function FacilityCombobox({
  saunas,
  value,
  onChange,
}: {
  saunas: FacilityOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = value ? saunas.find((s) => s.id === value) ?? null : null

  const results = useMemo(() => {
    const q = fold(query.trim())
    if (!q) {
      // empty query: cities alphabetically, names alphabetically within
      return [...saunas].sort((a, b) => {
        const ca = a.city ?? '￿'
        const cb = b.city ?? '￿'
        return ca.localeCompare(cb, 'pl') || a.name.localeCompare(b.name, 'pl')
      })
    }
    return saunas
      .map((s) => ({ s, r: rank(s, q) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name, 'pl'))
      .map((x) => x.s)
  }, [saunas, query])

  const visible = results.slice(0, VISIBLE_LIMIT)
  const grouped = fold(query.trim()) === ''

  function select(option: FacilityOption) {
    onChange(option.id)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, visible.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (visible[highlighted]) select(visible[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-orange-50 p-3 text-sm">
        <span className="min-w-0 truncate font-medium">
          {selected.name}
          {selected.city && <span className="text-gray-500"> — {selected.city}</span>}
        </span>
        <button
          type="button"
          onClick={clear}
          aria-label="Wyczyść wybrany obiekt"
          className="shrink-0 rounded-full px-2 py-0.5 text-gray-500 hover:bg-orange-100"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full rounded-xl border p-3 text-sm"
        placeholder="Wpisz nazwę sauny lub miasto"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white shadow-lg"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-gray-500">Nie znaleziono obiektu</li>
          ) : (
            visible.map((s, i) => {
              const cityHeader =
                grouped && (i === 0 || (visible[i - 1].city ?? '') !== (s.city ?? ''))
              return (
                <li key={s.id}>
                  {cityHeader && (
                    <div className="bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {s.city ?? 'Bez miasta'}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlighted}
                    // onMouseDown so selection wins over the input blur
                    onMouseDown={(e) => {
                      e.preventDefault()
                      select(s)
                    }}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`block w-full px-3 py-2.5 text-left text-sm ${
                      i === highlighted ? 'bg-orange-50' : ''
                    }`}
                  >
                    {s.name}
                    {s.city && <span className="text-gray-500"> — {s.city}</span>}
                  </button>
                </li>
              )
            })
          )}
          {results.length > VISIBLE_LIMIT && (
            <li className="px-3 py-2 text-xs text-gray-400">
              Pokazano {VISIBLE_LIMIT} z {results.length} — doprecyzuj wyszukiwanie
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
