import { render, screen, within } from '@testing-library/react'

import { SAMPLE_LOG } from '@/test/fixtures'

import { EMPTY_LOG_DETAILS } from './logDetails'
import { LogSheet } from './LogSheet'

function renderSheet(details = EMPTY_LOG_DETAILS) {
  render(<LogSheet log={SAMPLE_LOG} details={details} title="Day 1" />)
  return screen.getByRole('img', { name: 'Day 1' })
}

test('fills in the header from the log', () => {
  const sheet = renderSheet()

  expect(within(sheet).getAllByText('Griggsville, IL')).toHaveLength(2) // "To" and the remark
  expect(within(sheet).getAllByText('458')).toHaveLength(2)
  expect(within(sheet).getByText('2026')).toBeInTheDocument()
})

test('totals column matches the drawn quarter hours and sums to 24', () => {
  const sheet = renderSheet()
  const total = (status: string) => sheet.querySelector(`[data-total="${status}"]`)?.textContent

  // Driving 510-791 and 851-1230 snap to 510-795 and 855-1230: 4.75 + 6.25 = 11 hours.
  expect(total('off_duty')).toBe('8')
  expect(total('sleeper')).toBe('3.5')
  expect(total('driving')).toBe('11')
  expect(total('on_duty')).toBe('1.5')
  expect(total('all')).toBe('=24')
})

test('writes each place once in the remarks, with what happened there', () => {
  const sheet = renderSheet()

  expect(within(sheet).getAllByText('Indianapolis, IN')).toHaveLength(1)
  expect(within(sheet).getAllByText('Chicago, IL')).toHaveLength(2) // "From" and one remark
  expect(within(sheet).getByText('Pickup')).toBeInTheDocument()
  expect(within(sheet).getByText('Driving to dropoff')).toBeInTheDocument()
})

test('shows driver details when given, placeholders otherwise', () => {
  const blank = renderSheet()
  expect(within(blank).getByText('Carrier name')).toBeInTheDocument()
})

test('uses the carrier details the driver entered', () => {
  const sheet = renderSheet({ ...EMPTY_LOG_DETAILS, carrierName: "John Doe's Transportation" })

  expect(within(sheet).getByText("John Doe's Transportation")).toBeInTheDocument()
  expect(within(sheet).queryByText('Carrier name')).not.toBeInTheDocument()
})
