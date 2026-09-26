"""Every error leaves the API as {"error": {"code", "message", "fields"}}."""

from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


def error_response(
    code: str, message: str, http_status: int, fields: dict[str, list[str]] | None = None
) -> Response:
    return Response(
        {"error": {"code": code, "message": message, "fields": fields or {}}}, status=http_status
    )


def _flatten(detail: Any) -> list[str]:
    if isinstance(detail, list):
        return [str(item) for item in detail]
    return [str(detail)]


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ValidationError) and isinstance(exc.detail, dict):
        fields = {field: _flatten(detail) for field, detail in exc.detail.items()}
        return error_response(
            "invalid", "Some of the trip details need fixing.", status.HTTP_400_BAD_REQUEST, fields
        )

    code = exc.default_code if isinstance(exc, APIException) else "error"
    message = str(getattr(exc, "detail", "")) or "Something went wrong."
    return error_response(code, message, response.status_code)
