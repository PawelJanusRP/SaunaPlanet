'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
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
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import AddSaunaForm from '@/components/AddSaunaForm'
import AddPhotoModal from '@/components/AddPhotoModal'
import EditSaunaModal from '@/components/EditSaunaModal'
import AddEventModal from '@/components/AddEventModal'
import Link from 'next/link'

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

type Sauna = { 
  id: string
  name: string
  description: string | null
  category: string
  latitude: number
  longitude: number
  city: string | null
  voivodeship: string | null
  website: string | null
  source: string | null
  source_url: string | null
  status: string
  created_at: string
  distance_m: number
  image_urls: string[] | null
  cover_image_url: string | null
  has_upcoming_event?: boolean
  avg_rating: number | null
  review_count: number
  masters?: {
    id: string
    name: string
    avatar_url: string | null
    level: string | null
  }[]
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

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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

function getCategoryLabel(category: string) {
  switch (category) {
    case 'public_sauna':
      return 'Sauna publiczna'
    case 'spa':
      return 'SPA / wellness'
    case 'hotel':
      return 'Sauna hotelowa'
    case 'event':
      return 'Event saunowy'
    case 'outdoor':
      return 'Sauna plenerowa'
    default:
      return category
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

function createSaunaIcon(
  imageUrl: string | null,
  category: string,
  hasUpcomingEvent = false,
  avgRating: number | null = null,
  masters: Sauna['masters'] = []
) {
  const categoryEmoji = getCategoryEmoji(category)
  const categoryColor = getCategoryColor(category)
  const size = hasUpcomingEvent ? 60 : 46
  const borderColor = hasUpcomingEvent ? '#dc2626' : categoryColor
  const pulseClass = hasUpcomingEvent ? 'sauna-event-pulse' : ''
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
    return `<a href="/masters/${m.id}" title="${m.name}" onclick="event.stopPropagation()" style="position:absolute;left:${left}px;top:${top}px;z-index:1001;width:${satSize}px;height:${satSize}px;border-radius:9999px;display:block;cursor:pointer;"><img src="${m.avatar_url}" style="width:100%;height:100%;border-radius:9999px;object-fit:cover;border:2px solid ${color};background:white;box-shadow:0 1px 4px rgba(0,0,0,0.35);" /></a>`
  }).join('')
  return L.divIcon({
    className: '',
		html: `
		<div class="${hasUpcomingEvent ? 'sauna-event-pulse' : ''}"
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
  const [imageIndex, setImageIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [events, setEvents] = useState<SaunaEvent[]>([])

  useEffect(() => {
    loadEvents()
  }, [sauna.id])

  async function loadEvents() {
    const { data, error } = await supabase.rpc('get_sauna_events', {
      sauna_uuid: sauna.id,
    })

    if (error) {
      console.error('LOAD EVENTS ERROR:', error)
      return
    }

    setEvents(data ?? [])
  }

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
              className="h-44 w-full cursor-pointer object-cover"
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
          <div className="mb-3 flex h-40 w-full items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
            Brak zdjęcia
          </div>
        )}

        <h3 className="mb-2 text-base font-bold text-gray-900">
          {sauna.name}
        </h3>
		{sauna.avg_rating && (
		<div className="mb-2 text-sm font-semibold text-yellow-600">
			⭐ {Number(sauna.avg_rating).toFixed(1)} ({sauna.review_count} opinii)
		</div>
		)}
		
        {sauna.description && (
          <p className="mb-3 text-sm text-gray-700">{sauna.description}</p>
        )}

        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2 py-1">
            {getCategoryEmoji(sauna.category)} {getCategoryLabel(sauna.category)}
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

		<Link
		href={`/sauna/${sauna.id}`}
		className="mb-2 block rounded-xl bg-blue-600 px-3 py-2 text-center text-sm font-semibold !text-white transition hover:bg-blue-700"
		>
		📖 Szczegóły obiektu
		</Link>
		
		{sauna.website && (
		<a
			href={sauna.website}
			target="_blank"
			rel="noreferrer"
			className="mb-2 block rounded-xl bg-green-600 px-3 py-2 text-center text-sm font-semibold !text-white transition hover:bg-green-700"
		>
			🌍 Oficjalna strona
		</a>
		)}

		{events.length > 0 && (
		<div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-2">
			<div className="mb-2 text-sm font-bold text-orange-700">
			🔥 Najbliższe wydarzenia
			</div>
		
			<div className="space-y-2">
			{events.slice(0, 3).map((event) => (
				<div
				key={event.id}
				className="rounded-lg bg-white p-2 text-xs"
				>
				<div className="font-semibold">
					{event.title}
				</div>
		
				<div className="text-gray-500">
				{event.event_date.substring(0, 10)}
				{event.event_time
					? ` ${event.event_time.substring(0, 5)}`
					: ''}
				</div>
		
				{event.price && (
					<div className="text-orange-700">
					{event.price && (
					<div className="text-orange-700 font-semibold">
						{event.price.includes('zł')
						? event.price
						: `${event.price} zł`}
					</div>
)}
					</div>
				)}
				</div>
			))}
			</div>
		</div>
		)}
		
        <div className="flex flex-col gap-2">
          <button
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            onClick={() => onAddPhoto(sauna.id)}
          >
            📷 Dodaj zdjęcie
          </button>

		  <button
		  	className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
		  	onClick={() => onAddEvent(sauna)}
		  >
		  	🔥 Dodaj event
		  </button>
  
          <button
            className="rounded-xl bg-gray-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-900"
            onClick={() => onEdit(sauna)}
          >
            ✏️ Edytuj saunę
          </button>
        </div>
      </div>
    </>
  )
}

const roleLabel: Record<string, string> = {
  admin: 'Administrator',
  moderator: 'Moderator',
  user: 'Użytkownik',
}

const roleBadge: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  moderator: 'bg-orange-100 text-orange-700',
  user: 'bg-gray-100 text-gray-600',
}

export default function SaunaMap() {
  const { user, role } = useAuth()
  const [items, setItems] = useState<Sauna[]>([])
  const [topSaunas, setTopSaunas] = useState<TopSauna[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadItemId, setUploadItemId] = useState<string | null>(null)
  const [editingSauna, setEditingSauna] = useState<Sauna | null>(null)
  const [eventSauna, setEventSauna] = useState<Sauna | null>(null)
  const [selectedSauna, setSelectedSauna] = useState<Sauna | null>(null)
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [userLocation, setUserLocation] = useState<[number, number]>(fallbackCenter)
  const [centerTrigger, setCenterTrigger] = useState(0)
  const [selectedLocation, setSelectedLocation] = useState<[number, number]>(fallbackCenter)
  const [showAddForm, setShowAddForm] = useState(false)
  const [contextMenuLocation, setContextMenuLocation] = useState<[number, number] | null>(null)
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half')
  const [showAccountPanel, setShowAccountPanel] = useState(false)
  const [radiusKm, setRadiusKm] = useState(1000)
  const [onlyWithEvents, setOnlyWithEvents] = useState(false)
  const [mapMode, setMapMode] = useState<'saunas' | 'events' | 'all'>('all')

  const markerRefs = useRef<Record<string, L.Marker | null>>({})

  const visibleItems = items.filter((item) => {
	  if (mapMode === 'events' && !item.has_upcoming_event) {
	    return false
	  }
  const search = searchText.toLowerCase().trim()
  
  if (search) {
  	const name = item.name?.toLowerCase() ?? ''
  	const description = item.description?.toLowerCase() ?? ''
  	const category = item.category?.toLowerCase() ?? ''
  	const city = item.city?.toLowerCase() ?? ''
  
  	if (
  	!name.includes(search) &&
  	!description.includes(search) &&
  	!category.includes(search) &&
  	!city.includes(search)
  	) {
  	return false
  	}
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
  
  async function loadUpcomingEvents() {
  const { data, error } = await supabase.rpc(
    'get_upcoming_events'
  )

  if (error) {
    console.error('LOAD EVENTS ERROR:', error)
    return
  }
  
  console.log('UPCOMING EVENTS:', data)
  
  setUpcomingEvents(data ?? [])
}

  async function loadTopSaunas() {
    const { data, error } = await supabase.rpc('get_top_saunas')
  
    if (error) {
      console.error('LOAD TOP SAUNAS ERROR:', error)
      return
    }
  
  setTopSaunas(data ?? [])
}
  async function loadSaunas() {
    setLoading(true)

    const { data, error } = await supabase.rpc('get_saunas_nearby', {
      user_lat: userLocation[0],
      user_lng: userLocation[1],
      radius_m: radiusKm * 1000,
    })
	
	console.log(
		data?.find((s: any) => s.image_urls?.length > 0)
)

    if (error) {
      console.error(error)
      toast.error('Nie udało się pobrać listy saun')
      setLoading(false)
      return
    }
	const { data: eventSaunas } = await supabase.rpc(
  'get_upcoming_event_saunas'
)

	const eventIds = new Set(
	  (eventSaunas ?? []).map((e: any) => e.sauna_id)
)

    setItems(
	  (data ?? []).map((sauna: any) => ({
		...sauna,
		has_upcoming_event: eventIds.has(sauna.id),
	  }))
	)
    setLoading(false)
  }

  async function centerOnUserLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolokalizacja nie jest wspierana')
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

        toast.success('Wycentrowano mapę')
      },
      () => {
        toast.error('Nie udało się pobrać lokalizacji')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }

useEffect(() => {
  loadSaunas()
  loadTopSaunas()
  loadUpcomingEvents()
}, [userLocation, radiusKm])

  useEffect(() => {
    if (!navigator.geolocation) return

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
        console.error('GEOLOCATION ERROR:', error)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }, [])

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
        async () => {
          await loadSaunas()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sauna_photos',
        },
        async () => {
          await loadSaunas()
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

  return (
    <div className="flex h-screen w-full">
      <div className="hidden w-80 overflow-y-auto border-r bg-white lg:block">
        <div className="border-b p-3">
          <input
            className="mb-3 w-full rounded-xl border p-2 text-sm"
            placeholder="Szukaj sauny, miasta, kategorii..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <div className="font-bold">
            {loading ? 'Ładowanie...' : `Znaleziono: ${visibleItems.length}`}
          </div>
		  {topSaunas.length > 0 && (
		  <div className="mt-3 rounded-xl bg-yellow-50 p-3">
		  	<div className="mb-2 text-sm font-bold text-yellow-700">
		  	🏆 TOP SaunaPlanet
		  	</div>
		  
		  	<div className="space-y-2">
		  	{topSaunas.map((sauna, index) => (
		  		<a
		  		key={sauna.sauna_id}
		  		href={`/sauna/${sauna.sauna_id}`}
		  		className="block rounded-lg bg-white p-2 text-xs hover:bg-yellow-100"
		  		>
		  		<div className="font-semibold">
		  			{index + 1}. {sauna.sauna_name}
		  		</div>
		  
		  		<div className="text-yellow-700">
		  			⭐ {Number(sauna.avg_rating).toFixed(1)} ({sauna.review_count})
		  		</div>
		  		</a>
		  	))}
		  	</div>
		  </div>
		  )}
        </div>

        <label className="flex items-center gap-2 border-b p-3 text-sm">
          <input
            type="checkbox"
            checked={onlyWithPhotos}
            onChange={(e) => setOnlyWithPhotos(e.target.checked)}
          />
          📷 Tylko ze zdjęciem
        </label>

		<label className="flex items-center gap-2 border-b p-3 text-sm">
		<input
			type="checkbox"
			checked={onlyWithEvents}
			onChange={(e) => setOnlyWithEvents(e.target.checked)}
		/>
		🔥 Tylko sauny z eventem w 7 dni
		</label>
				
		<button
		onClick={() => setOnlyWithEvents((v) => !v)}
		className={`rounded-full px-3 py-1 text-xs font-semibold ${
			onlyWithEvents
			? 'bg-orange-600 text-white'
			: 'bg-gray-100 text-gray-700'
		}`}
		>
		
		🔥 Eventy 7 dni
		</button>
        {mapMode === 'events' ? (
  <div className="p-3">
    <div className="mb-3 text-sm font-bold text-orange-700">
      🔥 Nadchodzące eventy
    </div>

    <div className="space-y-2">
      {upcomingEvents.map((event) => (
        <div
		key={event.event_id}
		className="cursor-pointer rounded-xl border bg-white p-3 text-sm hover:bg-orange-50"
		onClick={() => {
			const sauna = items.find(
			(s) => s.id === event.sauna_id
			)
		
			if (!sauna) return
		
			setSelectedSauna(sauna)
		
			setSelectedLocation([
			sauna.latitude,
			sauna.longitude,
			])
		
			const marker = markerRefs.current[sauna.id]
		
			if (marker) {
			marker.openPopup()
			}
		}}
		>
          <div className="font-semibold text-orange-700">
            🔥 {event.title}
          </div>

          <div className="mt-1 text-xs font-medium text-gray-800">
            {event.sauna_name}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            {event.event_date.substring(0, 10)}
            {event.event_time
              ? ` ${event.event_time.substring(0, 5)}`
              : ''}
          </div>

          {event.price && (
            <div className="mt-1 text-xs font-semibold text-orange-700">
              {event.price.includes('zł') ? event.price : `${event.price} zł`}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
) : (
  visibleItems.map((item) => {
    const img = item.image_urls?.[0] ?? item.cover_image_url

    return (
      <div
        key={item.id}
        className={`cursor-pointer border-b p-2 hover:bg-gray-100 ${
          selectedSauna?.id === item.id ? 'bg-blue-50' : ''
        }`}
        onClick={() => {
          setSelectedSauna(item)
          setSelectedLocation([item.latitude, item.longitude])
        }}
      >
        {img ? (
          <img
            src={img}
            alt={item.name}
            className="mb-2 h-24 w-full rounded object-cover"
          />
        ) : (
          <div className="mb-2 flex h-24 w-full items-center justify-center rounded bg-gray-200 text-xs">
            Brak zdjęcia
          </div>
        )}

        <div className="mb-1 text-sm font-semibold">
          {getCategoryEmoji(item.category)} {item.name}
        </div>

        {item.avg_rating && (
          <div className="mb-1 text-xs font-semibold text-yellow-600">
            ⭐ {Number(item.avg_rating).toFixed(1)} ({item.review_count})
          </div>
        )}

        {item.city && (
          <div className="mb-1 text-xs text-gray-500">{item.city}</div>
        )}

        <div className="text-xs text-gray-500">
          {Math.round(item.distance_m)} m
        </div>
      </div>
    )
  })
)}
      </div>

      <div className="relative flex-1">
        <button
          onClick={() => setShowAccountPanel(true)}
          className="absolute right-4 top-4 z-[10000] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg lg:right-5 lg:top-5"
        >
          <div className="flex flex-col items-center gap-1">
            <span className="block h-[2px] w-5 rounded bg-gray-800" />
            <span className="block h-[2px] w-5 rounded bg-gray-800" />
            <span className="block h-[2px] w-5 rounded bg-gray-800" />
          </div>
        </button>

        <button
          onClick={centerOnUserLocation}
          className="absolute bottom-24 right-4 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-xl transition hover:scale-105 active:scale-95"
        >
          📍
        </button>

        <div className="absolute left-3 top-16 z-[9999] flex max-w-[calc(100vw-24px)] gap-2 overflow-x-auto rounded-xl bg-white/90 p-2 shadow">
          {[
            { value: 'all', label: 'Wszystko' },
            { value: 'public_sauna', label: '🧖' },
            { value: 'spa', label: '♨️' },
            { value: 'hotel', label: '🏨' },
            { value: 'event', label: '🔥' },
            { value: 'outdoor', label: '🌲' },
          ].map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
                categoryFilter === cat.value
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
		<div className="absolute left-3 top-3 z-[9999] flex gap-2 rounded-xl bg-white/90 p-2 shadow">
		{[
			{ value: 'all', label: '🧖+🔥' },
			{ value: 'saunas', label: '🧖 Sauny' },
			{ value: 'events', label: '🔥 Eventy' },
		].map((mode) => (
			<button
			key={mode.value}
			onClick={() => setMapMode(mode.value as 'saunas' | 'events' | 'all')}
			className={`rounded-full px-3 py-1 text-sm font-semibold ${
				mapMode === mode.value
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'
			}`}
			>
			{mode.label}
			</button>
		))}
		</div>
		
        <MapContainer center={userLocation} zoom={14} className="h-full w-full">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapResizeGuard />
          <MapFocusController selectedSauna={selectedSauna} />
          <MapCenterController center={userLocation} trigger={centerTrigger} />

          <MapClickHandler
            onSelect={(lat, lng) => setSelectedLocation([lat, lng])}
            onOpenContextMenu={(lat, lng) => {
              setContextMenuLocation([lat, lng])
            }}
            onCloseAddForm={() => setShowAddForm(false)}
          />

          <Marker position={selectedLocation} icon={markerIcon}>
            <Popup>Nowa sauna tutaj</Popup>
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
                <div className="text-sm font-semibold">Co chcesz zrobić?</div>

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
                  Dodaj saunę tutaj
                </button>
              </div>
            </Popup>
          )}

          <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
            {visibleItems.map((item) => (
              <Marker
                key={`${item.id}-${item.image_urls?.length ?? 0}-${item.status}`}
                position={[item.latitude, item.longitude]}
				icon={createSaunaIcon(
				  item.image_urls?.[0] ?? item.cover_image_url,
				  item.category,
				  item.has_upcoming_event,
				  item.avg_rating,
				  item.masters
				)}
                eventHandlers={{
                  click: () => {
                    setShowAddForm(false)
                  },
                }}
                ref={(ref) => {
                  markerRefs.current[item.id] = ref
                }}
              >
                <Popup>
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

        <div
          className={`
            absolute bottom-0 left-0 right-0 z-[9999]
            rounded-t-3xl bg-white shadow-2xl lg:hidden
            transition-all duration-300
            ${
              sheetState === 'collapsed'
                ? 'h-[80px]'
                : sheetState === 'half'
                ? 'h-[40vh]'
                : 'h-[85vh]'
            }
          `}
        >
          <button
            className="flex w-full justify-center py-3"
            onClick={() => {
              setSheetState((current) => {
                if (current === 'collapsed') return 'half'
                if (current === 'half') return 'full'
                return 'collapsed'
              })
            }}
          >
            <div className="h-1.5 w-12 rounded-full bg-gray-300" />
          </button>

          <div className="max-h-[40vh] overflow-y-auto p-3">
            <div className="mb-3 text-sm font-bold">
              <input
                className="mb-3 w-full rounded-xl border p-2 text-sm"
                placeholder="Szukaj sauny..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />

              {visibleItems.length} saun w pobliżu
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => setOnlyWithPhotos((v) => !v)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  onlyWithPhotos
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                📷 Zdjęcia
              </button>
			  <button
			  onClick={() => setOnlyWithEvents((v) => !v)}
			  className={`rounded-full px-3 py-1 text-xs font-semibold ${
			  	onlyWithEvents
			  	? 'bg-orange-600 text-white'
			  	: 'bg-gray-100 text-gray-700'
			  }`}
			  >
			  🔥 Eventy 7 dni
			  </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {[3, 10, 30, 100].map((radius) => (
                <button
                  key={radius}
                  onClick={() => setRadiusKm(radius)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    radiusKm === radius
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {radius} km
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {visibleItems.map((item) => {
                const img = item.image_urls?.[0] ?? item.cover_image_url

                return (
                  <div
                    key={item.id}
                    className="flex cursor-pointer gap-3 rounded-xl border p-2 active:bg-gray-100"
                    onClick={() => {
                      setSelectedSauna(item)
                      setSelectedLocation([item.latitude, item.longitude])
                      setShowAddForm(false)
                      setSheetState('collapsed')
                    }}
                  >
                    {img ? (
                      <img
                        src={img}
                        alt={item.name}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200 text-xs">
                        brak
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {getCategoryEmoji(item.category)} {item.name}
                      </div>
					  {item.avg_rating && (
					  <div className="mt-1 text-xs font-semibold text-yellow-600">
					  	⭐ {Number(item.avg_rating).toFixed(1)} ({item.review_count})
					  </div>
					  )}

                      {item.city && (
                        <div className="mt-1 text-xs text-gray-500">
                          {item.city}
                        </div>
                      )}

                      <div className="mt-1 text-xs text-gray-500">
                        {Math.round(item.distance_m)} m
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {showAddForm && (
          <AddSaunaForm
            onAdded={async () => {
              await loadSaunas()
              toast.success('Dodano saunę')
              setShowAddForm(false)
            }}
            onClose={() => setShowAddForm(false)}
            latitude={selectedLocation[0]}
            longitude={selectedLocation[1]}
          />
        )}
      </div>

      {showAccountPanel && (
        <div className="fixed inset-0 z-[11000] flex justify-end bg-black/40">
          <div className="flex h-full w-80 max-w-full flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base font-bold">SaunaPlanet</h2>

              <button
                onClick={() => setShowAccountPanel(false)}
                className="text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto text-sm">
              {user ? (
                <div className="border-b px-4 py-4">
                  <p className="truncate font-medium text-gray-900">{user.email}</p>
                  {role && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadge[role] ?? roleBadge.user}`}>
                      {roleLabel[role] ?? role}
                    </span>
                  )}
                </div>
              ) : (
                <div className="border-b px-4 py-4 space-y-2">
                  <Link href="/auth/login" onClick={() => setShowAccountPanel(false)} className="block rounded-xl px-3 py-2 font-semibold text-gray-700 hover:bg-gray-100">Zaloguj się</Link>
                  <Link href="/auth/register" onClick={() => setShowAccountPanel(false)} className="block rounded-xl bg-black px-3 py-2 text-center text-white hover:bg-gray-800">Zarejestruj się</Link>
                </div>
              )}

              {user && (
                <div className="border-b px-4 py-3 space-y-1">
                  <Link href="/profile" onClick={() => setShowAccountPanel(false)} className="block rounded-xl px-3 py-2 text-gray-700 hover:bg-gray-100">Mój profil</Link>
                  <Link href="/submit" onClick={() => setShowAccountPanel(false)} className="block rounded-xl px-3 py-2 text-gray-700 hover:bg-gray-100">Zgłoś saunę</Link>
                  {(role === 'admin' || role === 'moderator') && (
                    <Link href="/admin" onClick={() => setShowAccountPanel(false)} className="flex items-center justify-between rounded-xl px-3 py-2 text-gray-700 hover:bg-gray-100">
                      Panel admina
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">Admin</span>
                    </Link>
                  )}
                </div>
              )}

              <div className="border-b px-4 py-3 space-y-1">
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Odkrywaj</p>
                <Link href="/events" onClick={() => setShowAccountPanel(false)} className="block rounded-xl px-3 py-2 text-gray-700 hover:bg-gray-100">Wydarzenia</Link>
                <Link href="/masters" onClick={() => setShowAccountPanel(false)} className="block rounded-xl px-3 py-2 text-gray-700 hover:bg-gray-100">Saunamistrzowie</Link>
              </div>

              {user && (
                <div className="px-4 py-3">
                  <button
                    onClick={async () => {
                      await createClient().auth.signOut()
                      setShowAccountPanel(false)
                      window.location.reload()
                    }}
                    className="w-full rounded-xl border px-4 py-2 text-left text-gray-600 hover:bg-gray-50"
                  >
                    Wyloguj
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
            toast.success('Dodano zdjęcie')
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
