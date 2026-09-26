"""An independent replay of a schedule against the HOS rules, used as the tests' oracle.

Deliberately written without reusing the planner's state machine, so a bug in the planner's
bookkeeping can't hide itself by being mirrored here.
"""

from datetime import timedelta
from itertools import pairwise

from trips.hos import rules
from trips.hos.models import DutyStatus, StopType, TripPlan

MILES_EPSILON = 1e-6


def find_violations(plan: TripPlan, cycle_used_minutes_at_start: int) -> list[str]:
    violations: list[str] = []
    segments = plan.segments

    for previous, current in pairwise(segments):
        if previous.end != current.start:
            violations.append(f"gap or overlap at {current.start}")
    for segment in segments:
        if segment.end <= segment.start:
            violations.append(f"empty or negative segment at {segment.start}")
        if segment.status != DutyStatus.DRIVING and segment.miles:
            violations.append(f"miles recorded while not driving at {segment.start}")

    shift_started_at = None
    driving_in_shift = 0
    driving_since_break = 0
    non_driving_streak = 0
    off_duty_streak = 0
    cycle_used = cycle_used_minutes_at_start

    for segment in segments:
        minutes = segment.minutes
        if segment.status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY) and shift_started_at is None:
            shift_started_at = segment.start

        if segment.status == DutyStatus.DRIVING:
            driving_in_shift += minutes
            driving_since_break += minutes
            cycle_used += minutes
            non_driving_streak = 0
            off_duty_streak = 0
            if driving_in_shift > rules.MAX_DRIVING_MINUTES:
                violations.append(f"11-hour driving limit exceeded at {segment.end}")
            if segment.end - shift_started_at > timedelta(minutes=rules.DUTY_WINDOW_MINUTES):
                violations.append(f"drove after the 14-hour window at {segment.end}")
            if driving_since_break > rules.MAX_DRIVING_WITHOUT_BREAK_MINUTES:
                violations.append(f"drove more than 8 hours without a break at {segment.end}")
            if cycle_used > rules.CYCLE_LIMIT_MINUTES:
                violations.append(f"drove past the 70-hour cycle at {segment.end}")
            continue

        non_driving_streak += minutes
        if non_driving_streak >= rules.MIN_BREAK_MINUTES:
            driving_since_break = 0
        if segment.status == DutyStatus.ON_DUTY:
            cycle_used += minutes
            off_duty_streak = 0
            continue

        off_duty_streak += minutes
        if off_duty_streak >= rules.DAILY_RESET_MINUTES:
            shift_started_at = None
            driving_in_shift = 0
        if off_duty_streak >= rules.CYCLE_RESTART_MINUTES:
            cycle_used = 0

    fuel_miles = [
        0.0,
        *(s.mile for s in plan.stops if s.type == StopType.FUEL),
        segments[-1].end_mile,
    ]
    for previous_fill, next_fill in pairwise(fuel_miles):
        if next_fill - previous_fill > rules.MAX_MILES_BETWEEN_FUEL + MILES_EPSILON:
            violations.append(f"ran {next_fill - previous_fill:.1f} miles without fuel")

    return violations
