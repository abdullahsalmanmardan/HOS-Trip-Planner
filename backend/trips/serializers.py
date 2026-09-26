from datetime import datetime
from decimal import Decimal
from typing import Any

from rest_framework import serializers

from trips.hos import rules
from trips.hos.models import DailyLog, DutySegment, DutyStatus, Stop, StopType
from trips.routing.geometry import simplify
from trips.services import PlannedTrip, TripRequest

MAX_ROUTE_POINTS = 1500

STOP_LABELS = {
    StopType.START: "Start",
    StopType.PICKUP: "Pickup",
    StopType.DROPOFF: "Dropoff",
    StopType.FUEL: "Fuel stop",
    StopType.BREAK: "30-minute break",
    StopType.REST: "10-hour rest",
    StopType.RESTART: "34-hour restart",
}


class LocalDateTimeField(serializers.DateTimeField):
    """Keeps a naive datetime naive: it is wall-clock time at the trip's current location,
    whose timezone isn't known until that location is geocoded."""

    def enforce_timezone(self, value: datetime) -> datetime:
        return value


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=200, trim_whitespace=True)
    pickup_location = serializers.CharField(max_length=200, trim_whitespace=True)
    dropoff_location = serializers.CharField(max_length=200, trim_whitespace=True)
    current_cycle_used_hours = serializers.DecimalField(
        max_digits=4,
        decimal_places=2,
        min_value=Decimal(0),
        max_value=Decimal(rules.CYCLE_LIMIT_MINUTES // 60),
    )
    start_time = LocalDateTimeField(required=False, allow_null=True)

    def to_trip_request(self) -> TripRequest:
        data = self.validated_data
        return TripRequest(
            current_location=data["current_location"],
            pickup_location=data["pickup_location"],
            dropoff_location=data["dropoff_location"],
            cycle_used_minutes=round(data["current_cycle_used_hours"] * 60),
            start_time=data.get("start_time"),
        )


class GeocodeSearchSerializer(serializers.Serializer):
    q = serializers.CharField(max_length=200, trim_whitespace=True)


class ReverseGeocodeSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="minutes")


def _minute_of_day(moment: datetime, log: DailyLog) -> int:
    return round(
        (moment - datetime.combine(log.date, datetime.min.time(), moment.tzinfo)).total_seconds()
        / 60
    )


def _segment(segment: DutySegment, log: DailyLog) -> dict[str, Any]:
    return {
        "status": segment.status.value,
        "start": _iso(segment.start),
        "end": _iso(segment.end),
        "start_minute": _minute_of_day(segment.start, log),
        "end_minute": _minute_of_day(segment.end, log),
        "location": segment.location,
        "note": segment.note,
    }


def _daily_log(log: DailyLog) -> dict[str, Any]:
    return {
        "date": log.date.isoformat(),
        "from_location": log.from_location,
        "to_location": log.to_location,
        "total_miles": round(log.miles_driven, 1),
        "totals_minutes": {status.value: minutes for status, minutes in log.totals.items()},
        "segments": [_segment(segment, log) for segment in log.segments],
        "remarks": [
            {
                "time": _iso(remark.time),
                "minute": _minute_of_day(remark.time, log),
                "location": remark.location,
                "note": remark.note,
                "status": remark.status.value,
            }
            for remark in log.remarks
        ],
        "on_duty_minutes": log.on_duty_minutes,
        "cycle_used_minutes": log.cycle_used_minutes_at_end,
        "cycle_available_minutes": max(
            0, rules.CYCLE_LIMIT_MINUTES - log.cycle_used_minutes_at_end
        ),
    }


def _stop(stop: Stop) -> dict[str, Any]:
    lat, lon = stop.coordinates or (None, None)
    return {
        "type": stop.type.value,
        "label": STOP_LABELS[stop.type],
        "note": stop.note,
        "location": stop.location,
        "lat": lat,
        "lon": lon,
        "arrival": _iso(stop.start),
        "departure": _iso(stop.end),
        "duration_minutes": stop.minutes,
        "mile": round(stop.mile, 1),
    }


def serialize_trip(trip: PlannedTrip) -> dict[str, Any]:
    route, plan = trip.route, trip.plan
    coordinates = simplify(route.coordinates, MAX_ROUTE_POINTS, keep=set(route.waypoint_indices))
    return {
        "summary": {
            "total_distance_miles": round(route.distance_miles, 1),
            "total_drive_minutes": sum(
                s.minutes for s in plan.segments if s.status == DutyStatus.DRIVING
            ),
            "total_trip_minutes": round((plan.end - plan.start).total_seconds() / 60),
            "start": _iso(plan.start),
            "end": _iso(plan.end),
            "timezone": trip.timezone_name,
            "timezone_abbreviation": plan.start.tzname(),
            "cycle_used_minutes_at_start": trip.cycle_used_minutes_at_start,
            "cycle_used_minutes_at_end": plan.cycle_used_minutes_at_end,
            "day_count": len(trip.daily_logs),
        },
        "locations": {
            field.removesuffix("_location"): {
                "label": place.label,
                "lat": place.lat,
                "lon": place.lon,
            }
            for field, place in trip.places.items()
        },
        "route": {
            "type": "LineString",
            "coordinates": [[round(lon, 5), round(lat, 5)] for lon, lat in coordinates],
        },
        "stops": [_stop(stop) for stop in plan.stops],
        "daily_logs": [_daily_log(log) for log in trip.daily_logs],
    }
