import type { DailyLog } from '@/api/trips'

/** Driving time between two moments, taken from the logged segments rather than the clock. */
export function drivingMinutesBetween(logs: DailyLog[], fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  let minutes = 0
  for (const log of logs) {
    for (const segment of log.segments) {
      if (segment.status !== 'driving') continue
      const start = Math.max(Date.parse(segment.start), from)
      const end = Math.min(Date.parse(segment.end), to)
      if (end > start) minutes += (end - start) / 60000
    }
  }
  return Math.round(minutes)
}
