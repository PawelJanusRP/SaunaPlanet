'use client'

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
import AddItemForm from '@/components/AddItemForm'
import AddPhotoModal from '@/components/AddPhotoModal'
import ReservationBadge from '@/components/ReservationBadge'
import { isReservationExpired } from '@/lib/reservationTime'
import EditItemModal from '@/components/EditItemModal'

type Item = {
  id: string
  title: string
  description: string | null
  category: string
  condition: string | null
  size: string | null
  latitude: number
  longitude: number
  status: string
  created_at: string
  expires_at: string
  distance_m: number
  image_urls: string[] | null
  reserved_until: string | null
  reserved_by: string | null
  taken_at: string | null
  created_by_device_id: string | null
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

function MapFocusController({ selectedItem }: { selectedItem: Item | null }) {
  const map = useMap()

  useEffect(() => {
    if (!selectedItem) return

    map.flyTo([selectedItem.latitude, selectedItem.longitude], 16, {
      duration: 0.6,
    })
  }, [selectedItem, map])

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

function createItemIcon(imageUrl: string | null, status: string) {
  if (!imageUrl) return markerIcon

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 46px;
        height: 46px;
        border-radius: 9999px;
        overflow: hidden;
        border: 3px solid ${status === 'reserved' ? '#f97316' : 'white'};
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        background: white;
      ">
        <img
          src="${imageUrl}"
          style="
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          "
        />
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 46],
    popupAnchor: [0, -46],
  })
}

function ItemPopup({
  item,
  deviceId,
  onAddPhoto,
  onEdit,
  onRefresh,
}: {
  item: Item
  deviceId: string | null
  onAddPhoto: (itemId: string) => void
  onEdit: (item: Item) => void
  onRefresh: () => Promise<void>
}) {
  const [imageIndex, setImageIndex] = useState(0)
  const [actionLoading, setActionLoading] = useState(false)

  const images = item.image_urls ?? []
  const currentImage = images[imageIndex]

  const reservationExpired =
    item.status === 'reserved' && isReservationExpired(item.reserved_until)

  const effectiveStatus = reservationExpired ? 'active' : item.status

  const isReserved = effectiveStatus === 'reserved' && !!item.reserved_until
  const isMine = !!item.reserved_by && deviceId === item.reserved_by
  const isOwner =
  !!item.created_by_device_id &&
  item.created_by_device_id === deviceId

  async function reserveItem() {
    if (!deviceId) {
      toast.error('Nie udało się ustalić identyfikatora urządzenia')
      return
    }

    setActionLoading(true)

	const { error } = await supabase.rpc('mark_item_taken_mvp', {
	  item_id: item.id,
	})

    setActionLoading(false)

    if (error) {
      console.error('RESERVATION ERROR:', error)
      toast.error(error.message)
      return
    }

    await onRefresh()
    toast.success('Zarezerwowano na 30 minut')
  }

  async function markAsTaken() {
    setActionLoading(true)

    const { error } = await supabase
      .from('items')
      .update({
        status: 'taken',
        taken_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    setActionLoading(false)

    if (error) {
      console.error('TAKEN ERROR:', error)
      toast.error(error.message)
      return
    }

    await onRefresh()
    toast.success('Oznaczono jako odebrane')
  }

  async function cancelReservation() {
    setActionLoading(true)

    const { error } = await supabase
      .from('items')
      .update({
        status: 'active',
        reserved_until: null,
        reserved_by: null,
      })
      .eq('id', item.id)

    setActionLoading(false)

    if (error) {
      console.error('CANCEL RESERVATION ERROR:', error)
      toast.error(error.message)
      return
    }

    await onRefresh()
    toast.success('Anulowano rezerwację')
  }

async function removeItem() {
  setActionLoading(true)

  const { error } = await supabase.rpc('mark_item_taken_mvp', {
    item_id: item.id,
  })

  setActionLoading(false)

  if (error) {
    console.error('REMOVE ITEM ERROR FULL:', JSON.stringify(error, null, 2))
    toast.error(error.message ?? 'Błąd usuwania ogłoszenia')
    return
  }

  await onRefresh()

  toast.success('Ogłoszenie usunięte')
}

  return (
    <div className="w-[240px]">
      {currentImage ? (
        <div className="relative mb-3 overflow-hidden rounded-xl">
          <img
            src={currentImage}
            alt={item.title}
            className="h-44 w-full object-cover"
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

      <div className="mb-2">
        <h3 className="text-base font-bold text-gray-900">{item.title}</h3>

        <div className="mt-1">
          <ReservationBadge
            status={effectiveStatus}
            reservedUntil={item.reserved_until}
          />
        </div>
      </div>

      {item.description && (
        <p className="mb-3 text-sm text-gray-700">{item.description}</p>
      )}

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2 py-1">
          {item.category}
        </span>

        {item.condition && (
          <span className="rounded-full bg-gray-100 px-2 py-1">
            {item.condition}
          </span>
        )}

        {item.size && (
          <span className="rounded-full bg-gray-100 px-2 py-1">
            {item.size}
          </span>
        )}

        <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
          {Math.round(item.distance_m)} m
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <button
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-95"
          onClick={() => onAddPhoto(item.id)}
        >
          Dodaj zdjęcie
        </button>
		{isOwner && (
		  <button
			className="rounded-xl bg-gray-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 active:scale-95"
			onClick={() => onEdit(item)}
		  >
			Edytuj ogłoszenie
		  </button>
		)}
        {effectiveStatus === 'active' && (
          <button
            className="rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700 active:scale-95 disabled:opacity-50"
            disabled={actionLoading || !deviceId}
            onClick={reserveItem}
          >
            {actionLoading ? 'Rezerwuję...' : 'Rezerwuję na 30 min'}
          </button>
        )}

        {isReserved && !isMine && (
          <div className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
            Ten przedmiot jest chwilowo zarezerwowany.
          </div>
        )}

        {isReserved && isMine && (
          <>
            <button
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-50"
              disabled={actionLoading}
              onClick={markAsTaken}
            >
              Odebrane
            </button>

            <button
              className="rounded-xl bg-gray-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-600 active:scale-95 disabled:opacity-50"
              disabled={actionLoading}
              onClick={cancelReservation}
            >
              Anuluj rezerwację
            </button>
          </>
        )}
		{isOwner && (
		  <button
			className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-95 disabled:opacity-50"
			disabled={actionLoading}
			onClick={removeItem}
		  >
			Usuń ogłoszenie
		  </button>
)}
      </div>
    </div>
  )
}

export default function ItemsMap() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadItemId, setUploadItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false)
  const [viewMode, setViewMode] = useState<'all' | 'reservedByMe' | 'myItems'>('all')
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [userLocation, setUserLocation] =
	  useState<[number, number]>(fallbackCenter)
  const [centerTrigger, setCenterTrigger] = useState(0)
  const [selectedLocation, setSelectedLocation] =
	  useState<[number, number]>(fallbackCenter)
  const [showAddForm, setShowAddForm] = useState(false)
  const [contextMenuLocation, setContextMenuLocation] =
	useState<[number, number] | null>(null)
  const [sheetState, setSheetState] =
    useState<'collapsed' | 'half' | 'full'>('half')
  
  const markerRefs = useRef<Record<string, L.Marker | null>>({})

	const visibleItems = items.filter((item) => {
	  if (onlyWithPhotos && (item.image_urls?.length ?? 0) === 0) {
		return false
	  }

	  if (viewMode === 'reservedByMe') {
		return item.status === 'reserved' && item.reserved_by === deviceId
	  }
		if (viewMode === 'myItems') {
		  return item.created_by_device_id === deviceId
		}
	  return true
	})

  async function loadItems() {
    setLoading(true)

    const { data, error } = await supabase.rpc('get_items_nearby', {
		user_lat: userLocation[0],
		user_lng: userLocation[1],
      radius_m: 300000,
    })

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    setItems(data ?? [])
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
	  loadItems()
	}, [userLocation])

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
      .channel('items-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
        },
        async () => {
          await loadItems()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'item_photos',
        },
        async () => {
          await loadItems()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    let id = localStorage.getItem('device_id')

    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('device_id', id)
    }

    setDeviceId(id)
  }, [])

useEffect(() => {
  if (!selectedItem) return

  setTimeout(() => {
    const marker = markerRefs.current[selectedItem.id]

    if (marker) {
      marker.openPopup()
    }
  }, 700)
}, [selectedItem])

  return (
    <div className="flex h-screen w-full">
      <div className="hidden w-80 overflow-y-auto border-r bg-white lg:block">
        <div className="border-b p-3 font-bold">
          {loading ? 'Ładowanie...' : `Znaleziono: ${visibleItems.length}`}
        </div>

        <label className="flex items-center gap-2 border-b p-3 text-sm">
          <input
            type="checkbox"
            checked={onlyWithPhotos}
            onChange={(e) => setOnlyWithPhotos(e.target.checked)}
          />
          Tylko ze zdjęciem
        </label>

		<div className="flex gap-2 border-b p-3 text-sm">
		  <button
			onClick={() => setViewMode('all')}
			className={`rounded-full px-3 py-1 font-semibold ${
			  viewMode === 'all'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'
			}`}
		  >
			Wszystkie
		  </button>

		  <button
			onClick={() => setViewMode('reservedByMe')}
			className={`rounded-full px-3 py-1 font-semibold ${
			  viewMode === 'reservedByMe'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'
			}`}
		  >
			Moje rezerwacje
		  </button>
			<button
			  onClick={() => setViewMode('myItems')}
			  className={`rounded-full px-3 py-1 font-semibold ${
				viewMode === 'myItems'
				  ? 'bg-black text-white'
				  : 'bg-gray-100 text-gray-700'
			  }`}
			>
			  Moje ogłoszenia
			</button>
		</div>

        {visibleItems.map((item) => {
          const img = item.image_urls?.[0]
          const reservationExpired =
            item.status === 'reserved' &&
            isReservationExpired(item.reserved_until)

          const effectiveStatus = reservationExpired ? 'active' : item.status

          return (
            <div
              key={item.id}
              className={`cursor-pointer border-b p-2 hover:bg-gray-100 ${
                selectedItem?.id === item.id ? 'bg-blue-50' : ''
              }`}
              onClick={() => {
                setSelectedItem(item)
                setSelectedLocation([item.latitude, item.longitude])
              }}
            >
              {img ? (
                <img
                  src={img}
                  alt={item.title}
                  className="mb-2 h-24 w-full rounded object-cover"
                />
              ) : (
                <div className="mb-2 flex h-24 w-full items-center justify-center rounded bg-gray-200 text-xs">
                  Brak zdjęcia
                </div>
              )}

              <div className="mb-1 text-sm font-semibold">{item.title}</div>

              <div className="mb-1">
                <ReservationBadge
                  status={effectiveStatus}
                  reservedUntil={item.reserved_until}
                />
              </div>

              <div className="text-xs text-gray-500">
                {Math.round(item.distance_m)} m
              </div>
            </div>
          )
        })}
      </div>

      <div className="relative flex-1">
		<button
		  onClick={centerOnUserLocation}
		  className="absolute bottom-24 right-4 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-xl transition hover:scale-105 active:scale-95"
		>
		  📍
		</button>
        <MapContainer
          center={userLocation}
          zoom={14}
          className="h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapFocusController selectedItem={selectedItem} />
			<MapCenterController
			  center={userLocation}
			  trigger={centerTrigger}
			/>
		<MapClickHandler
		  onSelect={(lat, lng) => setSelectedLocation([lat, lng])}
		  onOpenContextMenu={(lat, lng) => {
			setContextMenuLocation([lat, lng])
		  }}
		  onCloseAddForm={() => setShowAddForm(false)}
		/>
          <Marker position={selectedLocation} icon={markerIcon}>
            <Popup>Nowe zgłoszenie tutaj</Popup>
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
			  <div className="text-sm font-semibold">
				Co chcesz zrobić?
			  </div>

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
				Dodaj przedmiot tutaj
			  </button>
			</div>
		  </Popup>
		)}
          <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
            {visibleItems.map((item) => {
              const reservationExpired =
                item.status === 'reserved' &&
                isReservationExpired(item.reserved_until)

              const effectiveStatus = reservationExpired
                ? 'active'
                : item.status

              return (
                <Marker
				  key={`${item.id}-${item.image_urls?.length ?? 0}-${item.status}`}
				  position={[item.latitude, item.longitude]}
				  icon={createItemIcon(
					item.image_urls?.[0] ?? null,
					effectiveStatus
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
					<ItemPopup
					  item={item}
					  deviceId={deviceId}
					  onAddPhoto={(itemId) => setUploadItemId(itemId)}
					  onEdit={(item) => setEditingItem(item)}
					  onRefresh={loadItems}
					/>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>
		<div className={`
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
		`}>
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
			  {visibleItems.length} ogłoszeń w pobliżu
			</div>

		<div className="mb-3 flex flex-wrap gap-2">
		  <button
			onClick={() => setViewMode('all')}
			className={`rounded-full px-3 py-1 text-xs font-semibold ${
			  viewMode === 'all'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'
			}`}
		  >
			Wszystkie
		  </button>

		  <button
			onClick={() => setViewMode('reservedByMe')}
			className={`rounded-full px-3 py-1 text-xs font-semibold ${
			  viewMode === 'reservedByMe'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'
			}`}
		  >
			Rezerwacje
		  </button>

		  <button
			onClick={() => setViewMode('myItems')}
			className={`rounded-full px-3 py-1 text-xs font-semibold ${
			  viewMode === 'myItems'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'
			}`}
		  >
			Moje
		  </button>

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
		</div>

			<div className="flex flex-col gap-2">
			  {visibleItems.map((item) => {
				const img = item.image_urls?.[0]

				return (
				  <div
					key={item.id}
					className="flex cursor-pointer gap-3 rounded-xl border p-2 active:bg-gray-100"
					onClick={() => {
					  setSelectedItem(item)
					  setSelectedLocation([item.latitude, item.longitude])
					  setShowAddForm(false)
					  setSheetState('collapsed')
					}}
				  >
					{img ? (
					  <img
						src={img}
						alt={item.title}
						className="h-16 w-16 rounded-lg object-cover"
					  />
					) : (
					  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200 text-xs">
						brak
					  </div>
					)}

					<div className="min-w-0 flex-1">
					  <div className="truncate text-sm font-semibold">
						{item.title}
					  </div>

					  <div className="mt-1">
						<ReservationBadge
						  status={item.status}
						  reservedUntil={item.reserved_until}
						/>
					  </div>

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
		  <AddItemForm
			onAdded={async () => {
			  await loadItems()
			  toast.success('Dodano przedmiot')
			  setShowAddForm(false)
			}}
		    onClose={() => setShowAddForm(false)}
			latitude={selectedLocation[0]}
			longitude={selectedLocation[1]}
		  />
		)}
      </div>
		{uploadItemId && (
		  <AddPhotoModal
			itemId={uploadItemId}
			onClose={() => setUploadItemId(null)}
			onUploaded={async () => {
			  await loadItems()
			  toast.success('Dodano zdjęcie')
			}}
		  />
		)}

		{editingItem && (
		  <EditItemModal
			item={editingItem}
			onClose={() => setEditingItem(null)}
			onSaved={loadItems}
		  />
		)}
    </div>
  )
}