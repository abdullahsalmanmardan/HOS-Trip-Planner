"""Builds a Hours of Service compliant duty schedule for a pickup-and-dropoff trip.

The planner walks the trip minute-accurately, tracking the same clocks an inspector would check:
the 11-hour and 14-hour limits, the 8-hour break rule, the 70-hour cycle and fuel range. Before
every stretch of driving it works out which limit will bind first, drives up to that point, and
then takes whatever stop clears it.

Resets are derived from what was logged rather than from which helper was called: any 10
consecutive hours off duty or in the sleeper berth resets the shift, any 30 consecutive
non-driving minutes satisfy the break rule, and 34 consecutive hours off resets the cycle.
"""

import math
from datetime import datetime, timedelta

from trips.hos import rules
from trips.hos.models import DutySegment, DutyStatus, Leg, Stop, StopType, TripPlan

OFF_STATUSES = (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER)


class _Planner:
    def __init__(self, start_time: datetime, cycle_used_minutes: int) -> None:
        self.start_time = start_time
        self.segments: list[DutySegment] = []
        self.stops: list[Stop] = []

        self.now = 0
        self.mile = 0.0
        self.cycle_used = cycle_used_minutes
        self.miles_since_fuel = 0.0
        # The planner assumes the driver starts the trip rested, with a fresh 11/14-hour shift.
        self.shift_started_at: int | None = None
        self.driving_in_shift = 0
        self.driving_since_break = 0
        self.non_driving_streak = 0
        self.off_duty_streak = 0

    # Bookkeeping

    def _at(self, minute: int) -> datetime:
        return self.start_time + timedelta(minutes=minute)

    def _log(self, status: DutyStatus, minutes: int, note: str, miles: float = 0.0) -> None:
        if minutes <= 0:
            return

        previous = self.segments[-1] if self.segments else None
        if previous and previous.status == status and previous.note == note:
            previous.end = self._at(self.now + minutes)
            previous.end_mile = self.mile + miles
        else:
            self.segments.append(
                DutySegment(
                    status=status,
                    start=self._at(self.now),
                    end=self._at(self.now + minutes),
                    start_mile=self.mile,
                    end_mile=self.mile + miles,
                    note=note,
                )
            )

        if status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY) and self.shift_started_at is None:
            self.shift_started_at = self.now

        self.now += minutes
        self.mile += miles

        if status == DutyStatus.DRIVING:
            self.driving_in_shift += minutes
            self.driving_since_break += minutes
            self.miles_since_fuel += miles
            self.cycle_used += minutes
            self.non_driving_streak = 0
            self.off_duty_streak = 0
            return

        # 395.3(a)(3)(ii): any 30 consecutive non-driving minutes count as the break.
        self.non_driving_streak += minutes
        if self.non_driving_streak >= rules.MIN_BREAK_MINUTES:
            self.driving_since_break = 0

        if status == DutyStatus.ON_DUTY:
            self.cycle_used += minutes
            self.off_duty_streak = 0
            return

        self.off_duty_streak += minutes
        # 395.3(a)(1): 10 consecutive hours off resets the 11- and 14-hour clocks.
        if self.off_duty_streak >= rules.DAILY_RESET_MINUTES:
            self.shift_started_at = None
            self.driving_in_shift = 0
        # 395.3(c): 34 consecutive hours off restarts the 70-hour cycle.
        if self.off_duty_streak >= rules.CYCLE_RESTART_MINUTES:
            self.cycle_used = 0

    def _stop(self, stop_type: StopType, status: DutyStatus, minutes: int, note: str) -> None:
        start = self.now
        self._log(status, minutes, note)
        self.stops.append(
            Stop(
                type=stop_type,
                start=self._at(start),
                end=self._at(self.now),
                mile=self.mile,
                note=note,
            )
        )

    # Remaining allowances

    def _window_remaining(self) -> int:
        if self.shift_started_at is None:
            return rules.DUTY_WINDOW_MINUTES
        return rules.DUTY_WINDOW_MINUTES - (self.now - self.shift_started_at)

    def _shift_driving_remaining(self) -> int:
        return min(
            rules.MAX_DRIVING_MINUTES - self.driving_in_shift,
            self._window_remaining(),
        )

    def _cycle_remaining(self) -> int:
        return rules.CYCLE_LIMIT_MINUTES - self.cycle_used

    def _fuel_range_minutes(self, miles_per_minute: float) -> int:
        remaining_miles = rules.MAX_MILES_BETWEEN_FUEL - self.miles_since_fuel
        return math.floor(remaining_miles / miles_per_minute)

    def _drivable_minutes(self, miles_per_minute: float) -> int:
        return min(
            self._shift_driving_remaining(),
            rules.MAX_DRIVING_WITHOUT_BREAK_MINUTES - self.driving_since_break,
            self._cycle_remaining(),
            self._fuel_range_minutes(miles_per_minute),
        )

    # Stops

    def _begin_shift_if_needed(self) -> None:
        if self.shift_started_at is None:
            self._log(DutyStatus.ON_DUTY, rules.PRE_TRIP_INSPECTION_MINUTES, "Pre-trip inspection")

    # TODO: offer the 7/3 and 8/2 split sleeper berth pairings from 395.1(g) as an alternative.
    def _take_daily_rest(self) -> None:
        # If the next shift couldn't fit any driving under the cycle, a 10-hour rest would only
        # be followed by a 34-hour restart anyway. Take the restart now; it also resets the shift.
        if self._cycle_remaining() <= rules.PRE_TRIP_INSPECTION_MINUTES:
            self._take_restart()
            return
        self._stop(StopType.REST, DutyStatus.SLEEPER, rules.DAILY_RESET_MINUTES, "10-hour rest")

    def _take_restart(self) -> None:
        self._stop(
            StopType.RESTART,
            DutyStatus.OFF_DUTY,
            rules.CYCLE_RESTART_MINUTES,
            "34-hour restart",
        )

    def _fuel_is_due_soon(self) -> bool:
        remaining_miles = rules.MAX_MILES_BETWEEN_FUEL - self.miles_since_fuel
        return remaining_miles <= rules.FUEL_DURING_BREAK_WITHIN_MILES

    def _take_fuel_stop(self) -> None:
        self._stop(StopType.FUEL, DutyStatus.ON_DUTY, rules.FUEL_STOP_MINUTES, "Fuel")
        self.miles_since_fuel = 0.0

    def _prepare_to_drive(self, miles_per_minute: float) -> None:
        """Takes stops until at least one minute of legal driving is available."""
        while True:
            if self._cycle_remaining() <= 0:
                self._take_restart()
            elif self.shift_started_at is not None and self._shift_driving_remaining() <= 0:
                self._take_daily_rest()
            elif self.shift_started_at is None:
                if self._cycle_remaining() <= rules.PRE_TRIP_INSPECTION_MINUTES:
                    self._take_restart()
                else:
                    self._begin_shift_if_needed()
            elif self.driving_since_break >= rules.MAX_DRIVING_WITHOUT_BREAK_MINUTES:
                # A break that would leave no time in the window is wasted; rest instead.
                if self._window_remaining() <= rules.MIN_BREAK_MINUTES:
                    self._take_daily_rest()
                elif self._fuel_is_due_soon():
                    self._take_fuel_stop()
                else:
                    self._stop(
                        StopType.BREAK,
                        DutyStatus.OFF_DUTY,
                        rules.MIN_BREAK_MINUTES,
                        "30-minute break",
                    )
            elif self._fuel_range_minutes(miles_per_minute) <= 0:
                self._take_fuel_stop()
            else:
                return

    def drive(self, leg: Leg, note: str) -> None:
        if leg.drive_minutes <= 0:
            self.mile += leg.distance_miles
            return

        miles_per_minute = leg.distance_miles / leg.drive_minutes
        remaining_minutes = leg.drive_minutes
        remaining_miles = leg.distance_miles
        while remaining_minutes > 0:
            self._prepare_to_drive(miles_per_minute)
            chunk = min(remaining_minutes, self._drivable_minutes(miles_per_minute))
            # The last chunk takes the exact remaining miles so rounding never drifts the total.
            miles = remaining_miles if chunk == remaining_minutes else chunk * miles_per_minute
            self._log(DutyStatus.DRIVING, chunk, note, miles)
            remaining_minutes -= chunk
            remaining_miles -= miles

    def begin_trip(self) -> None:
        if self._cycle_remaining() <= rules.PRE_TRIP_INSPECTION_MINUTES:
            self._take_restart()
        departure_prep_start = self.now
        self._begin_shift_if_needed()
        self.stops.append(
            Stop(
                type=StopType.START,
                start=self._at(departure_prep_start),
                end=self._at(self.now),
                mile=self.mile,
                note="Pre-trip inspection",
            )
        )

    def pickup(self) -> None:
        self._begin_shift_if_needed()
        self._stop(StopType.PICKUP, DutyStatus.ON_DUTY, rules.PICKUP_MINUTES, "Pickup")

    def finish_trip(self) -> None:
        self._begin_shift_if_needed()
        self._stop(StopType.DROPOFF, DutyStatus.ON_DUTY, rules.DROPOFF_MINUTES, "Dropoff")
        self._log(DutyStatus.ON_DUTY, rules.POST_TRIP_INSPECTION_MINUTES, "Post-trip inspection")
        self.stops[-1].end = self._at(self.now)


def plan_trip(
    to_pickup: Leg,
    to_dropoff: Leg,
    start_time: datetime,
    cycle_used_minutes: int,
) -> TripPlan:
    """Plans current location -> pickup -> dropoff.

    `start_time` must be timezone-aware; every timestamp in the plan shares its tzinfo.
    """
    planner = _Planner(start_time, cycle_used_minutes)
    planner.begin_trip()
    planner.drive(to_pickup, "Driving to pickup")
    planner.pickup()
    planner.drive(to_dropoff, "Driving to dropoff")
    planner.finish_trip()

    return TripPlan(
        segments=planner.segments,
        stops=planner.stops,
        cycle_used_minutes_at_end=planner.cycle_used,
    )
