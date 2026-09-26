import { defaultStartTime, roundUpToQuarterHour } from './time'

describe('roundUpToQuarterHour', () => {
  it('rounds up to the next 15-minute mark', () => {
    const rounded = roundUpToQuarterHour(new Date(2026, 8, 25, 9, 7, 30))
    expect(rounded).toEqual(new Date(2026, 8, 25, 9, 15))
  })

  it('leaves an exact quarter hour alone', () => {
    const exact = new Date(2026, 8, 25, 9, 45)
    expect(roundUpToQuarterHour(exact)).toEqual(exact)
  })

  it('rolls over to the next day', () => {
    expect(roundUpToQuarterHour(new Date(2026, 8, 25, 23, 50))).toEqual(new Date(2026, 8, 26, 0, 0))
  })
})

test('defaultStartTime formats for a datetime-local input', () => {
  expect(defaultStartTime(new Date(2026, 0, 5, 6, 1))).toBe('2026-01-05T06:15')
})
