import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { LocationInput } from './LocationInput'

function Harness({ onSelect }: { onSelect: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <>
      <label htmlFor="pickup">Pickup</label>
      <LocationInput
        id="pickup"
        value={value}
        onChange={(next) => {
          setValue(next)
          onSelect(next)
        }}
        onBlur={() => undefined}
        placeholder=""
        invalid={false}
      />
    </>
  )
}

function renderInput() {
  const onSelect = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return { input: screen.getByRole('combobox', { name: 'Pickup' }), onSelect }
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('suggests places after typing and picks one with the keyboard', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [
          { label: 'Kansas City, MO', lat: 39.1, lon: -94.58 },
          { label: 'Kansas City, KS', lat: 39.11, lon: -94.63 },
        ],
      }),
    ),
  )
  const { input, onSelect } = renderInput()

  await userEvent.type(input, 'Kansas')
  expect(await screen.findByRole('option', { name: 'Kansas City, MO' })).toBeInTheDocument()
  expect(input).toHaveAttribute('aria-expanded', 'true')
  expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toBe('/api/geocode/search/?q=Kansas')

  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

  expect(onSelect).toHaveBeenLastCalledWith('Kansas City, KS')
  expect(input).toHaveValue('Kansas City, KS')
  expect(input).toHaveAttribute('aria-expanded', 'false')
})

test('does not search until there are three characters', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const { input } = renderInput()

  await userEvent.type(input, 'Ka')
  await new Promise((resolve) => setTimeout(resolve, 400))

  expect(fetchSpy).not.toHaveBeenCalled()
})

test('debounces keystrokes into one request', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ results: [] }))))
  const { input } = renderInput()

  await userEvent.type(input, 'Denver')

  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
})

test('lists recent places on focus and picks one', async () => {
  localStorage.setItem('trip-planner:recent-places', JSON.stringify(['Denver, CO', 'Omaha, NE']))
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const { input, onSelect } = renderInput()

  await userEvent.click(input)

  expect(screen.getByText('Recent')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('option', { name: 'Omaha, NE' }))
  expect(onSelect).toHaveBeenLastCalledWith('Omaha, NE')
  expect(fetchSpy).not.toHaveBeenCalled()
  localStorage.clear()
})

test('says so when nothing matches', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ results: [] }))),
  )
  const { input } = renderInput()

  await userEvent.type(input, 'Qwxz')

  expect(await screen.findByText('No matching places in the US.')).toBeInTheDocument()
})
