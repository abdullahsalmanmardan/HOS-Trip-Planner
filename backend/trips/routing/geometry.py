import math
from bisect import bisect_right
from itertools import accumulate, pairwise

EARTH_RADIUS_MILES = 3958.8

Coordinate = tuple[float, float]  # (lon, lat)


def haversine_miles(a: Coordinate, b: Coordinate) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


class RouteLocator:
    """Finds points a given number of road-miles along a route.

    Cumulative distances along the polyline are computed once, so each lookup is a binary
    search rather than a walk over thousands of points. The routed distance of each leg is
    spread over that leg's slice of the line, so points land on the drawn route even though
    straight-line and road distances differ slightly.
    """

    def __init__(
        self,
        coordinates: list[Coordinate],
        waypoint_indices: list[int],
        leg_miles: list[float],
    ) -> None:
        self.coordinates = coordinates
        self.waypoint_indices = waypoint_indices
        self.leg_miles = leg_miles
        self.cumulative = [
            0.0,
            *accumulate(haversine_miles(a, b) for a, b in pairwise(coordinates)),
        ]

    def point_at(self, mile: float) -> Coordinate:
        leg_start_mile = 0.0
        for leg_index, leg_length in enumerate(self.leg_miles):
            is_last_leg = leg_index == len(self.leg_miles) - 1
            if mile <= leg_start_mile + leg_length or is_last_leg:
                fraction = 0.0 if leg_length == 0 else (mile - leg_start_mile) / leg_length
                return self._point_in_slice(
                    self.waypoint_indices[leg_index],
                    self.waypoint_indices[leg_index + 1],
                    max(0.0, min(1.0, fraction)),
                )
            leg_start_mile += leg_length
        return self.coordinates[-1]

    def _point_in_slice(self, start: int, end: int, fraction: float) -> Coordinate:
        if start == end:
            return self.coordinates[start]
        target = self.cumulative[start] + fraction * (self.cumulative[end] - self.cumulative[start])
        index = min(max(bisect_right(self.cumulative, target, start, end + 1), start + 1), end)
        segment_start = self.cumulative[index - 1]
        segment_length = self.cumulative[index] - segment_start
        t = 0.0 if segment_length == 0 else (target - segment_start) / segment_length
        (lon1, lat1), (lon2, lat2) = self.coordinates[index - 1], self.coordinates[index]
        return (lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t)


def simplify(coordinates: list[Coordinate], max_points: int, keep: set[int]) -> list[Coordinate]:
    """Evenly thins a polyline for display, always keeping the indices in `keep`."""
    if len(coordinates) <= max_points:
        return coordinates
    step = math.ceil(len(coordinates) / max_points)
    last = len(coordinates) - 1
    return [c for i, c in enumerate(coordinates) if i % step == 0 or i in keep or i == last]
