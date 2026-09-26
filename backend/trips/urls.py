from django.urls import path

from trips import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("trips/plan/", views.plan_trip, name="plan-trip"),
    path("geocode/search/", views.geocode_search, name="geocode-search"),
    path("geocode/reverse/", views.reverse_geocode, name="reverse-geocode"),
]
