import { useEffect, useState } from 'react'

/** Details a driver fills in by hand that the planner can't know. Shared by every sheet. */
export interface LogDetails {
  driverName: string
  carrierName: string
  mainOffice: string
  homeTerminal: string
  vehicleNumbers: string
  shippingDocument: string
  shipperCommodity: string
}

export const EMPTY_LOG_DETAILS: LogDetails = {
  driverName: '',
  carrierName: '',
  mainOffice: '',
  homeTerminal: '',
  vehicleNumbers: '',
  shippingDocument: '',
  shipperCommodity: '',
}

const STORAGE_KEY = 'trip-planner:log-details'

function loadDetails(): LogDetails {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored
      ? { ...EMPTY_LOG_DETAILS, ...(JSON.parse(stored) as Partial<LogDetails>) }
      : EMPTY_LOG_DETAILS
  } catch {
    return EMPTY_LOG_DETAILS
  }
}

/** Remembered between visits so a driver doesn't retype their carrier on every trip. */
export function useLogDetails(): [LogDetails, (details: LogDetails) => void] {
  const [details, setDetails] = useState<LogDetails>(loadDetails)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(details))
    } catch {
      // Storage can be unavailable (private mode, quota); the details still work for this visit.
    }
  }, [details])

  return [details, setDetails]
}
