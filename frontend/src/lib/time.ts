const QUARTER_HOUR_MS = 15 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Formats a Date in local time as the value a datetime-local input expects. */
export function toDateTimeLocalValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

export function roundUpToQuarterHour(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS)
}

export function defaultStartTime(now: Date = new Date()): string {
  return toDateTimeLocalValue(roundUpToQuarterHour(now))
}
