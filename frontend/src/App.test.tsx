import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from './App'

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

function mockFetchResponse(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows the empty state before a trip is planned', () => {
  renderApp()
  expect(screen.getByRole('heading', { name: 'No trip planned yet' })).toBeInTheDocument()
})

test('flags missing locations without calling the API', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  renderApp()

  await userEvent.click(screen.getByRole('button', { name: 'Plan trip' }))

  expect(await screen.findAllByText('Enter a city or address.')).toHaveLength(3)
  expect(screen.getByLabelText(/Current location/)).toHaveAttribute('aria-invalid', 'true')
  expect(fetchSpy).not.toHaveBeenCalled()
})

test('rejects a cycle above 70 hours', async () => {
  renderApp()
  const cycleInput = screen.getByRole('spinbutton', { name: 'Cycle hours already used' })

  await userEvent.clear(cycleInput)
  await userEvent.type(cycleInput, '71')
  await userEvent.click(screen.getByRole('button', { name: 'Plan trip' }))

  expect(await screen.findByText('Cannot be more than 70 hours.')).toBeInTheDocument()
})

test('the example trip fills the form and sends a snake_case request', async () => {
  const fetchSpy = mockFetchResponse(404, {})
  renderApp()

  await userEvent.click(screen.getByRole('button', { name: 'Try an example trip' }))

  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
  const [url, init] = fetchSpy.mock.calls[0] ?? []
  expect(url).toBe('/api/trips/plan/')
  expect(JSON.parse(String(init?.body))).toMatchObject({
    current_location: 'Chicago, IL',
    pickup_location: 'Indianapolis, IN',
    dropoff_location: 'Denver, CO',
    current_cycle_used_hours: 20,
  })
  expect(screen.getByLabelText(/Pickup/)).toHaveValue('Indianapolis, IN')
})

test('shows server errors in the results panel and on the matching field', async () => {
  mockFetchResponse(400, {
    error: {
      message: 'We could not find one of the locations.',
      fields: { pickup_location: ['No match for "Nowhereville".'] },
    },
  })
  renderApp()

  await userEvent.click(screen.getByRole('button', { name: 'Try an example trip' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We could not find one of the locations.',
  )
  expect(screen.getByText('No match for "Nowhereville".')).toBeInTheDocument()
})

function mockGeolocation(
  result: { coords: { latitude: number; longitude: number } } | { code: number },
) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (resolve: PositionCallback, reject: PositionErrorCallback) =>
        'coords' in result
          ? resolve(result as GeolocationPosition)
          : reject(result as GeolocationPositionError),
    },
  })
}

test('"Use my location" fills in the named place', async () => {
  mockGeolocation({ coords: { latitude: 41.88, longitude: -87.63 } })
  mockFetchResponse(200, { label: 'Chicago, IL', lat: 41.88, lon: -87.63 })
  renderApp()

  await userEvent.click(screen.getByRole('button', { name: 'Use my location' }))

  expect(await screen.findByDisplayValue('Chicago, IL')).toBeInTheDocument()
})

test('"Use my location" explains a blocked permission', async () => {
  mockGeolocation({ code: 1 })
  renderApp()

  await userEvent.click(screen.getByRole('button', { name: 'Use my location' }))

  expect(await screen.findByText(/Location access is blocked/)).toBeInTheDocument()
})
