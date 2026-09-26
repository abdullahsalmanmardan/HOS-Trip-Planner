const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string[]>

  constructor(message: string, status: number, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

interface ErrorBody {
  error?: { message?: string; fields?: Record<string, string[]> }
}

function messageForStatus(status: number): string {
  if (status === 404) return 'Trip planning is not available on this server yet.'
  if (status >= 500) return 'The server ran into a problem. Please try again in a moment.'
  return `The request failed (HTTP ${status}).`
}

async function request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }

  if (response.ok) return (await response.json()) as TResponse

  const errorBody = (await response.json().catch(() => ({}))) as ErrorBody
  throw new ApiError(
    errorBody.error?.message ?? messageForStatus(response.status),
    response.status,
    errorBody.error?.fields,
  )
}

export function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  return request<TResponse>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function getJson<TResponse>(path: string, signal?: AbortSignal): Promise<TResponse> {
  return request<TResponse>(path, { signal })
}
