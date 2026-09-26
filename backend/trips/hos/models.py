from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum


class DutyStatus(StrEnum):
    OFF_DUTY = "off_duty"
    SLEEPER = "sleeper"
    DRIVING = "driving"
    ON_DUTY = "on_duty"


class StopType(StrEnum):
    START = "start"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    FUEL = "fuel"
    BREAK = "break"
    REST = "rest"
    RESTART = "restart"


@dataclass(frozen=True)
class Leg:
    distance_miles: float
    drive_minutes: int


@dataclass
class DutySegment:
    status: DutyStatus
    start: datetime
    end: datetime
    start_mile: float
    end_mile: float
    note: str = ""
    location: str = ""

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)

    @property
    def miles(self) -> float:
        return self.end_mile - self.start_mile


@dataclass
class Stop:
    type: StopType
    start: datetime
    end: datetime
    mile: float
    note: str
    location: str = ""
    coordinates: tuple[float, float] | None = None

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


@dataclass
class TripPlan:
    segments: list[DutySegment]
    stops: list[Stop]
    cycle_used_minutes_at_end: int

    @property
    def start(self) -> datetime:
        return self.segments[0].start

    @property
    def end(self) -> datetime:
        return self.segments[-1].end


@dataclass
class Remark:
    time: datetime
    mile: float
    location: str
    note: str
    status: DutyStatus


@dataclass
class DailyLog:
    date: date
    segments: list[DutySegment]
    totals: dict[DutyStatus, int]
    miles_driven: float
    remarks: list[Remark] = field(default_factory=list)
    on_duty_minutes: int = 0
    cycle_used_minutes_at_end: int = 0
    from_location: str = ""
    to_location: str = ""

    @property
    def start_mile(self) -> float:
        return self.segments[0].start_mile

    @property
    def end_mile(self) -> float:
        return self.segments[-1].end_mile
