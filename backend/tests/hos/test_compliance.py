from datetime import datetime

import pytest

from trips.hos.models import DutyStatus, Leg, StopType
from trips.hos.planner import plan_trip

from .compliance import find_violations
from .scenarios import random_scenarios

SCENARIOS = random_scenarios(400)


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s.name)
def test_planner_never_breaks_a_rule(scenario, start_time: datetime) -> None:
    trip = plan_trip(
        scenario.to_pickup, scenario.to_dropoff, start_time, scenario.cycle_used_minutes
    )

    assert find_violations(trip, scenario.cycle_used_minutes) == []
    expected_miles = scenario.to_pickup.distance_miles + scenario.to_dropoff.distance_miles
    assert trip.segments[-1].end_mile == pytest.approx(expected_miles)
    expected_driving = scenario.to_pickup.drive_minutes + scenario.to_dropoff.drive_minutes
    assert (
        sum(s.minutes for s in trip.segments if s.status == DutyStatus.DRIVING) == expected_driving
    )


def test_oracle_catches_a_violation(start_time: datetime) -> None:
    trip = plan_trip(Leg(0, 0), Leg(700, 12 * 60), start_time, 0)
    # Doctor the plan: turn the rest into driving-time-free on duty work so the shift never resets.
    rest = next(s for s in trip.segments if s.status == DutyStatus.SLEEPER)
    rest.status = DutyStatus.ON_DUTY
    trip.stops = [s for s in trip.stops if s.type != StopType.REST]

    violations = find_violations(trip, 0)

    assert any("11-hour" in v for v in violations)
    assert any("14-hour" in v for v in violations)
