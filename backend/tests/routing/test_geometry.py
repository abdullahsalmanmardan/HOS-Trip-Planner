import pytest

from trips.routing.geometry import RouteLocator, haversine_miles, simplify


def test_haversine_between_chicago_and_indianapolis() -> None:
    assert haversine_miles((-87.6298, 41.8781), (-86.1581, 39.7684)) == pytest.approx(165, abs=2)


def test_point_at_mile_interpolates_within_the_right_leg() -> None:
    # Leg one runs east along the equator, leg two north; each is 100 road-miles.
    line = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]

    route = RouteLocator(line, [0, 1, 2], [100, 100])

    assert route.point_at(0) == pytest.approx((0.0, 0.0))
    assert route.point_at(50) == pytest.approx((0.5, 0.0))
    assert route.point_at(150) == pytest.approx((1.0, 0.5))
    assert route.point_at(200) == pytest.approx((1.0, 1.0))


def test_point_at_mile_handles_an_empty_first_leg() -> None:
    line = [(0.0, 0.0), (1.0, 0.0)]

    route = RouteLocator(line, [0, 0, 1], [0, 100])

    assert route.point_at(0) == pytest.approx((0.0, 0.0))
    assert route.point_at(25) == pytest.approx((0.25, 0.0))


def test_point_at_mile_within_a_many_point_leg() -> None:
    # Ten evenly spaced points: the halfway mile lands halfway along the line.
    line = [(i / 10, 0.0) for i in range(11)]
    route = RouteLocator(line, [0, 10], [70])

    assert route.point_at(35) == pytest.approx((0.5, 0.0))
    assert route.point_at(70) == pytest.approx((1.0, 0.0))


def test_simplify_keeps_endpoints_and_waypoints() -> None:
    line = [(float(i), 0.0) for i in range(1000)]

    thinned = simplify(line, 100, keep={437})

    assert len(thinned) <= 102
    assert thinned[0] == line[0] and thinned[-1] == line[-1]
    assert (437.0, 0.0) in thinned
