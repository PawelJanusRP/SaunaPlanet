// Shared row types for Supabase RPC results and joins (SP-035D).
//
// Hand-written against the live RPC payloads; retires the "no shared entity
// types" debt (REPOSITORY_AUDIT §8.7) for the hot paths. Once a migrations
// directory exists, replace with generated types (`supabase gen types`).

/** Row returned by the `get_saunas_nearby` RPC. */
export type SaunaNearbyRow = {
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
  avg_rating: number | null
  review_count: number
  masters?: {
    id: string
    name: string
    avatar_url: string | null
    level: string | null
  }[]
}

/** Row returned by the `get_upcoming_events` RPC. */
export type UpcomingEventRow = {
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

/** Row returned by the `get_upcoming_event_saunas` RPC. */
export type UpcomingEventSaunaRow = {
  sauna_id: string
}

/** `sauna_event_masters` row joined with its event (see /masters/[id]). */
export type EventMasterRow = {
  role: string | null
  status: string
  sauna_events: {
    id: string
    title: string
    event_date: string
    event_time: string | null
    sauna_id: string
  } | null
}
