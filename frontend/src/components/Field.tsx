import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: (describedBy: string | undefined) => ReactNode
  /** A small control that sits on the label row, e.g. "Use my location". */
  action?: ReactNode
  className?: string
}

export function Field({ id, label, hint, error, children, action, className = '' }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold tracking-wide text-muted uppercase">
          {label}
        </label>
        {action}
      </div>
      {children(describedBy)}
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1 text-xs text-faint">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export const inputClassName =
  'block h-10 w-full rounded-sm border border-rule bg-sheet px-2.5 text-[15px] text-ink ' +
  'placeholder:text-faint focus:border-ink focus:outline-none ' +
  'aria-[invalid=true]:border-danger'

export const primaryButtonClassName =
  'inline-flex h-10 items-center justify-center rounded-sm bg-ink px-4 text-sm font-semibold ' +
  'text-white hover:bg-black disabled:cursor-wait disabled:opacity-60'

export const secondaryButtonClassName =
  'inline-flex h-9 items-center justify-center rounded-sm border border-ink px-3 text-sm ' +
  'font-semibold text-ink hover:bg-ink hover:text-white'
