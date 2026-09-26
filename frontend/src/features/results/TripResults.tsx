import type { TripPlanResponse } from '@/api/trips'
import { LogSheets } from '@/features/logs/LogSheets'
import { STOP_STYLES } from '@/lib/tripColors'

import { RouteMap } from './RouteMap'
import { StopTable } from './StopTable'
import { TripSummary } from './TripSummary'

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-3 text-xs font-bold tracking-widest text-muted uppercase">
      {children}
    </h2>
  )
}

function Legend({ plan }: { plan: TripPlanResponse }) {
  const types = [...new Set(plan.stops.map((stop) => stop.type))]
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map legend">
      {types.map((type) => (
        <li key={type} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: STOP_STYLES[type].color }}
          />
          {STOP_STYLES[type].label}
        </li>
      ))}
    </ul>
  )
}

export function TripResults({ plan }: { plan: TripPlanResponse }) {
  const { current, pickup, dropoff } = plan.locations
  return (
    <div className="space-y-10 pt-6">
      <div className="space-y-10 print:hidden">
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="text-2xl font-bold tracking-tight">
              {current.label} <span className="text-faint">&rarr;</span> {pickup.label}{' '}
              <span className="text-faint">&rarr;</span> {dropoff.label}
            </h2>
            <p className="text-sm text-muted">
              Times in {plan.summary.timezone_abbreviation}, the home terminal&apos;s clock
            </p>
          </div>
          <TripSummary summary={plan.summary} />
        </div>

        <section aria-labelledby="route-title">
          <SectionHeading id="route-title">Route</SectionHeading>
          <RouteMap plan={plan} />
          <Legend plan={plan} />
        </section>

        <section aria-labelledby="stops-title">
          <SectionHeading id="stops-title">Stops</SectionHeading>
          <StopTable stops={plan.stops} logs={plan.daily_logs} />
        </section>
      </div>

      <LogSheets logs={plan.daily_logs} />
    </div>
  )
}
