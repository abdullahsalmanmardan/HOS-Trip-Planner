export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.round(totalMinutes % 60)
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

export function formatHours(totalMinutes: number): string {
  return String(Math.round((totalMinutes / 60) * 100) / 100)
}

export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString('en-US')} mi`
}

/**
 * The API sends times with the home terminal's offset (e.g. "2026-09-26T08:00-05:00"). Drivers
 * log on the terminal's clock, so we show that wall-clock time as-is, whatever the viewer's
 * own timezone is.
 */
function wallClock(iso: string): Date {
  const [datePart = '', timePart = '00:00'] = iso.slice(0, 16).split('T')
  const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number)
  const [hour = 0, minute = 0] = timePart.split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hour, minute))
}

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})
const dayTimeFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})
const longDateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatTime(iso: string): string {
  return timeFormat.format(wallClock(iso))
}

export function formatDayTime(iso: string): string {
  return dayTimeFormat.format(wallClock(iso))
}

export function formatLongDate(isoDate: string): string {
  return longDateFormat.format(wallClock(`${isoDate}T00:00`))
}

export function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}
