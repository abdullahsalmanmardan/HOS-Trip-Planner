from typing import Any

import pytest
import requests

from trips.routing.client import (
    LocationNotFoundError,
    OpenRouteServiceClient,
    Place,
    RouteNotFoundError,
    RoutingUnavailableError,
)


class FakeResponse:
    def __init__(self, status_code: int, body: Any) -> None:
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._body = body

    def json(self) -> Any:
        return self._body


class FakeSession:
    def __init__(self, *responses: FakeResponse | Exception) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append((method, url, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def feature(label: str, lon: float, lat: float, **properties: Any) -> dict[str, Any]:
    return {
        "geometry": {"coordinates": [lon, lat]},
        "properties": {"label": label, **properties},
    }


def client(*responses: FakeResponse | Exception) -> tuple[OpenRouteServiceClient, FakeSession]:
    session = FakeSession(*responses)
    return OpenRouteServiceClient("test-key", session=session), session


def test_geocode_returns_the_top_hit_and_caches_it() -> None:
    ors, session = client(
        FakeResponse(200, {"features": [feature("Chicago, IL, USA", -87.66, 41.88)]})
    )

    assert ors.geocode("Chicago") == Place("Chicago, IL", 41.88, -87.66)
    assert ors.geocode(" chicago ") == Place("Chicago, IL", 41.88, -87.66)
    assert len(session.calls) == 1
    _, url, kwargs = session.calls[0]
    assert url.endswith("/geocode/search")
    assert kwargs["params"]["boundary.country"] == "US"
    assert kwargs["headers"] == {"Authorization": "test-key"}


def test_geocode_without_results_raises_location_not_found() -> None:
    ors, _ = client(FakeResponse(200, {"features": []}))

    with pytest.raises(LocationNotFoundError, match="Atlantis"):
        ors.geocode("Atlantis")


def test_reverse_geocode_uses_the_town_of_a_nearby_street() -> None:
    ors, session = client(
        FakeResponse(
            200,
            {
                "features": [
                    feature("x", 0, 0, layer="street", name="Route 66", county="Quay County"),
                    feature(
                        "x",
                        0,
                        0,
                        layer="street",
                        name="Main St",
                        locality="Tucumcari",
                        county="Quay County",
                        region_a="NM",
                    ),
                ]
            },
        )
    )

    assert ors.reverse_geocode(35.17, -103.72) == "Tucumcari, NM"
    assert session.calls[0][2]["params"]["size"] == 10


def test_reverse_geocode_falls_back_to_road_and_county_between_towns() -> None:
    ors, _ = client(
        FakeResponse(
            200,
            {
                "features": [
                    feature(
                        "x",
                        0,
                        0,
                        layer="street",
                        name="Route 66",
                        county="Quay County",
                        region_a="NM",
                    ),
                ]
            },
        )
    )

    assert ors.reverse_geocode(35.0, -104.0) == "Route 66, Quay County, NM"


def test_reverse_geocode_with_nothing_nearby_is_none_and_cached() -> None:
    ors, session = client(FakeResponse(200, {"features": []}))

    assert ors.reverse_geocode(40.0, -100.0) is None
    assert ors.reverse_geocode(40.0001, -100.0001) is None
    assert len(session.calls) == 1


def test_truck_route_reads_legs_and_waypoints() -> None:
    body = {
        "features": [
            {
                "geometry": {"coordinates": [[-87.6, 41.8], [-86.1, 39.7], [-104.9, 39.7]]},
                "properties": {
                    "segments": [
                        {"distance": 185.7, "duration": 16810.0},
                        {"distance": 1085.8, "duration": 91123.8},
                    ],
                    "way_points": [0, 1, 2],
                },
            }
        ]
    }
    ors, session = client(FakeResponse(200, body))

    route = ors.truck_route([Place("a", 41.8, -87.6), Place("b", 39.7, -86.1)])

    assert route.distance_miles == pytest.approx(1271.5)
    assert route.waypoint_indices == [0, 1, 2]
    method, url, kwargs = session.calls[0]
    assert (method, url.rsplit("/", 2)[-2]) == ("POST", "driving-hgv")
    assert kwargs["json"]["units"] == "mi"


@pytest.mark.parametrize(
    ("status", "body", "error"),
    [
        (404, {"error": {"code": 2010, "message": "no point"}}, RouteNotFoundError),
        (400, {"error": {"code": 2004, "message": "too long"}}, RouteNotFoundError),
        (404, {"error": {"code": 2009, "message": "no route"}}, RouteNotFoundError),
        (429, {"error": "Rate limit exceeded"}, RoutingUnavailableError),
        (500, {}, RoutingUnavailableError),
        (403, {"error": "Access to this API has been disallowed"}, RoutingUnavailableError),
    ],
)
def test_http_errors_map_to_our_exceptions(status: int, body: Any, error: type) -> None:
    ors, _ = client(FakeResponse(status, body))

    with pytest.raises(error):
        ors.truck_route([Place("a", 0, 0), Place("b", 1, 1)])


def test_network_failure_is_routing_unavailable() -> None:
    ors, _ = client(requests.ConnectionError("boom"))

    with pytest.raises(RoutingUnavailableError):
        ors.geocode("Chicago")


def test_missing_api_key_is_routing_unavailable() -> None:
    with pytest.raises(RoutingUnavailableError, match="not configured"):
        OpenRouteServiceClient("", session=FakeSession()).geocode("Chicago")


def test_exhausted_quota_says_so() -> None:
    ors, _ = client(FakeResponse(403, {"error": "Quota exceeded"}))

    with pytest.raises(RoutingUnavailableError, match="daily limit"):
        ors.reverse_geocode(40.0, -100.0)


def test_exhausted_quota_short_circuits_that_endpoint_only() -> None:
    ors, session = client(
        FakeResponse(403, {"error": "Quota exceeded"}),
        FakeResponse(200, {"features": [feature("Chicago, IL, USA", -87.66, 41.88)]}),
    )

    with pytest.raises(RoutingUnavailableError):
        ors.reverse_geocode(40.0, -100.0)
    with pytest.raises(RoutingUnavailableError, match="daily limit"):
        ors.reverse_geocode(41.0, -101.0)

    # The second reverse lookup never left the process; search still works.
    assert ors.geocode("Chicago").label == "Chicago, IL"
    assert len(session.calls) == 2


def test_rate_limit_backs_off() -> None:
    ors, session = client(FakeResponse(429, {"error": "Rate limit exceeded"}))

    for _ in range(2):
        with pytest.raises(RoutingUnavailableError, match="busy"):
            ors.geocode("Chicago")

    assert len(session.calls) == 1


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("41.8781, -87.6298", Place("41.8781, -87.6298", 41.8781, -87.6298)),
        ("  39.74,-104.99 ", Place("39.7400, -104.9900", 39.74, -104.99)),
    ],
)
def test_coordinates_are_used_as_is_without_a_request(query: str, expected: Place) -> None:
    ors, session = client()

    assert ors.geocode(query) == expected
    assert session.calls == []


def test_out_of_range_coordinates_are_searched_as_text() -> None:
    ors, session = client(FakeResponse(200, {"features": []}))

    with pytest.raises(LocationNotFoundError):
        ors.geocode("95, 200")
    assert len(session.calls) == 1
