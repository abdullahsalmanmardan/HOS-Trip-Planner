import type { DutyStatus, LogRemark, LogSegment } from '@/api/trips'

export const SHEET_WIDTH = 1000
export const GRID_LEFT = 150
export const GRID_RIGHT = 894
export const GRID_TOP = 262
export const ROW_HEIGHT = 30
export const STATUS_ROWS: DutyStatus[] = ['off_duty', 'sleeper', 'driving', 'on_duty']
export const GRID_BOTTOM = GRID_TOP + STATUS_ROWS.length * ROW_HEIGHT
export const MINUTES_PER_DAY = 24 * 60
const QUARTER_HOUR = 15

export function minuteToX(minute: number): number {
  return GRID_LEFT + (minute / MINUTES_PER_DAY) * (GRID_RIGHT - GRID_LEFT)
}

export function rowTop(status: DutyStatus): number {
  return GRID_TOP + STATUS_ROWS.indexOf(status) * ROW_HEIGHT
}

export function rowCenter(status: DutyStatus): number {
  return rowTop(status) + ROW_HEIGHT / 2
}

export function snapToQuarterHour(minute: number): number {
  const snapped = Math.round(minute / QUARTER_HOUR) * QUARTER_HOUR
  return Math.min(MINUTES_PER_DAY, Math.max(0, snapped))
}

export interface DrawnSegment {
  status: DutyStatus
  startMinute: number
  endMinute: number
}

/**
 * Snaps segments to the grid's 15-minute marks for drawing. Segments that snap to nothing are
 * dropped and neighbours with the same status merge, so the line never shows a zero-width blip.
 * Totals are always taken from the unsnapped data.
 */
export function snapSegments(segments: LogSegment[]): DrawnSegment[] {
  const drawn: DrawnSegment[] = []
  for (const segment of segments) {
    const startMinute = snapToQuarterHour(segment.start_minute)
    const endMinute = snapToQuarterHour(segment.end_minute)
    if (endMinute <= startMinute) continue

    // Contiguous input stays contiguous: a dropped sliver snaps both of its ends to the same mark.
    const previous = drawn.at(-1)
    if (previous && previous.status === segment.status) {
      previous.endMinute = endMinute
    } else {
      drawn.push({ status: segment.status, startMinute, endMinute })
    }
  }
  return drawn
}

/** One continuous path: horizontal runs on each status row joined by vertical connectors. */
export function dutyLinePath(segments: DrawnSegment[]): string {
  return segments
    .map((segment, index) => {
      const y = rowCenter(segment.status)
      const move = index === 0 ? `M ${minuteToX(segment.startMinute)} ${y}` : `V ${y}`
      return `${move} H ${minuteToX(segment.endMinute)}`
    })
    .join(' ')
}

export type TickKind = 'hour' | 'half' | 'quarter'

function tickKind(minute: number): TickKind {
  if (minute % 60 === 0) return 'hour'
  if (minute % 30 === 0) return 'half'
  return 'quarter'
}

export function gridTicks(): { minute: number; kind: TickKind }[] {
  const ticks: { minute: number; kind: TickKind }[] = []
  for (let minute = 0; minute <= MINUTES_PER_DAY; minute += QUARTER_HOUR) {
    ticks.push({ minute, kind: tickKind(minute) })
  }
  return ticks
}

export function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return 'Mid-night'
  if (hour === 12) return 'Noon'
  return String(hour % 12)
}

/**
 * Remark labels hang at an angle below the grid. Changes close together in time would overlap,
 * so each label anchor is pushed right until it clears the previous label, whose footprint
 * depends on how many lines it has.
 */
export function layoutRemarkAnchors(xs: number[], spaceAfter: number[]): number[] {
  const anchors: number[] = []
  xs.forEach((x, index) => {
    const previous = anchors.at(-1)
    const needed = spaceAfter[index - 1] ?? 0
    anchors.push(previous === undefined ? x : Math.max(x, previous + needed))
  })
  return anchors
}

/**
 * Hours per status as drawn. The sheet shows these rather than the exact minutes so the totals
 * column always agrees with the line above it and still sums to 24.
 */
export function drawnTotals(segments: DrawnSegment[]): Record<DutyStatus, number> {
  const totals: Record<DutyStatus, number> = { off_duty: 0, sleeper: 0, driving: 0, on_duty: 0 }
  for (const segment of segments) totals[segment.status] += segment.endMinute - segment.startMinute
  return totals
}

export interface RemarkGroup {
  location: string
  notes: string[]
  minutes: number[]
}

/** Consecutive changes at one place share a label, the way the guide writes a place once. */
export function groupRemarks(remarks: LogRemark[]): RemarkGroup[] {
  const groups: RemarkGroup[] = []
  for (const remark of remarks) {
    const previous = groups.at(-1)
    if (previous && previous.location === remark.location) {
      previous.notes.push(remark.note)
      previous.minutes.push(remark.minute)
    } else {
      groups.push({ location: remark.location, notes: [remark.note], minutes: [remark.minute] })
    }
  }
  return groups
}
