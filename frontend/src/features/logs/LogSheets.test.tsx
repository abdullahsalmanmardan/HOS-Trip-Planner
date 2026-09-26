import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SAMPLE_LOG } from '@/test/fixtures'

import { LogSheets } from './LogSheets'

const LOGS = [SAMPLE_LOG, { ...SAMPLE_LOG, date: '2026-09-27', total_miles: 510 }]

test('shows one day at a time and switches with the tabs', async () => {
  render(<LogSheets logs={LOGS} />)

  const [first, second] = screen.getAllByRole('tab')
  if (!first || !second) throw new Error('expected two tabs')
  // Tests run without CSS, so check the class that hides the other day on screen.
  const panel = (index: number) => document.getElementById(`log-panel-${index}`)
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(panel(0)).not.toHaveClass('hidden')
  expect(panel(1)).toHaveClass('hidden')

  await userEvent.click(second)

  expect(second).toHaveAttribute('aria-selected', 'true')
  expect(panel(0)).toHaveClass('hidden')
  expect(panel(1)).not.toHaveClass('hidden')
  expect(screen.getByText(/510 mi driven/)).toBeInTheDocument()
})

test('arrow keys move between days', async () => {
  render(<LogSheets logs={LOGS} />)

  const [first, second] = screen.getAllByRole('tab')
  if (!first || !second) throw new Error('expected two tabs')

  await userEvent.click(first)
  await userEvent.keyboard('{ArrowRight}')

  expect(second).toHaveFocus()
  expect(second).toHaveAttribute('aria-selected', 'true')
})

test('every sheet stays in the page so printing includes all days', () => {
  const { container } = render(<LogSheets logs={LOGS} />)

  const panels = container.querySelectorAll('[role="tabpanel"]')
  expect(panels).toHaveLength(2)
  expect(within(panels[1] as HTMLElement).getByRole('img')).toBeInTheDocument()
})
