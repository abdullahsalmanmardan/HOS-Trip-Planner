from dataclasses import replace
from datetime import datetime, time, timedelta

from trips.hos import rules
from trips.hos.models import DailyLog, DutySegment, DutyStatus, Remark

DAY = timedelta(days=1)


def _midnight(moment: datetime) -> datetime:
    return datetime.combine(moment.date(), time(0), tzinfo=moment.tzinfo)


def _clip(segment: DutySegment, day_start: datetime, day_end: datetime) -> DutySegment | None:
    start = max(segment.start, day_start)
    end = min(segment.end, day_end)
    if start >= end:
        return None
    if start == segment.start and end == segment.end:
        return segment

    # Miles accrue evenly across a driving segment, so split them in proportion to time.
    total_seconds = (segment.end - segment.start).total_seconds()
    start_fraction = (start - segment.start).total_seconds() / total_seconds
    end_fraction = (end - segment.start).total_seconds() / total_seconds
    return replace(
        segment,
        start=start,
        end=end,
        start_mile=segment.start_mile + segment.miles * start_fraction,
        end_mile=segment.start_mile + segment.miles * end_fraction,
    )


def _pad_off_duty(
    start: datetime, end: datetime, mile: float, location: str, note: str = ""
) -> DutySegment:
    return DutySegment(
        status=DutyStatus.OFF_DUTY,
        start=start,
        end=end,
        start_mile=mile,
        end_mile=mile,
        note=note,
        location=location,
    )


def split_into_daily_logs(
    segments: list[DutySegment], cycle_used_minutes_at_start: int
) -> list[DailyLog]:
    """Cuts a trip's segments into one log per calendar day, midnight to midnight.

    Days are taken in the segments' own timezone, which should be the home terminal's. Time
    before the trip starts and after it ends is logged as off duty so every day totals 24 hours.
    """
    if not segments:
        return []

    first, last = segments[0], segments[-1]
    padded = [
        _pad_off_duty(_midnight(first.start), first.start, first.start_mile, first.location),
        *segments,
    ]
    trip_end_midnight = _midnight(last.end)
    if last.end != trip_end_midnight:
        padded.append(
            _pad_off_duty(
                last.end, trip_end_midnight + DAY, last.end_mile, last.location, "Off duty"
            )
        )

    logs: list[DailyLog] = []
    cycle_used = cycle_used_minutes_at_start
    off_duty_streak = 0
    day_start = _midnight(first.start)
    while day_start < padded[-1].end:
        day_end = day_start + DAY
        day_segments = [
            clipped
            for segment in padded
            if (clipped := _clip(segment, day_start, day_end)) is not None
        ]

        totals = dict.fromkeys(DutyStatus, 0)
        for segment in day_segments:
            totals[segment.status] += segment.minutes
            if segment.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER):
                off_duty_streak += segment.minutes
                if off_duty_streak >= rules.CYCLE_RESTART_MINUTES:
                    cycle_used = 0
            else:
                off_duty_streak = 0
                cycle_used += segment.minutes

        # A remark goes wherever the activity changes, as the guide asks for at every change of
        # duty status. Segments that merely continue across midnight don't get one.
        remarks = [
            Remark(
                time=segment.start,
                mile=segment.start_mile,
                location=segment.location,
                note=segment.note,
                status=segment.status,
            )
            for segment in day_segments
            if segment.start != day_start and segment.note
        ]

        logs.append(
            DailyLog(
                date=day_start.date(),
                segments=day_segments,
                totals=totals,
                miles_driven=sum(
                    segment.miles
                    for segment in day_segments
                    if segment.status == DutyStatus.DRIVING
                ),
                remarks=remarks,
                on_duty_minutes=totals[DutyStatus.DRIVING] + totals[DutyStatus.ON_DUTY],
                cycle_used_minutes_at_end=cycle_used,
            )
        )
        day_start = day_end

    return logs
