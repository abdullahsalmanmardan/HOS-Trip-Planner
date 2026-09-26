import { formatDayTime, formatDuration, formatHours, formatLongDate, formatTime } from './format'

test('formatDuration', () => {
  expect(formatDuration(45)).toBe('45 min')
  expect(formatDuration(600)).toBe('10 h')
  expect(formatDuration(1796)).toBe('29 h 56 min')
})

test('formatHours trims to at most two decimals', () => {
  expect(formatHours(630)).toBe('10.5')
  expect(formatHours(465)).toBe('7.75')
  expect(formatHours(1440)).toBe('24')
})

test('times are shown on the home terminal clock, not the viewer clock', () => {
  expect(formatTime('2026-09-26T20:30-05:00')).toBe('8:30 PM')
  expect(formatDayTime('2026-09-26T08:00-05:00')).toBe('Sat, Sep 26, 8:00 AM')
  expect(formatLongDate('2026-09-26')).toBe('Saturday, September 26, 2026')
})
