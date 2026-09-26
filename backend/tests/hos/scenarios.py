import random
from dataclasses import dataclass

from trips.hos.models import Leg


@dataclass(frozen=True)
class Scenario:
    name: str
    to_pickup: Leg
    to_dropoff: Leg
    cycle_used_hours: float = 0

    @property
    def cycle_used_minutes(self) -> int:
        return round(self.cycle_used_hours * 60)


def at_mph(miles: float, mph: float) -> Leg:
    return Leg(distance_miles=miles, drive_minutes=round(miles / mph * 60))


NAMED_SCENARIOS = [
    Scenario("short trip", at_mph(50, 50), at_mph(200, 55)),
    Scenario("needs a 30-minute break", Leg(0, 0), at_mph(540, 60)),
    Scenario("hits the 11-hour limit", at_mph(60, 60), at_mph(780, 60)),
    # Realistic speeds never stack 3 hours of stops into one shift, so the 11-hour limit always
    # binds first. A very fast leg forces a fuel stop every two hours to exercise the window.
    Scenario("hits the 14-hour window first", at_mph(100, 500), at_mph(5000, 500)),
    Scenario("2,500 miles", at_mph(300, 55), at_mph(2200, 60)),
    Scenario("high starting cycle", at_mph(120, 55), at_mph(1400, 60), cycle_used_hours=65),
    Scenario("cycle already used up", at_mph(120, 55), at_mph(600, 60), cycle_used_hours=70),
    Scenario("pickup at current location", Leg(0, 0), at_mph(300, 55)),
]


def random_scenarios(count: int, seed: int = 395) -> list[Scenario]:
    rng = random.Random(seed)
    scenarios = []
    for index in range(count):
        to_pickup_miles = rng.choice([0, rng.uniform(1, 600)])
        to_dropoff_miles = rng.uniform(1, 3000)
        scenarios.append(
            Scenario(
                f"random #{index}",
                at_mph(to_pickup_miles, rng.uniform(25, 70)) if to_pickup_miles else Leg(0, 0),
                at_mph(to_dropoff_miles, rng.uniform(25, 70)),
                cycle_used_hours=rng.choice([0, 70, round(rng.uniform(0, 70) * 4) / 4]),
            )
        )
    return scenarios
