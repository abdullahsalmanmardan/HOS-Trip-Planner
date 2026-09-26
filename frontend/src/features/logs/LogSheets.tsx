import { useState, type KeyboardEvent } from 'react'

import type { DailyLog } from '@/api/trips'
import { primaryButtonClassName } from '@/components/Field'
import { formatHours, formatLongDate, formatMiles } from '@/lib/format'

import { type LogDetails, useLogDetails } from './logDetails'
import { LogSheet } from './LogSheet'

const DETAIL_FIELDS: { key: keyof LogDetails; label: string; placeholder: string }[] = [
  { key: 'driverName', label: 'Driver', placeholder: 'John E. Doe' },
  { key: 'carrierName', label: 'Carrier', placeholder: "John Doe's Transportation" },
  { key: 'mainOffice', label: 'Main office', placeholder: 'Washington, DC' },
  { key: 'homeTerminal', label: 'Home terminal', placeholder: 'Richmond, VA' },
  { key: 'vehicleNumbers', label: 'Truck / trailer', placeholder: '101, 601' },
  { key: 'shippingDocument', label: 'Manifest no.', placeholder: 'BOL 20544' },
  { key: 'shipperCommodity', label: 'Shipper & commodity', placeholder: 'Acme Foods, produce' },
]

function DetailsForm({
  details,
  onChange,
}: {
  details: LogDetails
  onChange: (details: LogDetails) => void
}) {
  return (
    <details className="group border-y border-rule print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between py-2.5 text-sm">
        <span>
          <span className="font-semibold">Driver and carrier details</span>
          <span className="ml-2 text-muted">printed on every sheet, optional</span>
        </span>
        <span aria-hidden="true" className="text-muted group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="grid gap-x-3 gap-y-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        {DETAIL_FIELDS.map((field) => (
          <label key={field.key} className="text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
              {field.label}
            </span>
            <input
              type="text"
              value={details[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => onChange({ ...details, [field.key]: event.target.value })}
              className="block h-9 w-full rounded-sm border border-rule bg-sheet px-2.5 text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </label>
        ))}
      </div>
    </details>
  )
}

const ARROW_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }

function dayLabel(log: DailyLog): string {
  const [, month, day] = log.date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function LogSheets({ logs }: { logs: DailyLog[] }) {
  const [details, setDetails] = useLogDetails()
  const [selected, setSelected] = useState(0)
  const active = logs[selected] ?? logs[0]

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = ARROW_STEPS[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = (selected + step + logs.length) % logs.length
    setSelected(next)
    document.getElementById(`log-tab-${next}`)?.focus()
  }

  return (
    <section aria-labelledby="logs-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <h2 id="logs-title" className="text-xs font-bold tracking-widest text-muted uppercase">
          Daily logs
        </h2>
        <button type="button" onClick={() => window.print()} className={primaryButtonClassName}>
          Print or save all {logs.length} as PDF
        </button>
      </div>

      <DetailsForm details={details} onChange={setDetails} />

      <div
        role="tablist"
        aria-label="Log day"
        className="flex flex-wrap border-b-2 border-ink print:hidden"
      >
        {logs.map((log, index) => {
          const isSelected = index === selected
          return (
            <button
              key={log.date}
              id={`log-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`log-panel-${index}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={moveSelection}
              className={`-mb-0.5 border-b-2 px-4 py-2 text-left text-sm ${
                isSelected
                  ? 'border-accent font-semibold text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              Day {index + 1}
              <span className="ml-1.5 font-normal text-faint tabular-nums">{dayLabel(log)}</span>
            </button>
          )
        })}
      </div>

      {active && (
        <p className="text-sm text-muted print:hidden">
          {formatLongDate(active.date)} &middot; {formatMiles(active.total_miles)} driven &middot;{' '}
          {formatHours(active.on_duty_minutes)} h on duty
        </p>
      )}

      {logs.map((log, index) => (
        <div
          key={log.date}
          id={`log-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`log-tab-${index}`}
          // A class, not the hidden attribute: Tailwind's base styles make [hidden] !important,
          // which would keep the other days out of the printout.
          className={`log-sheet border border-ink bg-sheet print:block print:border-0 ${
            index === selected ? '' : 'hidden'
          }`}
        >
          <div className="overflow-x-auto p-2 print:p-0">
            <div className="min-w-[720px] print:min-w-0">
              <LogSheet
                log={log}
                details={details}
                title={`Driver's daily log, day ${index + 1} of ${logs.length}: ${formatLongDate(log.date)}`}
              />
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
