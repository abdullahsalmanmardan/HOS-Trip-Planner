import 'leaflet/dist/leaflet.css'

import L, { type LatLngTuple } from 'leaflet'
import { useMemo } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet'

import type { TripPlanResponse, TripStop } from '@/api/trips'
import { formatDayTime, formatDuration } from '@/lib/format'
import { STOP_STYLES } from '@/lib/tripColors'

// OpenStreetMap's own tiles need no key but are volunteer-run and meant for light use. For a
// deployment with real traffic, point VITE_MAP_TILE_URL at a keyed provider (MapTiler, Stadia,
// CARTO...). Their keys are domain-restricted and meant to live in the browser.
const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function stopIcon(stop: TripStop): L.DivIcon {
  const { color, glyph } = STOP_STYLES[stop.type]
  const size = stop.type === 'pickup' || stop.type === 'dropoff' || stop.type === 'start' ? 30 : 24
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<span style="background:${color};width:${size}px;height:${size}px;box-shadow:0 0 0 1px rgba(0,0,0,0.45)" class="grid place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white">${glyph}</span>`,
  })
}

export function RouteMap({ plan }: { plan: TripPlanResponse }) {
  const line = useMemo<LatLngTuple[]>(
    () => plan.route.coordinates.map(([lon, lat]) => [lat, lon]),
    [plan.route.coordinates],
  )
  const bounds = useMemo(() => L.latLngBounds(line).pad(0.05), [line])
  // New icon objects make Leaflet rebuild every marker's DOM, so build them once per plan.
  const icons = useMemo(() => plan.stops.map(stopIcon), [plan.stops])

  return (
    <div className="h-[380px] overflow-hidden border border-ink bg-rule sm:h-[440px]">
      <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <Polyline positions={line} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.9 }} />
        <Polyline positions={line} pathOptions={{ color: '#2563eb', weight: 4 }} />
        {plan.stops.map((stop, index) => (
          <Marker
            key={`${stop.type}-${stop.arrival}`}
            position={[stop.lat, stop.lon]}
            icon={icons[index]}
            title={`${stop.label}, ${stop.location}`}
            zIndexOffset={stop.type === 'pickup' || stop.type === 'dropoff' ? 1000 : index}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              {stop.label}
            </Tooltip>
            <Popup>
              <p className="font-semibold">{stop.label}</p>
              <p>{stop.location}</p>
              <p className="text-muted">
                {formatDayTime(stop.arrival)} &middot; {formatDuration(stop.duration_minutes)}
              </p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
