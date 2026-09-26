import { getJson, postJson } from './client'

export type DutyStatus = 'off_duty' | 'sleeper' | 'driving' | 'on_duty'
export type StopType = 'start' | 'pickup' | 'dropoff' | 'fuel' | 'break' | 'rest' | 'restart'

export interface TripPlanRequest {
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used_hours: number
  /** Wall-clock time at the current location, "YYYY-MM-DDTHH:mm". */
  start_time: string
}

export interface PlacePoint {
  label: string
  lat: number
  lon: number
}

export interface TripStop {
  type: StopType
  label: string
  note: string
  location: string
  lat: number
  lon: number
  /** ISO 8601 with the home terminal's UTC offset. */
  arrival: string
  departure: string
  duration_minutes: number
  mile: number
}

export interface LogSegment {
  status: DutyStatus
  start: string
  end: string
  /** Minutes since midnight on the log's date, 0 to 1440. */
  start_minute: number
  end_minute: number
  location: string
  note: string
}

export interface LogRemark {
  time: string
  minute: number
  location: string
  note: string
  status: DutyStatus
}

export interface DailyLog {
  date: string
  from_location: string
  to_location: string
  total_miles: number
  totals_minutes: Record<DutyStatus, number>
  segments: LogSegment[]
  remarks: LogRemark[]
  on_duty_minutes: number
  cycle_used_minutes: number
  cycle_available_minutes: number
}

export interface TripSummary {
  total_distance_miles: number
  total_drive_minutes: number
  total_trip_minutes: number
  start: string
  end: string
  timezone: string
  timezone_abbreviation: string
  cycle_used_minutes_at_start: number
  cycle_used_minutes_at_end: number
  day_count: number
}

export interface TripPlanResponse {
  summary: TripSummary
  locations: { current: PlacePoint; pickup: PlacePoint; dropoff: PlacePoint }
  route: { type: 'LineString'; coordinates: [number, number][] }
  stops: TripStop[]
  daily_logs: DailyLog[]
}

export function planTrip(request: TripPlanRequest): Promise<TripPlanResponse> {
  return postJson<TripPlanResponse>('/api/trips/plan/', request)
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlacePoint[]> {
  const params = new URLSearchParams({ q: query })
  const body = await getJson<{ results: PlacePoint[] }>(`/api/geocode/search/?${params}`, signal)
  return body.results
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  const body = await getJson<{ label: string | null }>(`/api/geocode/reverse/?${params}`)
  return body.label
}
