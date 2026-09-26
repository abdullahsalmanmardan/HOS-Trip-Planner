from rest_framework.test import APIClient

from .fakes import FakeRoutingClient


def search(query: str) -> tuple[int, dict]:
    response = APIClient().get("/api/geocode/search/", {"q": query})
    return response.status_code, response.json()


def test_returns_matching_places(monkeypatch) -> None:
    monkeypatch.setattr("trips.views.get_client", FakeRoutingClient)

    status, body = search("Den")

    assert status == 200
    assert body["results"] == [{"label": "Denver, CO", "lat": 39.7392, "lon": -104.9847}]


def test_short_queries_return_nothing_without_calling_the_provider(monkeypatch) -> None:
    def fail():
        raise AssertionError("provider should not be called")

    monkeypatch.setattr("trips.views.get_client", fail)

    assert search("De") == (200, {"results": []})


def test_query_is_required() -> None:
    response = APIClient().get("/api/geocode/search/")

    assert response.status_code == 400
    assert "q" in response.json()["error"]["fields"]


def test_reverse_names_a_position(monkeypatch) -> None:
    monkeypatch.setattr("trips.views.get_client", FakeRoutingClient)

    response = APIClient().get("/api/geocode/reverse/", {"lat": 41.88, "lon": -87.63})

    assert response.status_code == 200
    assert response.json() == {"label": "Somewhere, KS", "lat": 41.88, "lon": -87.63}


def test_reverse_returns_no_label_when_the_provider_is_down(monkeypatch) -> None:
    monkeypatch.setattr("trips.views.get_client", lambda: FakeRoutingClient(True))

    response = APIClient().get("/api/geocode/reverse/", {"lat": 41.88, "lon": -87.63})

    assert response.status_code == 200
    assert response.json()["label"] is None


def test_reverse_rejects_impossible_coordinates() -> None:
    response = APIClient().get("/api/geocode/reverse/", {"lat": 120, "lon": -87.63})

    assert response.status_code == 400
    assert "lat" in response.json()["error"]["fields"]
