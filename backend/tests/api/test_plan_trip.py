import itertools
from datetime import datetime

import pytest
from rest_framework.test import APIClient

from trips.routing.client import RouteNotFoundError, RoutingUnavailableError

from .fakes import FakeRoutingClient

URL = "/api/trips/plan/"
VALID_TRIP = {
    "current_location": "Chicago, IL",
    "pickup_location": "Indianapolis, IN",
    "dropoff_location": "Denver, CO",
    "current_cycle_used_hours": 20,
    "start_time": "2026-09-26T08:00",
}


@pytest.fixture
def routing(monkeypatch) -> FakeRoutingClient:
    fake = FakeRoutingClient()
    monkeypatch.setattr("trips.views.get_client", lambda: fake)
    return fake


def post(payload: dict) -> tuple[int, dict]:
    response = APIClient().post(URL, payload, format="json")
    return response.status_code, response.json()


def test_plans_a_trip(routing: FakeRoutingClient) -> None:
    status, body = post(VALID_TRIP)

    assert status == 200
    summary = body["summary"]
    assert summary["total_distance_miles"] == 1260
    assert summary["timezone"] == "America/Chicago"
    assert summary["start"] == "2026-09-26T08:00-05:00"
    assert summary["day_count"] == len(body["daily_logs"]) >= 2
    assert body["route"]["type"] == "LineString"
    assert body["locations"]["pickup"]["label"] == "Indianapolis, IN"

    stop_types = [stop["type"] for stop in body["stops"]]
    assert stop_types[:2] == ["start", "pickup"] and stop_types[-1] == "dropoff"
    assert "rest" in stop_types
    assert all(stop["lat"] is not None for stop in body["stops"])

    for log in body["daily_logs"]:
        assert sum(log["totals_minutes"].values()) == 24 * 60
        assert log["segments"][0]["start_minute"] == 0
        assert log["segments"][-1]["end_minute"] == 24 * 60


def test_timestamps_carry_the_home_terminal_offset(routing: FakeRoutingClient) -> None:
    _, body = post(VALID_TRIP)

    for stop in body["stops"]:
        assert datetime.fromisoformat(stop["arrival"]).utcoffset().total_seconds() == -5 * 3600


def test_known_endpoints_are_labelled_without_reverse_geocoding(
    routing: FakeRoutingClient,
) -> None:
    _, body = post(VALID_TRIP)

    labels = {stop["type"]: stop["location"] for stop in body["stops"]}
    assert labels["start"] == "Chicago, IL"
    assert labels["pickup"] == "Indianapolis, IN"
    assert labels["dropoff"] == "Denver, CO"
    assert labels["rest"] == "Somewhere, KS"


def test_falls_back_to_coordinates_when_reverse_geocoding_fails(monkeypatch) -> None:
    monkeypatch.setattr("trips.views.get_client", lambda: FakeRoutingClient(True))

    status, body = post(VALID_TRIP)

    assert status == 200
    rest = next(stop for stop in body["stops"] if stop["type"] == "rest")
    assert rest["location"] == f"{rest['lat']:.3f}, {rest['lon']:.3f}"


def test_start_time_defaults_to_the_next_quarter_hour(routing: FakeRoutingClient) -> None:
    _, body = post({k: v for k, v in VALID_TRIP.items() if k != "start_time"})

    start = datetime.fromisoformat(body["summary"]["start"])
    assert start.minute % 15 == 0


@pytest.mark.parametrize("hours", [-1, 70.5, "lots"])
def test_rejects_cycle_hours_outside_0_to_70(routing: FakeRoutingClient, hours) -> None:
    status, body = post({**VALID_TRIP, "current_cycle_used_hours": hours})

    assert status == 400
    assert body["error"]["code"] == "invalid"
    assert "current_cycle_used_hours" in body["error"]["fields"]


def test_reports_missing_fields(routing: FakeRoutingClient) -> None:
    status, body = post({})

    assert status == 400
    assert set(body["error"]["fields"]) == {
        "current_location",
        "pickup_location",
        "dropoff_location",
        "current_cycle_used_hours",
    }


def test_unknown_location_is_a_field_error(routing: FakeRoutingClient) -> None:
    status, body = post({**VALID_TRIP, "pickup_location": "Atlantis"})

    assert status == 400
    assert body["error"]["code"] == "location_not_found"
    assert body["error"]["fields"] == {
        "pickup_location": ['We could not find "Atlantis". Try adding a city and state.']
    }


def test_unroutable_trip_is_422(monkeypatch, routing: FakeRoutingClient) -> None:
    def no_route(places):
        raise RouteNotFoundError("No truck route connects these locations.")

    monkeypatch.setattr(routing, "truck_route", no_route)
    status, body = post(VALID_TRIP)

    assert status == 422
    assert body["error"] == {
        "code": "route_not_found",
        "message": "No truck route connects these locations.",
        "fields": {},
    }


def test_routing_outage_is_502(monkeypatch, routing: FakeRoutingClient) -> None:
    def outage(places):
        raise RoutingUnavailableError("The routing service did not respond. Please try again.")

    monkeypatch.setattr(routing, "truck_route", outage)
    status, body = post(VALID_TRIP)

    assert status == 502
    assert body["error"]["code"] == "routing_unavailable"


def test_each_day_starts_where_the_previous_day_ended(routing: FakeRoutingClient) -> None:
    _, body = post(VALID_TRIP)
    logs = body["daily_logs"]

    assert logs[0]["from_location"] == "Chicago, IL"
    assert logs[-1]["to_location"] == "Denver, CO"
    for previous, current in itertools.pairwise(logs):
        assert current["from_location"] == previous["to_location"]
        assert current["segments"][0]["location"] == current["from_location"]


def test_stops_reverse_geocoding_after_the_provider_fails(monkeypatch) -> None:
    fake = FakeRoutingClient(reverse_geocode_fails=True)
    monkeypatch.setattr("trips.views.get_client", lambda: fake)
    # One lookup at a time, so nothing is already in flight when the first one fails.
    monkeypatch.setattr("trips.services.REVERSE_GEOCODE_WORKERS", 1)

    status, body = post(VALID_TRIP)

    assert status == 200
    assert fake.reverse_calls == 1
    assert sum(stop["type"] == "rest" for stop in body["stops"]) >= 2
