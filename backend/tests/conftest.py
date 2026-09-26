import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolated_cache(settings) -> None:
    # The real cache is a file cache shared across runs; tests get a fresh in-memory one.
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    cache.clear()


@pytest.fixture(autouse=True)
def _allow_test_host(settings) -> None:
    settings.ALLOWED_HOSTS = ["testserver"]
