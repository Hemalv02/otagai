class ServiceError(Exception):
    pass


class ServiceConfigurationError(ServiceError):
    pass


class BadRequestError(ServiceError):
    pass


class NotFoundError(ServiceError):
    pass


class PermissionDeniedError(ServiceError):
    pass


class ConflictError(ServiceError):
    pass


class ContentTooLargeError(ServiceError):
    pass


class UnsupportedMediaTypeError(ServiceError):
    pass


class RetryLaterError(ServiceError):
    def __init__(self, message: str, *, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class RateLimitedError(RetryLaterError):
    pass


class UpstreamUnavailableError(RetryLaterError):
    pass
