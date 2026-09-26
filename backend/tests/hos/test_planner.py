from datetime import datetime, timedelta

import pytest

from trips.hos import rules
from trips.hos.models import DutyStatus, Leg, StopType, TripPlan
from trips.hos.planner import plan_trip

from .compliance import find_violations
from .scenarios import NAMED_SCENARIOS, Scenario, at_mph


def plan(scenario: Scenario, start_time: datetime) -> TripPlan:
    return plan_trip(
        scenario.to_pickup, scenario.to_dropoff, start_time, scenario.cycle_used_minutes
    )


def scenario(name: str) -> Scenario:
    return next(s for s in NAMED_SCENARIOS if s.name == name)


def stop_types(trip: TripPlan) -> list[StopType]:
    return [stop.type for stop in trip.stops]


def driving_minutes_before(trip: TripPlan, moment: datetime) -> int:
    """Driving since the last 10-hour reset, up to `moment`."""
    total = 0
    for segment in trip.segments:
        if segment.start >= moment:
            break
        if segment.status == DutyStatus.SLEEPER and segment.minutes >= rules.DAILY_RESET_MINUTES:
            total = 0
        elif segment.status == DutyStatus.DRIVING:
            total += segment.minutes
    return total


def test_short_trip_needs_no_rest(start_time: datetime) -> None:
    trip = plan(scenario("short trip"), start_time)

    assert stop_types(trip) == [StopType.START, StopType.PICKUP, StopType.DROPOFF]
    assert [(s.status, s.minutes) for s in trip.segments] == [
        (DutyStatus.ON_DUTY, rules.PRE_TRIP_INSPECTION_MINUTES),
        (DutyStatus.DRIVING, 60),
        (DutyStatus.ON_DUTY, rules.PICKUP_MINUTES),
        (DutyStatus.DRIVING, 218),
        (DutyStatus.ON_DUTY, rules.DROPOFF_MINUTES),
        (DutyStatus.ON_DUTY, rules.POST_TRIP_INSPECTION_MINUTES),
    ]
    assert trip.segments[-1].end_mile == pytest.approx(250)


def test_break_is_inserted_after_eight_hours_of_driving(start_time: datetime) -> None:
    trip = plan(scenario("needs a 30-minute break"), start_time)

    assert stop_types(trip).count(StopType.BREAK) == 1
    assert StopType.REST not in stop_types(trip)
    break_stop = next(s for s in trip.stops if s.type == StopType.BREAK)
    assert break_stop.minutes == rules.MIN_BREAK_MINUTES
    assert driving_minutes_before(trip, break_stop.start) == 8 * 60


def test_pickup_counts_as_the_break(start_time: datetime) -> None:
    trip = plan_trip(at_mph(300, 60), at_mph(360, 60), start_time, 0)

    # 5 h driving, 1 h pickup, 6 h driving: the pickup already interrupted driving for 30+ min.
    assert StopType.BREAK not in stop_types(trip)


def test_fuel_stop_counts_as_the_break(start_time: datetime) -> None:
    # 990 mi at 110 mph: fuel comes due right around the 8-hour mark.
    trip = plan_trip(Leg(0, 0), at_mph(990 + 100, 110), start_time, 0)

    assert StopType.FUEL in stop_types(trip)
    assert StopType.BREAK not in stop_types(trip)


def test_eleven_hour_limit_forces_a_ten_hour_rest(start_time: datetime) -> None:
    trip = plan(scenario("hits the 11-hour limit"), start_time)

    rest = next(s for s in trip.stops if s.type == StopType.REST)
    assert rest.minutes == rules.DAILY_RESET_MINUTES
    assert driving_minutes_before(trip, rest.start) == rules.MAX_DRIVING_MINUTES
    rest_segment = next(s for s in trip.segments if s.start == rest.start)
    assert rest_segment.status == DutyStatus.SLEEPER


def test_fourteen_hour_window_can_bind_before_eleven_hours_of_driving(
    start_time: datetime,
) -> None:
    trip = plan(scenario("hits the 14-hour window first"), start_time)

    rest = next(s for s in trip.stops if s.type == StopType.REST)
    assert driving_minutes_before(trip, rest.start) < rules.MAX_DRIVING_MINUTES
    last_driving = max(
        s.end for s in trip.segments if s.status == DutyStatus.DRIVING and s.end <= rest.start
    )
    assert last_driving - start_time <= timedelta(minutes=rules.DUTY_WINDOW_MINUTES)
    assert rest.start - start_time >= timedelta(minutes=rules.DUTY_WINDOW_MINUTES - 60)


def test_long_trip_fuels_and_spans_several_days(start_time: datetime) -> None:
    trip = plan(scenario("2,500 miles"), start_time)

    assert stop_types(trip).count(StopType.FUEL) == 2
    assert stop_types(trip).count(StopType.REST) >= 3
    assert trip.segments[-1].end_mile == pytest.approx(2500)
    assert (trip.end - trip.start).days >= 3


def test_high_starting_cycle_drives_to_the_limit_then_restarts(start_time: datetime) -> None:
    trip = plan(scenario("high starting cycle"), start_time)

    restart = next(s for s in trip.stops if s.type == StopType.RESTART)
    assert restart.minutes == rules.CYCLE_RESTART_MINUTES
    on_duty_before_restart = sum(
        s.minutes
        for s in trip.segments
        if s.end <= restart.start and s.status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY)
    )
    # 65 h used + 5 h worked = the full 70: the driver uses the hours left before restarting.
    assert 65 * 60 + on_duty_before_restart == rules.CYCLE_LIMIT_MINUTES
    assert trip.cycle_used_minutes_at_end < rules.CYCLE_LIMIT_MINUTES


def test_used_up_cycle_restarts_before_any_work(start_time: datetime) -> None:
    trip = plan(scenario("cycle already used up"), start_time)

    assert trip.stops[0].type == StopType.RESTART
    assert trip.segments[0].status == DutyStatus.OFF_DUTY
    assert trip.segments[0].minutes == rules.CYCLE_RESTART_MINUTES


def test_pickup_at_current_location_skips_the_first_leg(start_time: datetime) -> None:
    trip = plan(scenario("pickup at current location"), start_time)

    assert [s.status for s in trip.segments[:3]] == [
        DutyStatus.ON_DUTY,
        DutyStatus.ON_DUTY,
        DutyStatus.DRIVING,
    ]
    assert trip.stops[1].type == StopType.PICKUP
    assert trip.stops[1].mile == 0


@pytest.mark.parametrize("named", NAMED_SCENARIOS, ids=lambda s: s.name)
def test_named_scenarios_are_compliant(named: Scenario, start_time: datetime) -> None:
    assert find_violations(plan(named, start_time), named.cycle_used_minutes) == []
