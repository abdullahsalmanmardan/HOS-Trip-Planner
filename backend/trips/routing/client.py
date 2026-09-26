"""A thin OpenRouteService client: geocoding, autocomplete, reverse geocoding and truck routing."""

import hashlib
import re
from dataclasses import dataclass
from typing import Any, NoReturn

import requests
from django.conf import settings
from django.core.cache import cache

BASE_URL = "https://api.openrouteservice.org"
# Short enough that a slow provider can't push a plan past the worker timeout.
TIMEOUT_SECONDS = 10
# Hours of Service is a US regulation, so searches are limited to the US.
COUNTRY = "US"
CACHE_SECONDS = 60 * 60 * 24 * 7
# Enough nearby features that one of them usually has a town as its parent.
REVERSE_GEOCODE_CANDIDATES = 10

# How long to stop calling an endpoint after it says no. Quotas reset daily; rechecking every
# quarter hour costs one request.
RATE_LIMIT_BACKOFF_SECONDS = 60
QUOTA_BACKOFF_SECONDS = 15 * 60
RATE_LIMITED_MESSAGE = "The routing service is busy right now. Please try again in a minute."
QUOTA_EXCEEDED_MESSAGE = (
    "The routing service's daily limit has been reached. Please try again tomorrow."
)

# https://giscience.github.io/openrouteservice/api-reference/error-codes
ORS_NO_ROUTABLE_POINT = 2010
ORS_ROUTE_NOT_FOUND = 2009
ORS_LIMITS_EXCEEDED = 2004


class RoutingError(Exception):
    """Base class for anything that goes wrong talking to the routing provider."""


class LocationNotFoundError(RoutingError):
    def __init__(self, query: str) -> None:
        super().__init__(f'We could not find "{query}". Try adding a city and state.')
        self.query = query


class RouteNotFoundError(RoutingError):
    pass


class RoutingUnavailableError(RoutingError):
    pass


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float


@dataclass(frozen=True)
class RouteLeg:
    distance_miles: float
    duration_seconds: float


@dataclass(frozen=True)
class Route:
    # GeoJSON order: (lon, lat).
    coordinates: list[tuple[float, float]]
    legs: list[RouteLeg]
    # Index into `coordinates` of each waypoint, so legs can be located on the line.
    waypoint_indices: list[int]

    @property
    def distance_miles(self) -> float:
        return sum(leg.distance_miles for leg in self.legs)

    @property
    def duration_seconds(self) -> float:
        return sum(leg.duration_seconds for leg in self.legs)


def _remark_label(candidates: list[dict[str, Any]]) -> str:
    for properties in candidates:
        town = properties.get("locality") or properties.get("localadmin")
        if town and properties.get("region_a"):
            return f"{town}, {properties['region_a']}"
    for properties in candidates:
        county, state = properties.get("county"), properties.get("region_a")
        if county and state:
            road = properties.get("street") or (
                properties.get("name") if properties.get("layer") == "street" else None
            )
            return f"{road}, {county}, {state}" if road else f"{county}, {state}"
    return ""


# "41.8781, -87.6298": what "Use my location" fills in when it can't name the place.
_COORDINATES = re.compile(r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$")


def _parse_coordinates(query: str) -> Place | None:
    match = _COORDINATES.match(query)
    if not match:
        return None
    lat, lon = float(match[1]), float(match[2])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return Place(label=f"{lat:.4f}, {lon:.4f}", lat=lat, lon=lon)


def _short_label(label: str) -> str:
    return label.removesuffix(", USA")


def _cache_key(*parts: object) -> str:
    digest = hashlib.sha256(repr(parts).encode()).hexdigest()[:32]
    return f"ors:{parts[0]}:{digest}"


class OpenRouteServiceClient:
    def __init__(self, api_key: str, session: requests.Session | None = None) -> None:
        self.api_key = api_key
        self.session = session or requests.Session()

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.api_key:
            raise RoutingUnavailableError("Routing is not configured on the server.")
        # ORS meters each endpoint separately; while one is out of quota, fail fast instead of
        # spending a round trip on an answer we already know.
        blocked_key = _cache_key("blocked", path)
        if (blocked_message := cache.get(blocked_key)) is not None:
            raise RoutingUnavailableError(blocked_message)
        try:
            response = self.session.request(
                method,
                f"{BASE_URL}{path}",
                headers={"Authorization": self.api_key},
                timeout=TIMEOUT_SECONDS,
                **kwargs,
            )
        except requests.RequestException as exc:
            raise RoutingUnavailableError(
                "The routing service did not respond. Please try again."
            ) from exc

        if response.ok:
            return response.json()

        error = self._error_body(response)
        if response.status_code == 429:
            self._block(blocked_key, RATE_LIMIT_BACKOFF_SECONDS, RATE_LIMITED_MESSAGE)
        if response.status_code == 403 and "quota" in str(error.get("message", "")).lower():
            self._block(blocked_key, QUOTA_BACKOFF_SECONDS, QUOTA_EXCEEDED_MESSAGE)
        code = error.get("code")
        if code == ORS_NO_ROUTABLE_POINT:
            raise RouteNotFoundError("One of the locations is too far from a road a truck can use.")
        if code == ORS_LIMITS_EXCEEDED:
            raise RouteNotFoundError("This trip is longer than the routing service supports.")
        if code == ORS_ROUTE_NOT_FOUND:
            raise RouteNotFoundError("No truck route connects these locations.")
        raise RoutingUnavailableError(
            f"The routing service returned an error (HTTP {response.status_code})."
        )

    @staticmethod
    def _block(key: str, seconds: int, message: str) -> NoReturn:
        cache.set(key, message, seconds)
        raise RoutingUnavailableError(message)

    @staticmethod
    def _error_body(response: requests.Response) -> dict[str, Any]:
        try:
            error = response.json().get("error", {})
        except ValueError:
            return {}
        return error if isinstance(error, dict) else {"message": error}

    def geocode(self, query: str) -> Place:
        if (place := _parse_coordinates(query)) is not None:
            return place

        key = _cache_key("geocode", query.strip().lower())
        if (cached := cache.get(key)) is not None:
            return cached

        data = self._request(
            "GET",
            "/geocode/search",
            params={"text": query, "size": 1, "boundary.country": COUNTRY},
        )
        features = data.get("features") or []
        if not features:
            raise LocationNotFoundError(query)
        place = self._place_from_feature(features[0])
        cache.set(key, place, CACHE_SECONDS)
        return place

    def autocomplete(self, query: str, limit: int = 6) -> list[Place]:
        key = _cache_key("autocomplete", query.strip().lower(), limit)
        if (cached := cache.get(key)) is not None:
            return cached

        data = self._request(
            "GET",
            "/geocode/autocomplete",
            params={"text": query, "size": limit, "boundary.country": COUNTRY},
        )
        places = [self._place_from_feature(feature) for feature in data.get("features") or []]
        cache.set(key, places, CACHE_SECONDS)
        return places

    def reverse_geocode(self, lat: float, lon: float) -> str | None:
        """Names a point the way the guide asks remarks to: "City, ST" when a town is close.

        Out on the highway there often isn't one, so fall back to the road and county
        ("Route 66, Quay County, NM"), which is still something an inspector can place.
        """
        # ~100 m of rounding keeps nearby stops on the same cache entry.
        lat, lon = round(lat, 3), round(lon, 3)
        key = _cache_key("reverse", lat, lon)
        if (cached := cache.get(key)) is not None:
            return cached or None

        data = self._request(
            "GET",
            "/geocode/reverse",
            params={
                "point.lat": lat,
                "point.lon": lon,
                "size": REVERSE_GEOCODE_CANDIDATES,
                "boundary.country": COUNTRY,
            },
        )
        label = _remark_label([feature["properties"] for feature in data.get("features") or []])
        cache.set(key, label, CACHE_SECONDS)
        return label or None

    def truck_route(self, places: list[Place]) -> Route:
        key = _cache_key("route", tuple((p.lon, p.lat) for p in places))
        if (cached := cache.get(key)) is not None:
            return cached

        data = self._request(
            "POST",
            "/v2/directions/driving-hgv/geojson",
            json={"coordinates": [[p.lon, p.lat] for p in places], "units": "mi"},
        )
        feature = data["features"][0]
        properties = feature["properties"]
        legs = [
            RouteLeg(
                distance_miles=segment.get("distance", 0.0),
                duration_seconds=segment.get("duration", 0.0),
            )
            for segment in properties["segments"]
        ]
        route = Route(
            coordinates=[(lon, lat) for lon, lat, *_ in feature["geometry"]["coordinates"]],
            legs=legs,
            waypoint_indices=properties["way_points"],
        )
        cache.set(key, route, CACHE_SECONDS)
        return route

    @staticmethod
    def _place_from_feature(feature: dict[str, Any]) -> Place:
        lon, lat = feature["geometry"]["coordinates"][:2]
        return Place(label=_short_label(feature["properties"]["label"]), lat=lat, lon=lon)


def get_client() -> OpenRouteServiceClient:
    return OpenRouteServiceClient(settings.ORS_API_KEY)
