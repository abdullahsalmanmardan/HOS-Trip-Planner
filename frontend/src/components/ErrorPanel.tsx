import { secondaryButtonClassName } from './Field'

interface ErrorPanelProps {
  message: string
  onRetry: () => void
}

export function ErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <section
      role="alert"
      aria-labelledby="error-title"
      className="my-6 border-l-4 border-danger bg-sheet px-5 py-4"
    >
      <h2 id="error-title" className="font-semibold text-danger">
        We could not plan this trip
      </h2>
      <p className="mt-1 text-ink">{message}</p>
      <button type="button" onClick={onRetry} className={`${secondaryButtonClassName} mt-3`}>
        Try again
      </button>
    </section>
  )
}
