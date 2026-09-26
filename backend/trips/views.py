from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from trips import services
from trips.exceptions import error_response
from trips.routing.client import RouteNotFoundError, RoutingUnavailableError, get_client
from trips.serializers import (
    GeocodeSearchSerializer,
    ReverseGeocodeSerializer,
    TripPlanRequestSerializer,
    serialize_trip,
)

MIN_SEARCH_LENGTH = 3


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


@api_view(["POST"])
def plan_trip(request: Request) -> Response:
    serializer = TripPlanRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        trip = services.plan(get_client(), serializer.to_trip_request())
    except services.LocationErrors as exc:
        return error_response(
            "location_not_found",
            str(exc),
            status.HTTP_400_BAD_REQUEST,
            {field: [message] for field, message in exc.errors.items()},
        )
    except RouteNotFoundError as exc:
        return error_response("route_not_found", str(exc), status.HTTP_422_UNPROCESSABLE_ENTITY)
    except RoutingUnavailableError as exc:
        return error_response("routing_unavailable", str(exc), status.HTTP_502_BAD_GATEWAY)

    return Response(serialize_trip(trip))


@api_view(["GET"])
def geocode_search(request: Request) -> Response:
    serializer = GeocodeSearchSerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    query = serializer.validated_data["q"]
    if len(query) < MIN_SEARCH_LENGTH:
        return Response({"results": []})

    try:
        places = get_client().autocomplete(query)
    except RoutingUnavailableError as exc:
        return error_response("routing_unavailable", str(exc), status.HTTP_502_BAD_GATEWAY)

    return Response({"results": [{"label": p.label, "lat": p.lat, "lon": p.lon} for p in places]})


@api_view(["GET"])
def reverse_geocode(request: Request) -> Response:
    """Names the browser's position for "Use my location"; label is null if there's no name."""
    serializer = ReverseGeocodeSerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    lat, lon = serializer.validated_data["lat"], serializer.validated_data["lon"]

    try:
        label = get_client().reverse_geocode(lat, lon)
    except RoutingUnavailableError:
        label = None

    return Response({"label": label, "lat": lat, "lon": lon})
