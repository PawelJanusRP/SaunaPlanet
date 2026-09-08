'use client'

// SP-045 Slice B — mobile unified search overlay: saunas (client-side over the
// already-loaded set) + publicly-visible sauna masters (on-demand, debounced
// via the SP-045 search_public_masters RPC). Selecting a master switches to a
// compact map-native profile card with their upcoming public events; tapping an
// event's sauna asks the map to focus that facility. SP-044 privacy: the ONLY
// identity shown is the RPC's public `name` (pseudonym when private) — the panel
// never queries master_private_identity or any private field.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, X, MapPin, ExternalLink, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { searchMastersNormalized, type PublicMasterResult } from '@/lib/map/masterSearch'

export type SearchSauna = {
  id: string
  name: string
  city: string | null
  category: string
  image_urls: string[] | null
  cover_image_url: string | null
  avg_rating: number | null
  review_count: number
  latitude: number
  longitude: number
  distance_m: number
}

type MasterEvent = {
  event_id: string
  title: string
  event_date: string
  event_time: string | null
  sauna_id: string
  sauna_name: string
  latitude: number
  longitude: number
}

type Props = {
  open: boolean
  onClose: () => void
  saunas: SearchSauna[]
  categoryEmoji: (category: string) => string
  onSelectSauna: (sauna: SearchSauna) => void
  onFocusEventSauna: (payload: { id: string; latitude: number; longitude: number }) => void
}

const MASTER_MIN = 2
const DEBOUNCE_MS = 280

export default function MobileSearchPanel({
  open,
  onClose,
  saunas,
  categoryEmoji,
  onSelectSauna,
  onFocusEventSauna,
}: Props) {
  const [query, setQuery] = useState('')
  const [masters, setMasters] = useState<PublicMasterResult[]>([])
  const [master, setMaster] = useState<PublicMasterResult | null>(null)
  const [events, setEvents] = useState<MasterEvent[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)

  // Autofocus on open; reset transient state on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
    // Reset transient view on close (deferred so it is not a synchronous
    // effect-body setState).
    const t = setTimeout(() => {
      setMaster(null)
      setEvents([])
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  // Debounced, stale-protected master search (never on initial map load).
  // All setState is inside the deferred timeout (no synchronous effect-body
  // setState) and guarded by a sequence so an older query can't overwrite a
  // newer one.
  useEffect(() => {
    const q = query.trim()
    const seq = ++seqRef.current
    const t = setTimeout(async () => {
      if (q.length < MASTER_MIN) {
        if (seqRef.current === seq) {
          setMasters([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const rows = await searchMastersNormalized(supabase, q)
      if (seqRef.current !== seq) return // a newer query superseded this one
      setMasters(rows)
      setLoading(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const saunaResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return saunas
      .filter((s) =>
        [s.name, s.city ?? '', s.category].some((f) => f.toLowerCase().includes(q))
      )
      .slice(0, 20)
  }, [query, saunas])

  async function openMaster(m: PublicMasterResult) {
    setMaster(m)
    setEvents([])
    const { data } = await supabase.rpc('get_public_master_upcoming_events', {
      p_master_id: m.id,
      p_limit: 5,
    })
    setEvents((data ?? []) as MasterEvent[])
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[11000] flex flex-col bg-white lg:hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={master ? 'Profil saunamistrza' : 'Szukaj'}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {master ? (
          <button
            type="button"
            onClick={() => setMaster(null)}
            aria-label="Wróć do wyników"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        ) : (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj saun i saunamistrzów…"
              aria-label="Szukaj"
              className="w-full rounded-xl border py-2.5 pl-9 pr-9 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Wyczyść"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {master ? (
          <MasterCard master={master} events={events} onFocusEventSauna={onFocusEventSauna} onClose={onClose} />
        ) : query.trim().length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-400">
            Wpisz nazwę sauny, miasta lub saunamistrza.
          </p>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sauny</h3>
              {saunaResults.length === 0 ? (
                <p className="text-sm text-gray-400">Brak saun.</p>
              ) : (
                <ul className="space-y-2">
                  {saunaResults.map((s) => {
                    const img = s.image_urls?.[0] ?? s.cover_image_url
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => onSelectSauna(s)}
                          className="flex w-full items-center gap-3 rounded-xl border p-2 text-left active:bg-gray-100"
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-lg">
                              {categoryEmoji(s.category)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{s.name}</div>
                            <div className="text-xs text-gray-500">
                              {[s.city, s.avg_rating ? `⭐ ${Number(s.avg_rating).toFixed(1)}` : null, `${Math.round(s.distance_m)} m`]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Saunamistrzowie</h3>
              {loading ? (
                <p className="text-sm text-gray-400">Szukam…</p>
              ) : masters.length === 0 ? (
                <p className="text-sm text-gray-400">Brak saunamistrzów.</p>
              ) : (
                <ul className="space-y-2">
                  {masters.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => openMaster(m)}
                        className="flex w-full items-center gap-3 rounded-xl border p-2 text-left active:bg-gray-100"
                      >
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-lg">🧖</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{m.name}</div>
                          {(m.city || m.specialties.length > 0) && (
                            <div className="truncate text-xs text-gray-500">
                              {[m.city, m.specialties.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function MasterCard({
  master,
  events,
  onFocusEventSauna,
  onClose,
}: {
  master: PublicMasterResult
  events: MasterEvent[]
  onFocusEventSauna: (payload: { id: string; latitude: number; longitude: number }) => void
  onClose: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        {master.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={master.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl">🧖</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold">{master.name}</div>
          {master.city && <div className="text-sm text-gray-500">{master.city}</div>}
        </div>
        <Link
          href={`/masters/${master.slug ?? master.id}`}
          onClick={onClose}
          aria-label="Otwórz pełny profil saunamistrza"
          title="Pełny profil"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ExternalLink className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      {master.bio && <p className="mt-3 text-sm text-gray-700">{master.bio}</p>}

      {master.specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {master.specialties.map((sp) => (
            <span key={sp} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{sp}</span>
          ))}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Nadchodzące wydarzenia</h3>
      {events.length === 0 ? (
        <p className="text-sm text-gray-400">Brak nadchodzących wydarzeń.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.event_id} className="rounded-xl border p-2.5">
              <div className="text-sm font-semibold text-orange-700">🔥 {e.title}</div>
              <div className="text-xs text-gray-500">
                {e.event_date.substring(0, 10)}
                {e.event_time ? ` · ${e.event_time.substring(0, 5)}` : ''}
              </div>
              <button
                type="button"
                onClick={() => onFocusEventSauna({ id: e.sauna_id, latitude: e.latitude, longitude: e.longitude })}
                aria-label={`Pokaż saunę ${e.sauna_name} na mapie`}
                className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 active:bg-orange-100"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {e.sauna_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
