"""Glue between the HTTP layer, the routing provider and the HOS engine."""

import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder

from trips.hos.logs import split_into_daily_logs
from trips.hos.models import DailyLog, Leg, TripPlan
from trips.hos.planner import plan_trip
from trips.routing.client import (
    LocationNotFoundError,
    OpenRouteServiceClient,
    Place,
    Route,
    RoutingUnavailableError,
)
from trips.routing.geometry import RouteLocator

REVERSE_GEOCODE_WORKERS = 6
_timezone_finder = TimezoneFinder()
# TimezoneFinder doesn't promise thread safety, and gunicorn runs threaded workers.
_timezone_lock = threading.Lock()


class LocationErrors(Exception):
    """One or more of the trip's locations could not be geocoded, keyed by input field."""

    def __init__(self, errors: dict[str, str]) -> None:
        super().__init__("We could not find one or more of the locations.")
        self.errors = errors


@dataclass(frozen=True)
class TripRequest:
    current_location: str
    pickup_location: str
    dropoff_location: str
    cycle_used_minutes: int
    # Wall-clock time at the current location; None means "now".
    start_time: datetime | None


@dataclass
class PlannedTrip:
    places: dict[str, Place]
    route: Route
    plan: TripPlan
    daily_logs: list[DailyLog]
    timezone_name: str
    cycle_used_minutes_at_start: int


def _geocode_all(client: OpenRouteServiceClient, request: TripRequest) -> dict[str, Place]:
    queries = {
        "current_location": request.current_location,
        "pickup_location": request.pickup_location,
        "dropoff_location": request.dropoff_location,
    }

    def geocode(field: str) -> tuple[str, Place | str]:
        try:
            return field, client.geocode(queries[field])
        except LocationNotFoundError as exc:
            return field, str(exc)

    with ThreadPoolExecutor(max_workers=len(queries)) as pool:
        results = dict(pool.map(geocode, queries))

    errors = {field: result for field, result in results.items() if isinstance(result, str)}
    if errors:
        raise LocationErrors(errors)
    return {field: result for field, result in results.items() if isinstance(result, Place)}


def _home_terminal_timezone(place: Place) -> ZoneInfo:
    with _timezone_lock:
        name = _timezone_finder.timezone_at(lng=place.lon, lat=place.lat)
    return ZoneInfo(name or "UTC")


def _start_time(requested: datetime | None, zone: ZoneInfo) -> datetime:
    if requested is None:
        now = datetime.now(zone)
        requested = (now + timedelta(minutes=-now.minute % 15)).replace(second=0, microsecond=0)
    elif requested.tzinfo is None:
        requested = requested.replace(tzinfo=zone)
    else:
        requested = requested.astimezone(zone)

    # Log sheets run midnight to midnight on the home terminal's clock. Freezing the offset in
    # effect at departure keeps every sheet exactly 24 hours, even across a DST change.
    return requested.astimezone(timezone(requested.utcoffset(), requested.tzname()))


def _label_locations(client: OpenRouteServiceClient, trip: PlannedTrip) -> None:
    """Names every place the logs mention: stops, duty changes, and where each day starts/ends."""
    route = trip.route
    leg_miles = [leg.distance_miles for leg in route.legs]
    known_labels = {
        0.0: trip.places["current_location"].label,
        round(leg_miles[0], 3): trip.places["pickup_location"].label,
        round(trip.plan.segments[-1].end_mile, 3): trip.places["dropoff_location"].label,
    }

    log_segments = [segment for log in trip.daily_logs for segment in log.segments]
    miles = {round(s.start_mile, 3) for s in [*trip.plan.segments, *log_segments]}
    miles |= {round(log.end_mile, 3) for log in trip.daily_logs}
    miles |= {round(stop.mile, 3) for stop in trip.plan.stops}
    locator = RouteLocator(route.coordinates, route.waypoint_indices, leg_miles)
    coordinates = {mile: locator.point_at(mile) for mile in miles}
    # Once the provider fails (usually the daily quota), the other lookups would fail the same
    # way, each after a round trip. Skip them and use coordinates for the rest of this plan.
    provider_down = threading.Event()

    def label_for(mile: float) -> tuple[float, str]:
        if mile in known_labels:
            return mile, known_labels[mile]
        lon, lat = coordinates[mile]
        label = None
        if not provider_down.is_set():
            try:
                label = client.reverse_geocode(lat, lon)
            except RoutingUnavailableError:
                provider_down.set()
        return mile, label or f"{lat:.3f}, {lon:.3f}"

    with ThreadPoolExecutor(max_workers=REVERSE_GEOCODE_WORKERS) as pool:
        labels = dict(pool.map(label_for, sorted(miles)))

    def label_at(mile: float) -> str:
        return labels[round(mile, 3)]

    for segment in [*trip.plan.segments, *log_segments]:
        segment.location = label_at(segment.start_mile)
    for log in trip.daily_logs:
        for remark in log.remarks:
            remark.location = label_at(remark.mile)
        log.from_location = label_at(log.start_mile)
        log.to_location = label_at(log.end_mile)
    for stop in trip.plan.stops:
        stop.location = label_at(stop.mile)
        lon, lat = coordinates[round(stop.mile, 3)]
        stop.coordinates = (lat, lon)


def plan(client: OpenRouteServiceClient, request: TripRequest) -> PlannedTrip:
    places = _geocode_all(client, request)
    zone = _home_terminal_timezone(places["current_location"])
    start_time = _start_time(request.start_time, zone)

    route = client.truck_route(
        [places["current_location"], places["pickup_location"], places["dropoff_location"]]
    )
    to_pickup, to_dropoff = (
        Leg(distance_miles=leg.distance_miles, drive_minutes=round(leg.duration_seconds / 60))
        for leg in route.legs
    )
    trip_plan = plan_trip(to_pickup, to_dropoff, start_time, request.cycle_used_minutes)

    trip = PlannedTrip(
        places=places,
        route=route,
        plan=trip_plan,
        daily_logs=split_into_daily_logs(trip_plan.segments, request.cycle_used_minutes),
        timezone_name=zone.key,
        cycle_used_minutes_at_start=request.cycle_used_minutes,
    )
    _label_locations(client, trip)
    return trip
