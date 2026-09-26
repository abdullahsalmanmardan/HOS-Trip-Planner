const STORAGE_KEY = 'trip-planner:recent-places'
const MAX_RECENT = 6

export function loadRecentPlaces(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** Newest first, no duplicates. */
export function rememberPlaces(labels: string[]): void {
  const merged = [...labels, ...loadRecentPlaces()].filter(
    (label, index, all) => label && all.indexOf(label) === index,
  )
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(0, MAX_RECENT)))
  } catch {
    // Private mode or a full quota: recents are a convenience, so skip them.
  }
}
