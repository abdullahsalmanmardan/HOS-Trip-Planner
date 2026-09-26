import type { DailyLog, DutyStatus } from '@/api/trips'
import { formatHours } from '@/lib/format'
import { DUTY_STATUS_STYLES } from '@/lib/tripColors'

import {
  GRID_BOTTOM,
  GRID_LEFT,
  GRID_RIGHT,
  GRID_TOP,
  ROW_HEIGHT,
  SHEET_WIDTH,
  STATUS_ROWS,
  drawnTotals,
  dutyLinePath,
  gridTicks,
  groupRemarks,
  hourLabel,
  layoutRemarkAnchors,
  minuteToX,
  rowTop,
  snapSegments,
  snapToQuarterHour,
  type TickKind,
} from './logGeometry'
import type { LogDetails } from './logDetails'

const SHEET_HEIGHT = 700
const INK = '#1e3a8a'
const RULE = '#0f172a'
const MUTED = '#475569'
const HEADER_BAND_TOP = GRID_TOP - 24
const TOTALS_X = 948
const REMARKS_TOP = GRID_BOTTOM + 12
// Space along the grid that each line of an angled label occupies, and the most note lines shown.
const REMARK_LINE_SPACE = 15
const MAX_REMARK_NOTES = 3
// Short stops get a bracket under their span, like the guide's sample log. Long rests don't.
const MAX_BRACKET_MINUTES = 3 * 60

const TICK_LENGTHS: Record<TickKind, number> = { hour: ROW_HEIGHT, half: 12, quarter: 7 }
const TICKS = gridTicks()

const ROW_LABELS: Record<DutyStatus, [string, string?]> = {
  off_duty: ['1. Off Duty'],
  sleeper: ['2. Sleeper', 'Berth'],
  driving: ['3. Driving'],
  on_duty: ['4. On Duty', '(not driving)'],
}

interface FilledLineProps {
  x1: number
  x2: number
  y: number
  caption: string
  value: string
  placeholder?: string
  align?: 'start' | 'middle'
}

/** A ruled line with its caption underneath, filled in the way a driver would by hand. */
function FilledLine({ x1, x2, y, caption, value, placeholder, align = 'start' }: FilledLineProps) {
  const textX = align === 'middle' ? (x1 + x2) / 2 : x1 + 4
  return (
    <g>
      {value ? (
        <text x={textX} y={y - 5} textAnchor={align} fontSize={14} fill={INK} fontWeight={600}>
          {value}
        </text>
      ) : (
        placeholder && (
          <text
            x={textX}
            y={y - 5}
            textAnchor={align}
            fontSize={12}
            fill="#94a3b8"
            fontStyle="italic"
            className="print:hidden"
          >
            {placeholder}
          </text>
        )
      )}
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={RULE} strokeWidth={1} />
      <text x={(x1 + x2) / 2} y={y + 12} textAnchor="middle" fontSize={9.5} fill={MUTED}>
        {caption}
      </text>
    </g>
  )
}

function Header({ log, details }: { log: DailyLog; details: LogDetails }) {
  const [year, month, day] = log.date.split('-')
  const miles = Math.round(log.total_miles).toLocaleString('en-US')
  return (
    <g>
      <text x={20} y={40} fontSize={26} fontWeight={700} fill={RULE}>
        Drivers Daily Log
      </text>
      <text x={60} y={58} fontSize={11} fill={MUTED}>
        (24 hours)
      </text>

      <FilledLine x1={290} x2={370} y={40} caption="(month)" value={month ?? ''} align="middle" />
      <text x={378} y={36} fontSize={18} fill={RULE}>
        /
      </text>
      <FilledLine x1={392} x2={462} y={40} caption="(day)" value={day ?? ''} align="middle" />
      <text x={470} y={36} fontSize={18} fill={RULE}>
        /
      </text>
      <FilledLine x1={484} x2={574} y={40} caption="(year)" value={year ?? ''} align="middle" />

      <text x={610} y={28} fontSize={10.5} fill={RULE}>
        Original - File at home terminal.
      </text>
      <text x={610} y={43} fontSize={10.5} fill={RULE}>
        Duplicate - Driver retains in his/her possession for 8 days.
      </text>

      <text x={40} y={92} fontSize={13} fontWeight={600} fill={RULE}>
        From:
      </text>
      <FilledLine x1={84} x2={470} y={94} caption="" value={log.from_location} />
      <text x={520} y={92} fontSize={13} fontWeight={600} fill={RULE}>
        To:
      </text>
      <FilledLine x1={548} x2={960} y={94} caption="" value={log.to_location} />

      {[
        { x: 40, caption: 'Total Miles Driving Today' },
        { x: 190, caption: 'Total Mileage Today' },
      ].map((box) => (
        <g key={box.caption}>
          <rect
            x={box.x}
            y={118}
            width={136}
            height={40}
            fill="none"
            stroke={RULE}
            strokeWidth={1.2}
          />
          <text
            x={box.x + 68}
            y={145}
            textAnchor="middle"
            fontSize={17}
            fontWeight={700}
            fill={INK}
          >
            {miles}
          </text>
          <text x={box.x + 68} y={172} textAnchor="middle" fontSize={9.5} fill={MUTED}>
            {box.caption}
          </text>
        </g>
      ))}
      <FilledLine
        x1={40}
        x2={326}
        y={212}
        caption="Truck/Tractor and Trailer Numbers or License Plate(s)/State"
        value={details.vehicleNumbers}
        placeholder="Truck and trailer numbers"
      />

      <FilledLine
        x1={400}
        x2={960}
        y={136}
        caption="Name of Carrier or Carriers"
        value={details.carrierName}
        placeholder="Carrier name"
        align="middle"
      />
      <FilledLine
        x1={400}
        x2={960}
        y={174}
        caption="Main Office Address"
        value={details.mainOffice}
        placeholder="City, state"
        align="middle"
      />
      <FilledLine
        x1={400}
        x2={960}
        y={212}
        caption="Home Terminal Address"
        value={details.homeTerminal}
        placeholder="City, state"
        align="middle"
      />
    </g>
  )
}

function Grid({ log }: { log: DailyLog }) {
  const drawn = snapSegments(log.segments)
  const totals = drawnTotals(drawn)
  return (
    <g>
      <rect
        x={GRID_LEFT - 30}
        y={HEADER_BAND_TOP}
        width={GRID_RIGHT - GRID_LEFT + 60}
        height={24}
        fill={RULE}
      />
      {Array.from({ length: 25 }, (_, hour) => {
        const label = hourLabel(hour)
        const isMidnight = label === 'Mid-night'
        return (
          <text
            key={hour}
            x={minuteToX(hour * 60)}
            y={HEADER_BAND_TOP + (isMidnight ? 10 : 16)}
            textAnchor="middle"
            fontSize={isMidnight ? 8 : 10}
            fontWeight={600}
            fill="#ffffff"
          >
            {isMidnight ? (
              <>
                <tspan x={minuteToX(hour * 60)}>Mid-</tspan>
                <tspan x={minuteToX(hour * 60)} dy={9}>
                  night
                </tspan>
              </>
            ) : (
              label
            )}
          </text>
        )
      })}
      <text x={TOTALS_X} y={HEADER_BAND_TOP + 10} textAnchor="middle" fontSize={9} fill={RULE}>
        Total
      </text>
      <text x={TOTALS_X} y={HEADER_BAND_TOP + 20} textAnchor="middle" fontSize={9} fill={RULE}>
        Hours
      </text>

      {STATUS_ROWS.map((status) => {
        const top = rowTop(status)
        const [line1, line2] = ROW_LABELS[status]
        return (
          <g key={status}>
            <rect
              x={20}
              y={top + 9}
              width={8}
              height={12}
              rx={2}
              fill={DUTY_STATUS_STYLES[status].color}
            />
            <text x={34} y={top + (line2 ? 13 : 19)} fontSize={11} fontWeight={600} fill={RULE}>
              {line1}
            </text>
            {line2 && (
              <text x={46} y={top + 25} fontSize={10} fill={MUTED}>
                {line2}
              </text>
            )}
            <rect
              x={GRID_LEFT}
              y={top}
              width={GRID_RIGHT - GRID_LEFT}
              height={ROW_HEIGHT}
              fill="#ffffff"
              stroke={RULE}
              strokeWidth={1}
            />
            {TICKS.map(({ minute, kind }) => {
              const x = minuteToX(minute)
              const length = TICK_LENGTHS[kind]
              return (
                <line
                  key={minute}
                  x1={x}
                  x2={x}
                  y1={top}
                  y2={top + length}
                  stroke={RULE}
                  strokeWidth={kind === 'hour' ? 0.8 : 0.6}
                />
              )
            })}
            <text
              x={TOTALS_X}
              y={top + 20}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill={INK}
              data-total={status}
            >
              {formatHours(totals[status])}
            </text>
            <line
              x1={TOTALS_X - 26}
              x2={TOTALS_X + 26}
              y1={top + ROW_HEIGHT - 3}
              y2={top + ROW_HEIGHT - 3}
              stroke={RULE}
              strokeWidth={0.8}
            />
          </g>
        )
      })}
      <text
        x={TOTALS_X}
        y={GRID_BOTTOM + 20}
        textAnchor="middle"
        fontSize={14}
        fontWeight={700}
        fill={INK}
        data-total="all"
      >
        ={formatHours(Object.values(totals).reduce((sum, minutes) => sum + minutes, 0))}
      </text>

      <path
        d={dutyLinePath(drawn)}
        fill="none"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  )
}

function Remarks({ log }: { log: DailyLog }) {
  const groups = groupRemarks(log.remarks)
  const tickXs = groups.map((group) =>
    group.minutes.map((minute) => minuteToX(snapToQuarterHour(minute))),
  )
  const noteLines = groups.map((group) => group.notes.slice(0, MAX_REMARK_NOTES))
  const anchors = layoutRemarkAnchors(
    tickXs.map((xs) => xs[0] ?? GRID_LEFT),
    noteLines.map((lines) => (lines.length + 1) * REMARK_LINE_SPACE),
  )
  const brackets = log.segments.filter((segment) => {
    const minutes = segment.end_minute - segment.start_minute
    return segment.status !== 'driving' && segment.note && minutes <= MAX_BRACKET_MINUTES
  })
  const tickBottom = GRID_BOTTOM + 14
  const labelTop = GRID_BOTTOM + 26

  return (
    <g>
      <text x={20} y={REMARKS_TOP + 14} fontSize={14} fontWeight={700} fill={RULE}>
        Remarks
      </text>
      <line
        x1={GRID_LEFT - 30}
        x2={GRID_LEFT - 30}
        y1={REMARKS_TOP}
        y2={REMARKS_TOP + 150}
        stroke={RULE}
        strokeWidth={3}
      />

      {brackets.map((segment) => {
        const x1 = minuteToX(snapToQuarterHour(segment.start_minute))
        const x2 = minuteToX(snapToQuarterHour(segment.end_minute))
        const y = GRID_BOTTOM + 8
        return (
          <path
            key={`bracket-${segment.start}`}
            d={`M ${x1} ${GRID_BOTTOM + 1} V ${y} H ${x2} V ${GRID_BOTTOM + 1}`}
            fill="none"
            stroke={INK}
            strokeWidth={1.2}
          />
        )
      })}

      {groups.map((group, index) => {
        const xs = tickXs[index] ?? []
        const anchor = anchors[index] ?? GRID_LEFT
        const first = xs[0] ?? anchor
        return (
          <g key={`${group.location}-${group.minutes[0]}`}>
            {xs.map((x) => (
              <line
                key={x}
                x1={x}
                x2={x}
                y1={GRID_BOTTOM + 1}
                y2={tickBottom}
                stroke={INK}
                strokeWidth={0.9}
              />
            ))}
            <path
              d={`M ${first} ${tickBottom} L ${anchor} ${labelTop - 4}`}
              fill="none"
              stroke={INK}
              strokeWidth={0.9}
            />
            <g transform={`translate(${anchor} ${labelTop}) rotate(50)`}>
              <text fontSize={10.5} fontWeight={600} fill={INK}>
                {group.location}
              </text>
              {(noteLines[index] ?? []).map((note, line) => (
                <text key={`${line}-${note}`} y={11 * (line + 1)} fontSize={9} fill={MUTED}>
                  {note}
                </text>
              ))}
            </g>
          </g>
        )
      })}
    </g>
  )
}

function Footer({ log, details }: { log: DailyLog; details: LogDetails }) {
  const drawn = drawnTotals(snapSegments(log.segments))
  const onDutyMinutes = drawn.driving + drawn.on_duty
  const footerTop = REMARKS_TOP + 160
  const recapTop = footerTop + 88
  return (
    <g>
      <text x={20} y={footerTop} fontSize={12} fontWeight={700} fill={RULE}>
        Shipping Documents:
      </text>
      <FilledLine
        x1={20}
        x2={300}
        y={footerTop + 26}
        caption="DVL or Manifest No."
        value={details.shippingDocument}
        placeholder="Manifest number"
      />
      <FilledLine
        x1={20}
        x2={300}
        y={footerTop + 60}
        caption="Shipper & Commodity"
        value={details.shipperCommodity}
        placeholder="Shipper and commodity"
      />
      <FilledLine
        x1={560}
        x2={960}
        y={footerTop + 26}
        caption="Driver's signature in full - I certify that these entries are true and correct"
        value={details.driverName}
        placeholder="Driver name"
        align="middle"
      />
      <text x={630} y={footerTop + 58} textAnchor="middle" fontSize={9.5} fill={MUTED}>
        Enter name of place you reported and where released from work
      </text>
      <text x={630} y={footerTop + 70} textAnchor="middle" fontSize={9.5} fill={MUTED}>
        and when and where each change of duty occurred. Use time standard of home terminal.
      </text>

      <line x1={20} x2={980} y1={recapTop - 12} y2={recapTop - 12} stroke={RULE} strokeWidth={2} />
      <text x={20} y={recapTop + 4} fontSize={11} fontWeight={700} fill={RULE}>
        Recap:
      </text>
      <text x={20} y={recapTop + 17} fontSize={9.5} fill={MUTED}>
        Complete at end of day
      </text>
      {[
        {
          x: 180,
          value: formatHours(onDutyMinutes),
          lines: ['On duty hours today,', 'Total lines 3 & 4'],
        },
        {
          x: 360,
          value: formatHours(log.cycle_used_minutes),
          lines: ['A. Total hours on duty', 'last 8 days incl. today'],
        },
        {
          x: 540,
          value: formatHours(log.cycle_available_minutes),
          lines: ['B. Total hours available', 'tomorrow, 70 hr. minus A'],
        },
      ].map((cell) => (
        <g key={cell.lines[0]}>
          <text x={cell.x} y={recapTop + 4} fontSize={15} fontWeight={700} fill={INK}>
            {cell.value}
          </text>
          {cell.lines.map((line, index) => (
            <text
              key={line}
              x={cell.x + 52}
              y={recapTop - 2 + index * 12}
              fontSize={9.5}
              fill={MUTED}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
      <text x={740} y={recapTop - 2} fontSize={9.5} fill={MUTED}>
        70 Hour / 8 Day driver. A counts from the cycle
      </text>
      <text x={740} y={recapTop + 10} fontSize={9.5} fill={MUTED}>
        hours entered for the trip; a 34-hour restart
      </text>
      <text x={740} y={recapTop + 22} fontSize={9.5} fill={MUTED}>
        resets it to 0.
      </text>
    </g>
  )
}

interface LogSheetProps {
  log: DailyLog
  details: LogDetails
  title: string
}

export function LogSheet({ log, details, title }: LogSheetProps) {
  return (
    <svg
      viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`}
      role="img"
      aria-label={title}
      className="h-auto w-full"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
    >
      <rect width={SHEET_WIDTH} height={SHEET_HEIGHT} fill="#ffffff" />
      <Header log={log} details={details} />
      <Grid log={log} />
      <Remarks log={log} />
      <Footer log={log} details={details} />
    </svg>
  )
}
