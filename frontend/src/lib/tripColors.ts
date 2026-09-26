import type { DutyStatus, StopType } from '@/api/trips'

/**
 * One palette for the map markers, the timeline and the log sheets, so a color always means the
 * same thing. Stops that are a duty status (fuel is on duty, rests are in the sleeper) share that
 * status's color.
 */
export const DUTY_STATUS_STYLES: Record<DutyStatus, { label: string; color: string }> = {
  off_duty: { label: 'Off duty', color: '#64748b' },
  sleeper: { label: 'Sleeper berth', color: '#4f46e5' },
  driving: { label: 'Driving', color: '#2563eb' },
  on_duty: { label: 'On duty (not driving)', color: '#d97706' },
}

export const STOP_STYLES: Record<StopType, { label: string; color: string; glyph: string }> = {
  start: { label: 'Start', color: '#0f172a', glyph: 'S' },
  pickup: { label: 'Pickup', color: '#059669', glyph: 'P' },
  dropoff: { label: 'Dropoff', color: '#dc2626', glyph: 'D' },
  fuel: { label: 'Fuel', color: DUTY_STATUS_STYLES.on_duty.color, glyph: 'F' },
  break: { label: '30-min break', color: '#0891b2', glyph: 'B' },
  rest: { label: '10-hour rest', color: DUTY_STATUS_STYLES.sleeper.color, glyph: 'R' },
  restart: { label: '34-hour restart', color: '#7c3aed', glyph: '34' },
}
