import { useState } from 'react'

import { reverseGeocode } from '@/api/trips'

type LocateState = { status: 'idle' | 'locating' } | { status: 'error'; message: string }

const UNAVAILABLE = "Your position isn't available right now. Type the city instead."
const POSITION_ERRORS: Record<number, string> = {
  1: 'Location access is blocked. Allow it in the browser, or type the city.',
  2: UNAVAILABLE,
  3: 'Finding your position took too long. Try again or type the city.',
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60 * 1000,
    }),
  )
}

/**
 * Asks the browser where the user is and names it "City, ST". If the place can't be named
 * (e.g. the geocoding quota is spent), the coordinates are used; the planner accepts those too.
 */
export function useMyLocation(onFound: (location: string) => void) {
  const [state, setState] = useState<LocateState>({ status: 'idle' })
  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator

  const locate = async () => {
    setState({ status: 'locating' })
    let position: GeolocationPosition
    try {
      position = await currentPosition()
    } catch (error) {
      const code = (error as GeolocationPositionError).code
      setState({ status: 'error', message: POSITION_ERRORS[code] ?? UNAVAILABLE })
      return
    }

    const { latitude, longitude } = position.coords
    const label = await reverseGeocode(latitude, longitude).catch(() => null)
    onFound(label ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
    setState({ status: 'idle' })
  }

  return { state, locate, isSupported }
}
