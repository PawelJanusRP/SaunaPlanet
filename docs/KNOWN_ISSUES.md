# Known Issues

This document describes known issues, technical limitations and important implementation notes.

These items should be reviewed before modifying existing functionality.

---

# Critical Rule

Do not redesign or replace working functionality unless explicitly requested.

Many systems were implemented incrementally and have already been debugged.

---

# SECURITY BACKLOG (high priority)

## event_registrations UPDATE policy lacks an explicit WITH CHECK

Status: Open — found in the 2026-07-18 SP-036 production audit; deliberately
NOT changed inside SP-036 (requires a dedicated policy analysis first).

The live policy "manager or admin can update registration" (UPDATE on
`event_registrations`) defines only USING, no WITH CHECK. PostgreSQL then
reuses the USING expression to validate the NEW row, so the gap is
narrower than it looks — but the implicit behavior has not been analyzed
against column-level mutations (e.g. whether a permitted updater could
reassign `event_id`/`user_id` to rows they also pass USING for), and there
is no trigger guarding column immutability on this table.

Required follow-up (separate migration, after analysis):

* add an explicit WITH CHECK mirroring the intended rule,
* decide which columns a manager may legally change (status only?) and
  guard the rest,
* verify the reservation UI flows (confirm/cancel) against the tightened
  policy before applying.

---

# Sauna Master Satellite System

Status: Working

Description:

Sauna master avatar satellites are displayed around sauna markers in an orbital layout.

Requirements:

* approved assignment
* future active event
* avatar_url set on sauna_masters record

Current behavior:

* all masters with avatar_url are shown (no limit)
* satellites orbit the main marker in a 300° arc (from SSW to SSE through top)
* bottom area reserved for rating badge
* satellite ring color depends on master level

Levels:

* master = gold
* senior = purple
* certified = blue
* guest = gray

Important:

This functionality was recently refactored. Do not redesign or replace without explicit request.

---

# Event Visibility

Status: Fixed

Fix applied:

* sauna detail page (`app/sauna/[id]/page.tsx`) now filters events with `event_date >= today`
* only current and future events are displayed
* sorted ascending by event_date

Note:

RPC `get_sauna_events` (used in map popup) may still return past events.
That RPC should be updated separately in Supabase Dashboard.

---

# Authentication

Status: Not Implemented

Current application operates without a full authentication layer.

Planned:

* Supabase Auth
* user accounts
* role management

Important:

Future implementations should not require major database redesign.

---

# Authorization

Status: MVP

Current state includes temporary development policies.

Important:

Current policies are not suitable for public production deployment.

Before launch:

* implement proper RLS
* implement ownership validation
* implement role-based permissions

---

# Supabase RLS

Status: Temporary

Known technical debt:

Development-friendly policies were used during MVP development.

These policies must be reviewed before public release.

---

# PTS Import

Status: Operational

Description:

Sauna facilities imported from PTS sources.

Known historical issues:

* missing coordinates
* duplicate detection
* import logging
* RLS restrictions during import

Related table:

pts_import_log

Important:

Preserve import compatibility when modifying sauna-related schema.

---

# Reviews

Status: Working

Implemented:

* reviews
* average ratings
* rankings

Future work:

* moderation
* abuse prevention
* verification

---

# Event System

Status: Working

Implemented:

* add event
* event listing
* event calendar
* upcoming event views

Future improvements should preserve existing workflows.

---

# Map Performance

Status: Acceptable

Current features:

* clustering
* event markers
* satellite markers
* filters

Important:

Map performance is critical.

Avoid solutions that require excessive client-side rendering.

---

# Database Compatibility

Important Rule

Avoid unnecessary schema redesigns.

Preferred approach:

* additive migrations
* backward compatibility
* incremental evolution

Avoid:

* dropping tables
* renaming major entities
* destructive migrations

unless explicitly requested.

---

# Mobile Experience

Status: Requires Future Review

Current focus has been desktop functionality.

Future work:

* responsive improvements
* mobile UX
* touch interactions

---

# Future Risks

Potential complexity areas:

* bookings
* payments
* subscriptions
* verification workflows
* role-based permissions

When implementing these features:

* prefer simple solutions
* avoid premature optimization
* preserve maintainability

---

# Architecture Principle

SaunaPlanet is evolving toward an ecosystem:

Facilities
→ Events
→ Sauna Masters
→ Certifications
→ Reviews
→ Rankings

Changes that strengthen this ecosystem are generally preferred.

Changes that move the platform toward a simple sauna directory should be avoided.

---

# Legacy Item Code in Sauna Forms

Status: Fixed

Both components have been rewritten to use correct SaunaPlanet database objects.

---

## components/AddSaunaForm.tsx

Fixed:

* inserts into `saunas` table
* inserts into `sauna_photos` table
* uploads to `sauna-images` bucket
* legacy fields removed

---

## components/EditSaunaModal.tsx

Fixed:

* uses correct sauna update logic
* UI messages updated to sauna terminology

---

# Leaflet Map — Marker Icons Disappearing After Load

Status: Fixed (commit after SP-018)

## Symptom

After page load or client-side navigation back to the map, marker icons appeared briefly then disappeared. Clicking anywhere on the map brought them back.

## Root Cause

Two separate issues compounded each other:

**1. Stale map container dimensions after Next.js client-side navigation**

When navigating back to the map route, the Leaflet container had stale cached dimensions (0×0 from the previous unmount). Leaflet positioned all marker layers based on those wrong dimensions. `map.invalidateSize()` recalculates the container size and fixes tile/marker positioning.

**2. Double data load from auto-geolocation**

`useEffect([userLocation, radiusKm])` triggers `loadSaunas()`. On mount, the effect fires once with the fallback center (Poznan). Then the browser Geolocation API resolves and calls `setUserLocation(gpsCoords)`, triggering a second `loadSaunas()`.

The second `setItems(newData)` caused `MarkerClusterGroup` to rebuild its internal layer tree. The Leaflet.markercluster plugin computes new cluster positions but does not repaint DOM automatically — it waits for a map event (`moveend`, `zoomend`, `viewreset`) to trigger `_onMoveEnd`. In our case no such event was fired, leaving the cluster in a computed-but-not-rendered state: markers invisible until any user interaction (click) triggered a repaint.

## What Did NOT Work

* Adding a 800ms `setTimeout` to `invalidateSize` — fired mid-cluster-render, scrambling marker positions.
* Removing `chunkedLoading` from `MarkerClusterGroup` — made rendering synchronous but did not fix the visibility issue.
* Replacing `invalidateSize` with double `requestAnimationFrame` — timing still wrong.
* `map.fire('moveend')` in a `ClusterRefresher` component — the event was processed before react-leaflet finished reconciling the new marker children; cluster refreshed against incomplete state.

## Fix Applied

**`MapResizeGuard` (in `components/SaunaMap.tsx`)**

Restored to the original simple form from commit `85d4f34`:

```tsx
function MapResizeGuard() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map])
  return null
}
```

Synchronous `invalidateSize()` on mount ensures correct container dimensions for tile and marker positioning after navigation.

**`MarkerClusterGroup` remount via `key` prop**

```tsx
const [clusterRefreshKey, setClusterRefreshKey] = useState(0)

// in loadSaunas(), after setItems(data):
setClusterRefreshKey((k) => k + 1)

// in JSX:
<MarkerClusterGroup key={clusterRefreshKey} chunkedLoading maxClusterRadius={60}>
```

When `clusterRefreshKey` increments, React fully unmounts and remounts `MarkerClusterGroup`, creating a fresh Leaflet.markercluster instance initialized with the current `visibleItems`. The fresh cluster correctly positions and renders all markers without needing any event to trigger a repaint.

`chunkedLoading` is kept to avoid blocking the main thread when adding many markers.

## Important Rules for Future Modifications

* Do NOT add delays (`setTimeout`, `requestAnimationFrame`) to `invalidateSize` — timing relative to marker rendering is fragile.
* Do NOT remove `chunkedLoading` without a specific reason.
* Do NOT replace `key={clusterRefreshKey}` with event-based refresh (`map.fire(...)`) — the cluster's `_onMoveEnd` guard (`_inZoomAnimation` check) can silently skip the repaint.
* The `clusterRefreshKey` must be incremented AFTER `setItems` so both state updates batch into a single React render.

---

# Leaflet Map — Blank Tiles After Back-Navigation

Status: Fixed (commit `85d4f34`)

## Symptom

Navigating away from the map page (e.g., to a sauna or event detail page) and pressing Back caused the map to render as a blank grey area with no tiles.

## Root Cause

Next.js App Router performs client-side route transitions without full page reload. When the map component remounts, the Leaflet container `div` initially reports 0×0 dimensions (CSS has not been applied yet from the previous mount's perspective). Leaflet caches these wrong dimensions and never requests tile images for the correct viewport.

## Fix

`MapResizeGuard` component calls `map.invalidateSize()` on mount (synchronously in `useEffect`). Leaflet recalculates the container dimensions, fires `moveend`, and requests tiles for the correct viewport.

The component must live **inside** `MapContainer` (uses `useMap()` hook):

```tsx
<MapContainer ...>
  <MapResizeGuard />
  ...
</MapContainer>
```
