import type { DailyLog, TripStop } from '@/api/trips'
import { formatDayTime, formatDuration, formatTime, isSameDay } from '@/lib/format'
import { STOP_STYLES } from '@/lib/tripColors'

import { drivingMinutesBetween } from './driving'

interface StopTableProps {
  stops: TripStop[]
  logs: DailyLog[]
}

export function StopTable({ stops, logs }: StopTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-xs tracking-wide text-muted uppercase">
            <th scope="col" className="w-8 py-2 pr-2 font-semibold">
              #
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Stop
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Location
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Arrive
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Leave
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold">
              Time here
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Drive before
            </th>
          </tr>
        </thead>
        <tbody>
          {stops.map((stop, index) => {
            const previous = stops[index - 1]
            const style = STOP_STYLES[stop.type]
            return (
              <tr key={`${stop.type}-${stop.arrival}`} className="border-b border-rule align-top">
                <td className="py-2 pr-2 text-faint tabular-nums">{index + 1}</td>
                <th scope="row" className="py-2 pr-4 text-left font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: style.color }}
                    />
                    {stop.label}
                  </span>
                </th>
                <td className="py-2 pr-4">{stop.location}</td>
                <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                  {formatDayTime(stop.arrival)}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                  {isSameDay(stop.arrival, stop.departure)
                    ? formatTime(stop.departure)
                    : formatDayTime(stop.departure)}
                </td>
                <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums">
                  {stop.duration_minutes > 0 ? formatDuration(stop.duration_minutes) : '–'}
                </td>
                <td className="py-2 text-right whitespace-nowrap text-muted tabular-nums">
                  {previous && stop.mile > previous.mile
                    ? `${Math.round(stop.mile - previous.mile).toLocaleString('en-US')} mi, ${formatDuration(
                        drivingMinutesBetween(logs, previous.departure, stop.arrival),
                      )}`
                    : '–'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
