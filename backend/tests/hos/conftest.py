from datetime import datetime, timedelta, timezone

import pytest

CENTRAL = timezone(timedelta(hours=-5))


@pytest.fixture
def start_time() -> datetime:
    return datetime(2026, 9, 25, 8, 0, tzinfo=CENTRAL)
