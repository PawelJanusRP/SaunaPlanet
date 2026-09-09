'use client'

import { createPortal } from 'react-dom'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { SaunaNearbyRow, UpcomingEventSaunaRow } from '@/lib/types'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import AddSaunaForm from '@/components/AddSaunaForm'
import AddPhotoModal from '@/components/AddPhotoModal'
import EditSaunaModal from '@/components/EditSaunaModal'
import AddEventModal from '@/components/AddEventModal'
import { Link } from '@/lib/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLocale, useFormatter } from 'next-intl'
import { Info, X, Camera, Globe, Pencil, Flame } from 'lucide-react'
import MapControls from '@/components/map/MapControls'
import MapSearchPanel from '@/components/map/MapSearchPanel'
import MapFiltersPanel from '@/components/map/MapFiltersPanel'
import { DRAWER_NAV_ICONS, LOGOUT_ICON } from '@/lib/navigation/icons'
import { formatEventPrice } from '@/lib/i18n/formatPrice'

const LogoutIcon = LOGOUT_ICON

type TopSauna = {
  sauna_id: string
  sauna_name: string
  avg_rating: number
  review_count: number
}

type SaunaEvent = {
  id: string
  title: string
  description: string | null
  event_date: string
  event_time: string | null
  price: string | null
  status: string
}

type Sauna = SaunaNearbyRow & {
  has_upcoming_event?: boolean
}

type UpcomingEvent = {
  event_id: string
  title: string
  event_date: string
  event_time: string | null
  price: string | null
  sauna_id: string
  sauna_name: string
  city: string | null
  latitude: number
  longitude: number
}

const fallbackCenter: [number, number] = [52.4064, 16.9252]

// Leaflet's default marker images, served locally (public/leaflet/, copied
// from node_modules/leaflet/dist/images) — no third-party CDN dependency.
const markerIcon = new L.Icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function MapClickHandler({
  onSelect,
  onOpenContextMenu,
  onCloseAddForm,
}: {
  onSelect: (lat: number, lng: number) => void
  onOpenContextMenu: (lat: number, lng: number) => void
  onCloseAddForm: () => void
}) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng)
      onCloseAddForm()
    },

    contextmenu(e) {
      onSelect(e.latlng.lat, e.latlng.lng)
      onOpenContextMenu(e.latlng.lat, e.latlng.lng)
    },
  })

  return null
}

function MapFocusController({ selectedSauna }: { selectedSauna: Sauna | null }) {
  const map = useMap()

  useEffect(() => {
    if (!selectedSauna) return

    map.flyTo([selectedSauna.latitude, selectedSauna.longitude], 16, {
      duration: 0.6,
    })
  }, [selectedSauna, map])

  return null
}

function MapCenterController({
  center,
  trigger,
}: {
  center: [number, number]
  trigger: number
}) {
  const map = useMap()

  useEffect(() => {
    if (trigger === 0) return

    map.flyTo(center, 16, {
      duration: 0.6,
    })
  }, [center, trigger, map])

  return null
}

// Centers the map on a clicked marker at the current zoom. Separate from
// MapFocusController (sidebar selection: flyTo zoom 16) and from popup
// autoPan (disabled — it caused popup flicker).
function MapPanController({
  target,
}: {
  target: { center: [number, number]; n: number } | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!target) return
    map.panTo(target.center, { animate: true, duration: 0.4 })
  }, [target, map])

  return null
}

function MapResizeGuard() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map])
  return null
}

function getCategoryEmoji(category: string) {
  switch (category) {
    case 'public_sauna':
      return '🧖'
    case 'spa':
      return '♨️'
    case 'hotel':
      return '🏨'
    case 'event':
      return '🔥'
    case 'outdoor':
      return '🌲'
    default:
      return '🧖'
  }
}

function getCategoryColor(category: string) {
  switch (category) {
    case 'public_sauna':
      return '#f97316'
    case 'spa':
      return '#ef4444'
    case 'hotel':
      return '#3b82f6'
    case 'event':
      return '#dc2626'
    case 'outdoor':
      return '#22c55e'
    default:
      return '#f97316'
  }
}

const EVENT_PULSE_CLASS = 'sauna-event-pulse'

function createSaunaIcon(
  imageUrl: string | null,
  category: string,
  hasUpcomingEvent = false,
  avgRating: number | null = null,
  masters: Sauna['masters'] = [],
  locale = 'pl'
) {
  const categoryEmoji = getCategoryEmoji(category)
  const categoryColor = getCategoryColor(category)
  const size = hasUpcomingEvent ? 60 : 46
  const borderColor = hasUpcomingEvent ? '#dc2626' : categoryColor
  const pulseClass = hasUpcomingEvent ? EVENT_PULSE_CLASS : ''
  const mastersWithAvatar = (masters ?? []).filter((m) => m != null && m.avatar_url)

  const satSize = 40
  const orbitR = Math.floor(size / 2) + 26

  const satellitesHtml = mastersWithAvatar.map((m, i) => {
    const angleDeg = -150 + (300 / mastersWithAvatar.length) * (i + 0.5)
    const angleRad = (angleDeg * Math.PI) / 180
    const left = Math.round(size / 2 + orbitR * Math.cos(angleRad) - satSize / 2)
    const top = Math.round(size / 2 + orbitR * Math.sin(angleRad) - satSize / 2)
    const color = m.level === 'master' ? '#facc15'
      : m.level === 'senior' ? '#a855f7'
      : m.level === 'certified' ? '#3b82f6'
      : '#9ca3af'
    return `<a href="/${locale}/masters/${m.id}" title="${m.name}" onclick="event.stopPropagation()" style="position:absolute;left:${left}px;top:${top}px;z-index:1001;width:${satSize}px;height:${satSize}px;border-radius:9999px;display:block;cursor:pointer;"><img src="${m.avatar_url}" style="width:100%;height:100%;border-radius:9999px;object-fit:cover;border:2px solid ${color};background:white;box-shadow:0 1px 4px rgba(0,0,0,0.35);" /></a>`
  }).join('')
  return L.divIcon({
    className: '',
		html: `
		<div class="${pulseClass}"
			style="
				position: relative;
				width: ${size}px;
				height: ${size}px;
			">
		
			${satellitesHtml}
		
			${
				hasUpcomingEvent
				? `
					<div style="
					position:absolute;
					top:-10px;
					right:-10px;
					z-index:999;
					font-size:20px;
					line-height:1;
					">
					🔥
					</div>
				`
				: ''
			}
		
			<div style="
				width: ${size}px;
				height: ${size}px;
				border: 4px solid ${borderColor};
				overflow: hidden;
				border-radius: 50%;
				box-shadow: 0 2px 8px rgba(0,0,0,0.35);
				background: white;
				display:flex;
				align-items:center;
				justify-content:center;
			">
				${
				imageUrl
					? `
					<img
						src="${imageUrl}"
						style="
						width:100%;
						height:100%;
						object-fit:cover;
						display:block;
						"
					/>
					`
					: `
					<div style="font-size:22px;">
						${categoryEmoji}
					</div>
					`
				}
			</div>
			${
			avgRating
				? `
				<div style="
					position:absolute;
					left:50%;
					bottom:-18px;
					transform:translateX(-50%);
					z-index:1000;
					border-radius:9999px;
					background:#facc15;
					color:#111827;
					padding:2px 6px;
					font-size:11px;
					font-weight:700;
					line-height:1;
					box-shadow:0 1px 4px rgba(0,0,0,0.25);
					white-space:nowrap;
				">
					⭐${Number(avgRating).toFixed(1)}
				</div>
				`
				: ''
			}
		</div>
		`,
		iconSize: [size, size + (avgRating ? 18 : 0)],
		iconAnchor: [size / 2, size + (avgRating ? 18 : 0)],
		popupAnchor: [0, -size],
  })
}

// leaflet.markercluster ships no TypeScript definitions; this is the subset
// of L.MarkerCluster the icon factory needs.
type MarkerClusterLike = {
  getChildCount(): number
  getAllChildMarkers(): L.Marker[]
}

function markerHasEventPulse(marker: L.Marker) {
  const icon = marker.options.icon
  return (
    icon instanceof L.DivIcon &&
    typeof icon.options.html === 'string' &&
    icon.options.html.includes(EVENT_PULSE_CLASS)
  )
}

// Same markup, classes and size as leaflet.markercluster's
// _defaultIconCreateFunction, plus the event pulse when at least one child
// marker pulses. The pulse class goes on the inner div, not the icon root:
// Leaflet positions the root via an inline transform that the pulse's
// scale() animation would override.
function createClusterIcon(cluster: MarkerClusterLike) {
  const count = cluster.getChildCount()
  const sizeClass = count < 10 ? 'small' : count < 100 ? 'medium' : 'large'
  const hasEventChild = cluster.getAllChildMarkers().some(markerHasEventPulse)

  return L.divIcon({
    html: `<div class="${hasEventChild ? EVENT_PULSE_CLASS : ''}"><span>${count}</span></div>`,
    className: `marker-cluster marker-cluster-${sizeClass}`,
    iconSize: L.point(40, 40),
  })
}

function SaunaPopup({
  sauna,
  onAddPhoto,
  onEdit,
  onAddEvent,
}: {
  sauna: Sauna
  onAddPhoto: (saunaId: string) => void
  onEdit: (sauna: Sauna) => void
  onAddEvent: (sauna: Sauna) => void
}) {
  const t = useTranslations('map')
  const format = useFormatter()
  const [imageIndex, setImageIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [events, setEvents] = useState<SaunaEvent[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadEvents() {
      const { data, error } = await supabase.rpc('get_sauna_events', {
        sauna_uuid: sauna.id,
      })

      if (error) {
        console.error('LOAD EVENTS ERROR:', error)
        return
      }

      if (!cancelled) setEvents(data ?? [])
    }

    void loadEvents()

    return () => {
      cancelled = true
    }
  }, [sauna.id])

  const images = sauna.image_urls?.length
    ? sauna.image_urls
    : sauna.cover_image_url
    ? [sauna.cover_image_url]
    : []

  const currentImage = images[imageIndex]

  const fullscreenViewer =
    fullscreen && currentImage
      ? createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95"
            onClick={() => setFullscreen(false)}
          >
            <img
              src={currentImage}
              alt={sauna.name}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full object-contain"
            />

            <button
              className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-2 text-white"
              onClick={(e) => {
                e.stopPropagation()
                setFullscreen(false)
              }}
            >
              ✕
            </button>
          </div>,
          document.body
        )
      : null

  return (
    <>
      {fullscreenViewer}

      <div className="w-[260px]">
        {currentImage ? (
          <div className="relative mb-3 overflow-hidden rounded-xl">
            <img
              src={currentImage}
              alt={sauna.name}
              onClick={() => setFullscreen(true)}
              className="h-28 w-full cursor-pointer object-cover"
            />

            {images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setImageIndex((prev) =>
                      prev === 0 ? images.length - 1 : prev - 1
                    )
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                >
                  ←
                </button>

                <button
                  onClick={() =>
                    setImageIndex((prev) =>
                      prev === images.length - 1 ? 0 : prev + 1
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                >
                  →
                </button>

                <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                  {imageIndex + 1}/{images.length}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mb-3 flex h-24 w-full items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
            {t('popup.noPhoto')}
          </div>
        )}

        <h3 className="mb-2 text-base font-bold text-gray-900">
          {sauna.name}
        </h3>
		{sauna.avg_rating && (
		<div className="mb-2 text-sm font-semibold text-yellow-600">
			⭐ {Number(sauna.avg_rating).toFixed(1)} ({t('popup.reviewsCount', { count: sauna.review_count })})
		</div>
		)}
		
        {sauna.description && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-700">{sauna.description}</p>
        )}

        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2 py-1">
            {getCategoryEmoji(sauna.category)}{' '}
            {t.has(`categoryLabel.${sauna.category}`)
              ? t(`categoryLabel.${sauna.category}`)
              : sauna.category}
          </span>

          {sauna.city && (
            <span className="rounded-full bg-gray-100 px-2 py-1">
              {sauna.city}
            </span>
          )}

          <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
            {Math.round(sauna.distance_m)} m
          </span>
        </div>


		{events.length > 0 && (
		<div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-2">
			<div className="mb-2 text-sm font-bold text-orange-700">
			🔥 {t('popup.upcomingEvents')}
			</div>
		
			<div className="space-y-2">
			{events.slice(0, 2).map((event) => (
				<Link
				key={event.id}
				href={`/events/${event.id}`}
				className="block rounded-lg bg-white p-2 text-xs hover:bg-orange-100"
				>
				<div className="font-semibold text-orange-700">
					{event.title}
				</div>

				<div className="text-gray-500">
				{event.event_date.substring(0, 10)}
				{event.event_time
					? ` ${event.event_time.substring(0, 5)}`
					: ''}
				</div>

				{event.price && (
					<div className="font-semibold text-orange-700">
						{formatEventPrice(format, event.price)}
					</div>
				)}
				</Link>
			))}
			</div>
		</div>
		)}
		
        {/* SP-045: compact pictogram actions on ALL breakpoints — same actions + auth. */}
        <div className="flex items-center gap-2">
          <Link
            href={`/sauna/${sauna.id}`}
            aria-label={t('popup.details')}
            title={t('popup.details')}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 !text-white"
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Link>
          {sauna.website && (
            <a
              href={sauna.website}
              target="_blank"
              rel="noreferrer"
              aria-label={t('popup.website')}
              title={t('popup.website')}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-600 !text-white"
            >
              <Globe className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onAddPhoto(sauna.id)}
            aria-label={t('popup.addPhoto')}
            title={t('popup.addPhoto')}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onAddEvent(sauna)}
            aria-label={t('popup.addEvent')}
            title={t('popup.addEvent')}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-600 text-white"
          >
            <Flame className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(sauna)}
            aria-label={t('popup.editSauna')}
            title={t('popup.editSauna')}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-800 text-white"
          >
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

      </div>
    </>
  )
}

const roleBadge: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  moderator: 'bg-orange-100 text-orange-700',
  user: 'bg-gray-100 text-gray-600',
}

export default function SaunaMap() {
  const { user, role } = useAuth()
  const t = useTranslations('map')
  const tNav = useTranslations('nav')
  const tRoles = useTranslations('common.roles')
  const locale = useLocale()
  const [items, setItems] = useState<Sauna[]>([])
  const [topSaunas, setTopSaunas] = useState<TopSauna[]>([])
  const [, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [, setLoading] = useState(true)
  const [uploadItemId, setUploadItemId] = useState<string | null>(null)
  const [editingSauna, setEditingSauna] = useState<Sauna | null>(null)
  const [eventSauna, setEventSauna] = useState<Sauna | null>(null)
  const [selectedSauna, setSelectedSauna] = useState<Sauna | null>(null)
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [userLocation, setUserLocation] = useState<[number, number]>(fallbackCenter)
  const [centerTrigger, setCenterTrigger] = useState(0)
  const [panTarget, setPanTarget] = useState<{ center: [number, number]; n: number } | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<[number, number]>(fallbackCenter)
  const [showAddForm, setShowAddForm] = useState(false)
  const [contextMenuLocation, setContextMenuLocation] = useState<[number, number] | null>(null)
  // SP-045: mobile map is dominant by default — the search/list surface opens
  // on demand (was a permanent ~40vh 3-state sheet). Desktop uses the sidebar.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [showAccountPanel, setShowAccountPanel] = useState(false)
  const [radiusKm, setRadiusKm] = useState(1000)
  const [onlyWithEvents, setOnlyWithEvents] = useState(false)
  const [mapMode, setMapMode] = useState<'saunas' | 'events' | 'all'>('all')
  const [clusterRefreshKey, setClusterRefreshKey] = useState(0)

  // SP-045: any filter differing from its default lights the Filters dot.
  const filtersActive =
    onlyWithPhotos || onlyWithEvents || categoryFilter !== 'all' ||
    mapMode !== 'all' || radiusKm !== 1000

  const markerRefs = useRef<Record<string, L.Marker | null>>({})
  const loadSeqRef = useRef(0)

  // SP-039I: `/?sauna=<uuid>` deep link — center on and open that sauna.
  const searchParams = useSearchParams()
  const deepLinkSaunaId = searchParams.get('sauna')
  const deepLinkResolvedRef = useRef(false)
  const deepLinkSelectedRef = useRef(false)

  const visibleItems = items.filter((item) => {
	  if (mapMode === 'events' && !item.has_upcoming_event) {
	    return false
	  }

  if (onlyWithPhotos && (item.image_urls?.length ?? 0) === 0) {
  	return false
  }
  
  if (onlyWithEvents && !item.has_upcoming_event) {
  	return false
  }
  
  if (categoryFilter !== 'all' && item.category !== categoryFilter) {
  	return false
  }
  
  return true
  })
  
  const loadUpcomingEvents = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_upcoming_events')

    if (error) {
      console.error('LOAD EVENTS ERROR:', error)
      return
    }

    setUpcomingEvents(data ?? [])
  }, [])

  const loadTopSaunas = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_top_saunas')

    if (error) {
      console.error('LOAD TOP SAUNAS ERROR:', error)
      return
    }

    setTopSaunas(data ?? [])
  }, [])

  const loadSaunas = useCallback(async () => {
    // Concurrent calls (mount effect, realtime events, form callbacks) can
    // resolve out of order; only the most recent call may write state.
    const seq = ++loadSeqRef.current
    const isCurrent = () => loadSeqRef.current === seq

    // Yield a microtask so setLoading below runs as an async callback, never
    // synchronously inside the effects that call this loader
    // (react-hooks/set-state-in-effect).
    await Promise.resolve()
    if (!isCurrent()) return

    setLoading(true)

    const { data, error } = await supabase.rpc('get_saunas_nearby', {
      user_lat: userLocation[0],
      user_lng: userLocation[1],
      radius_m: radiusKm * 1000,
    })

    if (!isCurrent()) return

    if (error) {
      console.error(error)
      toast.error(t('toast.loadSaunasError'))
      setLoading(false)
      return
    }

    const { data: eventSaunas } = await supabase.rpc(
      'get_upcoming_event_saunas'
    )

    if (!isCurrent()) return

    const eventIds = new Set(
      (eventSaunas ?? []).map((e: UpcomingEventSaunaRow) => e.sauna_id)
    )

    setItems(
      (data ?? []).map((sauna: SaunaNearbyRow) => ({
        ...sauna,
        has_upcoming_event: eventIds.has(sauna.id),
      }))
    )
    setLoading(false)
    setClusterRefreshKey((k) => k + 1)
  }, [userLocation, radiusKm, t])

  async function centerOnUserLocation() {
    if (!navigator.geolocation) {
      toast.error(t('toast.geolocationUnsupported'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ]

        setUserLocation(coords)
        setSelectedLocation(coords)
        setCenterTrigger((value) => value + 1)

        toast.success(t('toast.centered'))
      },
      () => {
        toast.error(t('toast.geolocationError'))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }

  // SP-045: ONE shared sauna-focus path (search result, master-event sauna,
  // deep link, sidebar). It centers the CAMERA on the target (via selectedSauna
  // -> MapFocusController) and NEVER redefines userLocation, so the real
  // geolocation / distance origin is preserved. An off-radius target (e.g. a
  // master's event in another city) is resolved and merged into the loaded set
  // so it becomes selectable/visible without moving the data origin.
  const focusSauna = useCallback(
    (target: { id: string; latitude: number; longitude: number }) => {
      setMobileSearchOpen(false)
      setMobileFiltersOpen(false)
      setShowAddForm(false)

      const existing = items.find((i) => i.id === target.id)
      if (existing) {
        setSelectedSauna(existing)
        setSelectedLocation([existing.latitude, existing.longitude])
        return
      }

      void (async () => {
        const { data } = await supabase
          .from('saunas')
          .select('*')
          .eq('id', target.id)
          .maybeSingle()
        if (!data) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = data as any
        const resolved: Sauna = {
          ...row,
          distance_m: 0,
          image_urls: row.image_urls ?? null,
          cover_image_url: row.cover_image_url ?? null,
          avg_rating: null,
          review_count: 0,
          masters: [],
          has_upcoming_event: false,
        }
        setItems((prev) => (prev.some((i) => i.id === resolved.id) ? prev : [...prev, resolved]))
        setClusterRefreshKey((k) => k + 1)
        setSelectedSauna(resolved)
        setSelectedLocation([resolved.latitude, resolved.longitude])
      })()
    },
    [items]
  )

  useEffect(() => {
    async function load() {
      await Promise.all([loadSaunas(), loadTopSaunas(), loadUpcomingEvents()])
    }

    void load()
  }, [loadSaunas, loadTopSaunas, loadUpcomingEvents])

  useEffect(() => {
    if (!navigator.geolocation) return
    // SP-039I: a deep link owns the initial center — don't let geolocation
    // steal it back to the user's position.
    if (deepLinkSaunaId) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ]

        setUserLocation(coords)
        setSelectedLocation(coords)
      },
      (error) => {
        // Brak geolokalizacji to normalna sytuacja (odmowa uprawnień, pozycja
        // niedostępna lub timeout) — nie jest to błąd aplikacji. Mapa pozostaje
        // na domyślnym środku (fallbackCenter). Logujemy czytelnie i bez alarmu.
        console.warn(
          `Geolokalizacja niedostępna (kod ${error.code}): ${error.message}. ` +
            'Mapa używa domyślnej lokalizacji.'
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }, [deepLinkSaunaId])

  // Effect Event: realtime callbacks always see the current loadSaunas
  // (current location/radius) without resubscribing the channel on every
  // location or radius change.
  const onRealtimeChange = useEffectEvent(() => {
    void loadSaunas()
  })

  useEffect(() => {
    const channel = supabase
      .channel('saunas-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'saunas',
        },
        () => {
          onRealtimeChange()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sauna_photos',
        },
        () => {
          onRealtimeChange()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!selectedSauna) return

    setTimeout(() => {
      const marker = markerRefs.current[selectedSauna.id]

      if (marker) {
        marker.openPopup()
      }
    }, 700)
  }, [selectedSauna])

  // SP-039I: resolve the deep-link sauna's coordinates and re-center data
  // loading on it, so the target is fetched regardless of the current radius.
  // Runs once; failure (invalid UUID / unknown sauna) falls back gracefully.
  useEffect(() => {
    if (!deepLinkSaunaId || deepLinkResolvedRef.current) return
    deepLinkResolvedRef.current = true

    let cancelled = false

    void (async () => {
      const { data, error } = await supabase
        .from('saunas')
        .select('latitude, longitude')
        .eq('id', deepLinkSaunaId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        toast.error(t('toast.saunaNotFound'))
        return
      }

      setUserLocation([data.latitude, data.longitude])
      setSelectedLocation([data.latitude, data.longitude])
    })()

    return () => {
      cancelled = true
    }
  }, [deepLinkSaunaId, t])

  // SP-039I: once the recentre above has loaded the target into `items`, select
  // it. Existing MapFocusController (flyTo zoom 16) and the popup effect above
  // then run unchanged. Runs at most once per deep link.
  useEffect(() => {
    if (!deepLinkSaunaId || deepLinkSelectedRef.current) return

    const target = items.find((item) => item.id === deepLinkSaunaId)
    if (!target) return

    // Defer so the selection lands as an async callback rather than a
    // synchronous cascading render (react-hooks/set-state-in-effect). The
    // guard is set inside the callback so a cleanup before it fires can't
    // strand the deep link unselected.
    const timer = setTimeout(() => {
      deepLinkSelectedRef.current = true
      setSelectedSauna(target)
    }, 0)

    return () => clearTimeout(timer)
  }, [items, deepLinkSaunaId])

  return (
    <div className="flex h-dvh w-full lg:h-screen">

      <div className="relative flex-1">

        {/* SP-045: compact mobile controls (search / filters / menu / geo). */}
        <MapControls
          onSearch={() => setMobileSearchOpen(true)}
          onFilters={() => setMobileFiltersOpen(true)}
          onMenu={() => setShowAccountPanel(true)}
          onGeolocate={centerOnUserLocation}
          filtersActive={filtersActive}
        />

        <MapContainer center={userLocation} zoom={14} className="h-full w-full">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            detectRetina={true}
          />

          <MapResizeGuard />
          <MapFocusController selectedSauna={selectedSauna} />
          <MapCenterController center={userLocation} trigger={centerTrigger} />
          <MapPanController target={panTarget} />

          <MapClickHandler
            onSelect={(lat, lng) => setSelectedLocation([lat, lng])}
            onOpenContextMenu={(lat, lng) => {
              setContextMenuLocation([lat, lng])
            }}
            onCloseAddForm={() => setShowAddForm(false)}
          />

          <Marker position={selectedLocation} icon={markerIcon}>
            <Popup>{t('popup.newSaunaHere')}</Popup>
          </Marker>

          {contextMenuLocation && (
            <Popup
              position={contextMenuLocation}
              eventHandlers={{
                remove: () => {
                  setContextMenuLocation(null)
                },
              }}
            >
              <div className="flex flex-col gap-2">
                <div className="text-sm font-semibold">{t('context.title')}</div>

                <button
                  className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    const location = contextMenuLocation

                    if (!location) return

                    setSelectedLocation(location)
                    setContextMenuLocation(null)

                    setTimeout(() => {
                      setShowAddForm(true)
                    }, 0)
                  }}
                >
                  {t('context.addSaunaHere')}
                </button>
              </div>
            </Popup>
          )}

          <MarkerClusterGroup
            key={clusterRefreshKey}
            chunkedLoading
            maxClusterRadius={60}
            iconCreateFunction={createClusterIcon}
          >
            {visibleItems.map((item) => (
              <Marker
                key={`${item.id}-${item.image_urls?.length ?? 0}-${item.status}`}
                position={[item.latitude, item.longitude]}
				icon={createSaunaIcon(
				  item.image_urls?.[0] ?? item.cover_image_url,
				  item.category,
				  item.has_upcoming_event,
				  item.avg_rating,
				  item.masters,
				  locale
				)}
                eventHandlers={{
                  click: () => {
                    setShowAddForm(false)
                    setPanTarget((prev) => ({
                      center: [item.latitude, item.longitude],
                      n: (prev?.n ?? 0) + 1,
                    }))
                  },
                }}
                ref={(ref) => {
                  markerRefs.current[item.id] = ref
                }}
              >
                <Popup autoPan={false}>
                  <SaunaPopup
					sauna={item}
					onAddPhoto={(itemId) => setUploadItemId(itemId)}
					onEdit={(item) => setEditingSauna(item)}
					onAddEvent={(item) => setEventSauna(item)}
				  />
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>


        {showAddForm && (
          <AddSaunaForm
            onAdded={async () => {
              // The form owns success messaging (pending vs active differ
              // since SP-036) — no extra toast here.
              await loadSaunas()
              setShowAddForm(false)
            }}
            onClose={() => setShowAddForm(false)}
            latitude={selectedLocation[0]}
            longitude={selectedLocation[1]}
            onCenterOnDuplicate={(lat, lng) =>
              setPanTarget({ center: [lat, lng], n: Date.now() })
            }
          />
        )}
      </div>

      <MapSearchPanel
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        saunas={items}
        topSaunas={topSaunas}
        categoryEmoji={getCategoryEmoji}
        onSelectSauna={focusSauna}
        onFocusEventSauna={focusSauna}
      />

      <MapFiltersPanel
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        mapMode={mapMode}
        setMapMode={setMapMode}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        onlyWithPhotos={onlyWithPhotos}
        setOnlyWithPhotos={setOnlyWithPhotos}
        onlyWithEvents={onlyWithEvents}
        setOnlyWithEvents={setOnlyWithEvents}
        radiusKm={radiusKm}
        setRadiusKm={setRadiusKm}
        hasActiveFilters={filtersActive}
        onReset={() => {
          setMapMode('all')
          setCategoryFilter('all')
          setOnlyWithPhotos(false)
          setOnlyWithEvents(false)
          setRadiusKm(1000)
        }}
      />

      {showAccountPanel && (
        <div
          className="fixed inset-0 z-[11000] flex justify-end bg-transparent"
          onClick={() => setShowAccountPanel(false)}
        >
          <div
            className="flex h-full w-80 max-w-full flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base font-bold">SaunaPlanet</h2>

              <button
                onClick={() => setShowAccountPanel(false)}
                aria-label={tNav('closeMenu')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto text-sm">
              {user ? (
                <div className="border-b px-4 py-4">
                  <p className="truncate font-medium text-gray-900">{user.email}</p>
                  {role && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadge[role] ?? roleBadge.user}`}>
                      {tRoles(role)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="border-b px-4 py-4 space-y-2">
                  <PanelNavItem href="/auth/login" onClick={() => setShowAccountPanel(false)} bold>{tNav('login')}</PanelNavItem>
                  <PanelNavItem href="/auth/register" onClick={() => setShowAccountPanel(false)} highlight>{tNav('register')}</PanelNavItem>
                </div>
              )}

              {user && (
                <div className="border-b px-4 py-3 space-y-1">
                  <PanelNavItem href="/profile" onClick={() => setShowAccountPanel(false)}>{tNav('myProfile')}</PanelNavItem>
                  <PanelNavItem href="/submit" onClick={() => setShowAccountPanel(false)}>{tNav('submitSauna')}</PanelNavItem>
                  {(role === 'admin' || role === 'moderator') && (
                    <PanelNavItem href="/admin" onClick={() => setShowAccountPanel(false)} badge={tNav('adminBadge')}>
                      {tNav('adminPanel')}
                    </PanelNavItem>
                  )}
                </div>
              )}

              <div className="border-b px-4 py-3 space-y-1">
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{t('account.discover')}</p>
                <PanelNavItem href="/events" onClick={() => setShowAccountPanel(false)}>{tNav('events')}</PanelNavItem>
                <PanelNavItem href="/masters" onClick={() => setShowAccountPanel(false)}>{tNav('masters')}</PanelNavItem>
                <PanelNavItem href="/sauny" onClick={() => setShowAccountPanel(false)}>{tNav('saunas')}</PanelNavItem>
                <PanelNavItem href="/about" onClick={() => setShowAccountPanel(false)}>{tNav('about')}</PanelNavItem>
              </div>

              {user && (
                <div className="px-4 py-3">
                  <button
                    onClick={async () => {
                      await createClient().auth.signOut()
                      setShowAccountPanel(false)
                      window.location.reload()
                    }}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 active:bg-red-200"
                  >
                    <LogoutIcon className="h-4 w-4" aria-hidden="true" />
                    {tNav('logoutShort')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {uploadItemId && (
        <AddPhotoModal
          itemId={uploadItemId}
          onClose={() => setUploadItemId(null)}
          onUploaded={async () => {
            await loadSaunas()
            toast.success(t('toast.photoAdded'))
          }}
        />
      )}

      {editingSauna && (
        <EditSaunaModal
          item={editingSauna}
          onClose={() => setEditingSauna(null)}
          onSaved={loadSaunas}
        />
      )}
	  {eventSauna && (
		<AddEventModal
			saunaId={eventSauna.id}
			saunaName={eventSauna.name}
			onClose={() => setEventSauna(null)}
			onAdded={loadSaunas}
		/>
	  )}
    </div>
  )
}

// Account-panel link with the same rendering contract as the Navbar drawer:
// Lucide icon from the central mapping beside the visible label; routes,
// labels and authorization gating stay with the caller.
function PanelNavItem({
  href,
  onClick,
  children,
  bold,
  highlight,
  badge,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
  bold?: boolean
  highlight?: boolean
  badge?: string
}) {
  const Icon = DRAWER_NAV_ICONS[href]
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl px-3 py-2 transition-colors ${
        bold ? 'font-semibold' : ''
      } ${highlight ? 'bg-black text-white hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      <span className="flex items-center gap-2.5">
        {Icon && (
          <Icon
            className={`h-4 w-4 ${highlight ? 'text-white' : 'text-gray-500'}`}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
      {badge && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}
