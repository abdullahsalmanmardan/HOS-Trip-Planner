import type { TripSummary as Summary } from '@/api/trips'
import { formatDayTime, formatDuration, formatHours, formatMiles } from '@/lib/format'

export function TripSummary({ summary }: { summary: Summary }) {
  const figures = [
    { label: 'Distance', value: formatMiles(summary.total_distance_miles) },
    { label: 'Driving', value: formatDuration(summary.total_drive_minutes) },
    { label: 'Door to door', value: formatDuration(summary.total_trip_minutes) },
    { label: 'Arrives', value: formatDayTime(summary.end) },
    { label: 'Log days', value: String(summary.day_count) },
    {
      label: 'Cycle used',
      value: `${formatHours(summary.cycle_used_minutes_at_start)} → ${formatHours(summary.cycle_used_minutes_at_end)} h`,
    },
  ]

  return (
    <dl className="grid grid-cols-2 border-y-2 border-ink sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1.5fr_0.7fr_1fr]">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className="border-b border-rule px-3 py-2.5 last:border-b-0 sm:border-r lg:border-b-0 lg:last:border-r-0"
        >
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
            {figure.label}
          </dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  )
}
