from app.main import service_error_response
from app.services.errors import (
    BadRequestError,
    ConflictError,
    ContentTooLargeError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
    ServiceConfigurationError,
    UnsupportedMediaTypeError,
    UpstreamUnavailableError,
)


def test_error_classes_map_to_status_codes():
    cases = {
        BadRequestError("x"): 400,
        PermissionDeniedError("x"): 403,
        NotFoundError("x"): 404,
        ConflictError("x"): 409,
        ContentTooLargeError("x"): 413,
        UnsupportedMediaTypeError("x"): 415,
        RateLimitedError("x"): 429,
        UpstreamUnavailableError("x"): 503,
    }
    for error, status_code in cases.items():
        response = service_error_response(error)
        assert response.status_code == status_code


def test_rate_limited_sets_retry_after():
    response = service_error_response(
        RateLimitedError("slow down", retry_after_seconds=30)
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"


def test_configuration_error_is_503_generic():
    response = service_error_response(ServiceConfigurationError("missing key"))
    assert response.status_code == 503


def test_messages_are_not_leaked_for_configuration_error():
    body = service_error_response(ServiceConfigurationError("secret detail")).body
    assert b"secret detail" not in body
