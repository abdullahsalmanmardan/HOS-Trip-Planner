import { secondaryButtonClassName } from './Field'

interface EmptyStateProps {
  onTryExample: () => void
}

const RULES = [
  ['Driving', 'Up to 11 hours after 10 hours off, inside a 14-hour window'],
  ['Breaks', '30 minutes after 8 hours of driving; a pickup or fuel stop counts'],
  ['Rest', '10 hours in the sleeper berth when the day runs out'],
  ['Cycle', '70 hours in 8 days, then a 34-hour restart'],
  ['Fuel', 'At least every 1,000 miles, 30 minutes on duty'],
  ['Stops', '1 hour for pickup and dropoff, 30 min pre-trip, 15 min post-trip'],
]

export function EmptyState({ onTryExample }: EmptyStateProps) {
  return (
    <section aria-labelledby="empty-state-title" className="grid gap-10 py-6 lg:grid-cols-2">
      <div>
        <h2 id="empty-state-title" className="text-xl font-semibold">
          No trip planned yet
        </h2>
        <p className="mt-2 max-w-prose text-muted">
          Fill in the trip above and press Plan trip. You get the truck route with every stop the
          driver has to make, and a filled-in daily log sheet for each day on the road.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onTryExample} className={secondaryButtonClassName}>
            Try an example trip
          </button>
          <span className="text-sm text-faint">Chicago to Indianapolis to Denver, 20 h used</span>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Rules applied (49 CFR 395, property carrier)
        </h3>
        <dl className="mt-2 border-t border-rule text-sm">
          {RULES.map(([term, description]) => (
            <div key={term} className="grid grid-cols-[6rem_1fr] gap-3 border-b border-rule py-2">
              <dt className="font-semibold">{term}</dt>
              <dd className="text-muted">{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
