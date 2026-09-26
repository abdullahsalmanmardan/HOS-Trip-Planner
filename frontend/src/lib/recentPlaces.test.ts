import { loadRecentPlaces, rememberPlaces } from './recentPlaces'

beforeEach(() => localStorage.clear())

test('keeps the newest places first without duplicates', () => {
  rememberPlaces(['Chicago, IL', 'Denver, CO'])
  rememberPlaces(['Denver, CO', 'Omaha, NE'])

  expect(loadRecentPlaces()).toEqual(['Denver, CO', 'Omaha, NE', 'Chicago, IL'])
})

test('keeps at most six', () => {
  rememberPlaces(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])

  expect(loadRecentPlaces()).toHaveLength(6)
})

test('ignores corrupted storage', () => {
  localStorage.setItem('trip-planner:recent-places', '{nope')

  expect(loadRecentPlaces()).toEqual([])
})
