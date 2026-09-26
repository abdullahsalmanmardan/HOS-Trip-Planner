from datetime import datetime, time
from itertools import pairwise

import pytest

from trips.hos.logs import split_into_daily_logs
from trips.hos.models import DutyStatus, Leg
from trips.hos.planner import plan_trip

from .scenarios import NAMED_SCENARIOS, at_mph, random_scenarios

MINUTES_PER_DAY = 24 * 60


@pytest.mark.parametrize(
    "scenario", [*NAMED_SCENARIOS, *random_scenarios(60, seed=8)], ids=lambda s: s.name
)
def test_every_day_totals_exactly_24_hours(scenario, start_time: datetime) -> None:
    trip = plan_trip(
        scenario.to_pickup, scenario.to_dropoff, start_time, scenario.cycle_used_minutes
    )
    logs = split_into_daily_logs(trip.segments, scenario.cycle_used_minutes)

    for log in logs:
        assert sum(log.totals.values()) == MINUTES_PER_DAY, log.date
        assert log.segments[0].start.time() == time(0)
        assert all(a.end == b.start for a, b in pairwise(log.segments))
    assert [log.date for log in logs] == sorted({log.date for log in logs})
    assert sum(log.miles_driven for log in logs) == pytest.approx(trip.segments[-1].end_mile)


def test_partial_first_and_last_days_are_padded_with_off_duty(start_time: datetime) -> None:
    trip = plan_trip(at_mph(50, 50), at_mph(200, 50), start_time, 0)
    [log] = split_into_daily_logs(trip.segments, 0)

    first, last = log.segments[0], log.segments[-1]
    assert (first.status, first.start.hour, first.end) == (DutyStatus.OFF_DUTY, 0, trip.start)
    assert (last.status, last.start) == (DutyStatus.OFF_DUTY, trip.end)
    assert last.end.time() == time(0) and last.end.date() > log.date
    assert (
        log.totals[DutyStatus.OFF_DUTY] == MINUTES_PER_DAY - (trip.end - trip.start).seconds // 60
    )


def test_driving_across_midnight_splits_miles_by_time(start_time: datetime) -> None:
    evening = start_time.replace(hour=20)
    # Pre-trip 20:00, pickup 20:30, then 6 hours at 60 mph from 21:30 to 03:30.
    trip = plan_trip(Leg(0, 0), Leg(360, 360), evening, 0)
    first_day, second_day = split_into_daily_logs(trip.segments, 0)

    assert first_day.miles_driven == pytest.approx(150)
    assert second_day.miles_driven == pytest.approx(210)
    assert first_day.totals[DutyStatus.DRIVING] == 150


def test_remarks_follow_each_change_of_activity(start_time: datetime) -> None:
    trip = plan_trip(at_mph(50, 50), at_mph(200, 50), start_time, 0)
    [log] = split_into_daily_logs(trip.segments, 0)

    assert [remark.note for remark in log.remarks] == [
        "Pre-trip inspection",
        "Driving to pickup",
        "Pickup",
        "Driving to dropoff",
        "Dropoff",
        "Post-trip inspection",
        "Off duty",
    ]


def test_cycle_hours_carry_across_days(start_time: datetime) -> None:
    trip = plan_trip(at_mph(100, 50), at_mph(1200, 60), start_time, 10 * 60)
    logs = split_into_daily_logs(trip.segments, 10 * 60)

    worked = sum(log.on_duty_minutes for log in logs)
    assert logs[-1].cycle_used_minutes_at_end == 10 * 60 + worked
    assert logs[-1].cycle_used_minutes_at_end == trip.cycle_used_minutes_at_end
