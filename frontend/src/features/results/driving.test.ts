import type { DailyLog, LogSegment } from '@/api/trips'

import { drivingMinutesBetween } from './driving'

function segment(status: LogSegment['status'], start: string, end: string): LogSegment {
  return { status, start, end, start_minute: 0, end_minute: 0, location: '', note: '' }
}

function log(segments: LogSegment[]): DailyLog {
  return {
    date: '2026-09-26',
    from_location: '',
    to_location: '',
    total_miles: 0,
    totals_minutes: { off_duty: 0, sleeper: 0, driving: 0, on_duty: 0 },
    segments,
    remarks: [],
    on_duty_minutes: 0,
    cycle_used_minutes: 0,
    cycle_available_minutes: 0,
  }
}

test('counts only driving, not the pre-trip inspection after a rest', () => {
  const logs = [
    log([segment('sleeper', '2026-09-26T20:30-05:00', '2026-09-27T00:00-05:00')]),
    log([
      segment('sleeper', '2026-09-27T00:00-05:00', '2026-09-27T06:30-05:00'),
      segment('on_duty', '2026-09-27T06:30-05:00', '2026-09-27T07:00-05:00'),
      segment('driving', '2026-09-27T07:00-05:00', '2026-09-27T15:00-05:00'),
    ]),
  ]

  expect(drivingMinutesBetween(logs, '2026-09-27T06:30-05:00', '2026-09-27T15:00-05:00')).toBe(480)
})

test('clips driving that runs across midnight into separate logs', () => {
  const logs = [
    log([segment('driving', '2026-09-26T22:00-05:00', '2026-09-27T00:00-05:00')]),
    log([segment('driving', '2026-09-27T00:00-05:00', '2026-09-27T01:30-05:00')]),
  ]

  expect(drivingMinutesBetween(logs, '2026-09-26T21:00-05:00', '2026-09-27T02:00-05:00')).toBe(210)
})
