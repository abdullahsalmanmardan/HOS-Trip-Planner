import type { LogRemark, LogSegment } from '@/api/trips'

import {
  GRID_LEFT,
  GRID_RIGHT,
  drawnTotals,
  dutyLinePath,
  gridTicks,
  groupRemarks,
  hourLabel,
  layoutRemarkAnchors,
  minuteToX,
  rowCenter,
  snapSegments,
  snapToQuarterHour,
} from './logGeometry'

function segment(status: LogSegment['status'], start: number, end: number): LogSegment {
  return {
    status,
    start_minute: start,
    end_minute: end,
    start: '',
    end: '',
    location: '',
    note: '',
  }
}

test('minuteToX spans the grid from midnight to midnight', () => {
  expect(minuteToX(0)).toBe(GRID_LEFT)
  expect(minuteToX(1440)).toBe(GRID_RIGHT)
  expect(minuteToX(720)).toBe((GRID_LEFT + GRID_RIGHT) / 2)
})

test('snapToQuarterHour rounds to the nearest 15 minutes within the day', () => {
  expect(snapToQuarterHour(0)).toBe(0)
  expect(snapToQuarterHour(7)).toBe(0)
  expect(snapToQuarterHour(8)).toBe(15)
  expect(snapToQuarterHour(791)).toBe(795)
  expect(snapToQuarterHour(1439)).toBe(1440)
})

test('snapSegments merges neighbours and drops slivers without leaving gaps', () => {
  const drawn = snapSegments([
    segment('off_duty', 0, 480),
    segment('on_duty', 480, 484),
    segment('driving', 484, 791),
    segment('driving', 791, 900),
    segment('on_duty', 900, 1440),
  ])

  expect(drawn).toEqual([
    { status: 'off_duty', startMinute: 0, endMinute: 480 },
    { status: 'driving', startMinute: 480, endMinute: 900 },
    { status: 'on_duty', startMinute: 900, endMinute: 1440 },
  ])
})

test('snapped segments always cover the whole day', () => {
  const drawn = snapSegments([
    segment('off_duty', 0, 487),
    segment('on_duty', 487, 517),
    segment('driving', 517, 798),
    segment('on_duty', 798, 858),
    segment('sleeper', 858, 1440),
  ])

  expect(drawn[0]?.startMinute).toBe(0)
  expect(drawn.at(-1)?.endMinute).toBe(1440)
  drawn.slice(1).forEach((current, index) => {
    expect(current.startMinute).toBe(drawn[index]?.endMinute)
  })
})

test('dutyLinePath draws one continuous line with vertical connectors', () => {
  const path = dutyLinePath([
    { status: 'off_duty', startMinute: 0, endMinute: 360 },
    { status: 'driving', startMinute: 360, endMinute: 1440 },
  ])

  expect(path).toBe(
    `M ${GRID_LEFT} ${rowCenter('off_duty')} H ${minuteToX(360)} ` +
      `V ${rowCenter('driving')} H ${GRID_RIGHT}`,
  )
})

test('gridTicks has hour, half-hour and quarter-hour marks', () => {
  const ticks = gridTicks()

  expect(ticks).toHaveLength(97)
  expect(ticks.filter((tick) => tick.kind === 'hour')).toHaveLength(25)
  expect(ticks.find((tick) => tick.minute === 30)?.kind).toBe('half')
  expect(ticks.find((tick) => tick.minute === 45)?.kind).toBe('quarter')
})

test('hourLabel follows the paper log', () => {
  expect([0, 1, 11, 12, 13, 23, 24].map(hourLabel)).toEqual([
    'Mid-night',
    '1',
    '11',
    'Noon',
    '1',
    '11',
    'Mid-night',
  ])
})

test('layoutRemarkAnchors pushes crowded labels apart but leaves spaced ones alone', () => {
  expect(layoutRemarkAnchors([100, 110, 115, 300], [20, 20, 20, 20])).toEqual([100, 120, 140, 300])
})

test('layoutRemarkAnchors leaves more room after a taller label', () => {
  expect(layoutRemarkAnchors([100, 110, 120], [40, 20, 20])).toEqual([100, 140, 160])
})

test('drawnTotals sums the snapped segments to a full day', () => {
  const drawn = snapSegments([
    segment('off_duty', 0, 1253),
    segment('driving', 1253, 1309),
    segment('on_duty', 1309, 1440),
  ])

  expect(drawnTotals(drawn)).toEqual({ off_duty: 1260, sleeper: 0, driving: 45, on_duty: 135 })
})

test('groupRemarks merges consecutive changes at the same place', () => {
  const remark = (minute: number, location: string, note: string): LogRemark => ({
    minute,
    location,
    note,
    time: '',
    status: 'on_duty',
  })

  expect(
    groupRemarks([
      remark(480, 'Chicago, IL', 'Pre-trip inspection'),
      remark(510, 'Chicago, IL', 'Driving to pickup'),
      remark(790, 'Indianapolis, IN', 'Pickup'),
      remark(1000, 'Chicago, IL', 'Off duty'),
    ]),
  ).toEqual([
    {
      location: 'Chicago, IL',
      notes: ['Pre-trip inspection', 'Driving to pickup'],
      minutes: [480, 510],
    },
    { location: 'Indianapolis, IN', notes: ['Pickup'], minutes: [790] },
    { location: 'Chicago, IL', notes: ['Off duty'], minutes: [1000] },
  ])
})
