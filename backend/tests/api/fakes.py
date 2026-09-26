from trips.routing.client import (
    LocationNotFoundError,
    Place,
    Route,
    RouteLeg,
    RoutingUnavailableError,
)

PLACES = {
    "Chicago, IL": Place("Chicago, IL", 41.8790, -87.6606),
    "Indianapolis, IN": Place("Indianapolis, IN", 39.7684, -86.1580),
    "Denver, CO": Place("Denver, CO", 39.7392, -104.9847),
}


class FakeRoutingClient:
    """Stands in for OpenRouteServiceClient: a straight-line route at 50 mph."""

    def __init__(self, reverse_geocode_fails: bool = False) -> None:
        self.reverse_geocode_fails = reverse_geocode_fails
        self.reverse_calls = 0

    def geocode(self, query: str) -> Place:
        if query not in PLACES:
            raise LocationNotFoundError(query)
        return PLACES[query]

    def autocomplete(self, query: str, limit: int = 6) -> list[Place]:
        return [p for label, p in PLACES.items() if label.lower().startswith(query.lower())]

    def reverse_geocode(self, lat: float, lon: float) -> str | None:
        self.reverse_calls += 1
        if self.reverse_geocode_fails:
            raise RoutingUnavailableError("down")
        return "Somewhere, KS"

    def truck_route(self, places: list[Place]) -> Route:
        coordinates = [(p.lon, p.lat) for p in places]
        legs = [RouteLeg(distance_miles=180, duration_seconds=180 / 50 * 3600)]
        legs.append(RouteLeg(distance_miles=1080, duration_seconds=1080 / 50 * 3600))
        return Route(coordinates=coordinates, legs=legs, waypoint_indices=[0, 1, 2])
