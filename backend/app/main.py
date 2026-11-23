import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AsyncExitStack, asynccontextmanager

from asyncpg import PostgresError
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError

from app.database.connection import Database
from app.routes.check_ins.route import router as check_in_settings_router
from app.routes.disaster.route import (
    circle_router as disaster_circle_router,
)
from app.routes.disaster.route import (
    router as disaster_alerts_router,
)
from app.routes.events.route import (
    circle_router as circle_events_router,
)
from app.routes.events.route import (
    router as events_router,
)
from app.routes.notices.route import (
    circle_router as circle_notices_router,
)
from app.routes.notices.route import (
    router as notices_router,
)
from app.routes.users.route import router as users_router
from app.services.auth.service import TokenVerifier
from app.services.errors import (
    BadRequestError,
    ConflictError,
    ContentTooLargeError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
    RetryLaterError,
    ServiceConfigurationError,
    ServiceError,
    UnsupportedMediaTypeError,
    UpstreamUnavailableError,
)
from app.services.redis import create_redis
from app.services.storage.service import Storage
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)


ERROR_STATUSES: tuple[tuple[type[ServiceError], int], ...] = (
    (BadRequestError, 400),
    (PermissionDeniedError, 403),
    (NotFoundError, 404),
    (ConflictError, 409),
    (ContentTooLargeError, 413),
    (UnsupportedMediaTypeError, 415),
    (RateLimitedError, 429),
    (UpstreamUnavailableError, 503),
)
UNAVAILABLE_MESSAGE = "A backend dependency is unavailable."


def service_error_response(error: ServiceError) -> JSONResponse:
    for error_type, status_code in ERROR_STATUSES:
        if isinstance(error, error_type):
            headers = None
            if isinstance(error, RetryLaterError) and error.retry_after_seconds:
                headers = {"Retry-After": str(error.retry_after_seconds)}
            return JSONResponse(
                status_code=status_code,
                content={"message": str(error)},
                headers=headers,
            )
    if isinstance(error, ServiceConfigurationError):
        logger.warning("Service not configured (%s)", type(error).__name__)
        return JSONResponse(status_code=503, content={"message": UNAVAILABLE_MESSAGE})
    logger.error("Unmapped service error (%s)", type(error).__name__)
    return JSONResponse(status_code=500, content={"message": "Something went wrong."})


async def check_service(
    name: str, check: Callable[[], Awaitable[object]]
) -> tuple[str, bool]:
    try:
        result = await asyncio.wait_for(check(), timeout=4)
    except (OSError, PostgresError, SQLAlchemyError, RedisError, ServiceError) as error:
        logger.warning("Readiness failed for %s (%s)", name, type(error).__name__)
        return name, False
    return name, result is not False


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with AsyncExitStack() as stack:
            checks = {}
            if settings.database_host:
                database = Database(settings)
                stack.push_async_callback(database.close)
                app.state.database = database
                checks["database"] = database.check
            if settings.redis_host:
                redis = create_redis(settings)
                stack.push_async_callback(redis.aclose)
                app.state.redis = redis
                checks["redis"] = redis.ping
            if settings.s3_bucket:
                storage = await stack.enter_async_context(Storage.open(settings))
                if settings.s3_create_bucket:
                    await storage.ensure_bucket()
                app.state.storage = storage
                checks["storage"] = storage.check
            if settings.supabase_url:
                app.state.token_verifier = TokenVerifier.from_settings(settings)
            app.state.readiness_checks = checks
            yield

    app = FastAPI(title="Otagai API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={"message": str(error.detail)},
            headers=error.headers,
        )

    @app.exception_handler(ServiceError)
    async def service_error(request: Request, error: ServiceError) -> JSONResponse:
        return service_error_response(error)

    @app.exception_handler(RequestValidationError)
    async def validation_error(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "message": "The request is invalid.",
                "errors": [
                    {
                        "field": ".".join(str(part) for part in item["loc"][1:]),
                        "message": item["msg"],
                    }
                    for item in error.errors()
                ],
            },
        )

    app.include_router(users_router)
    app.include_router(circle_notices_router)
    app.include_router(notices_router)
    app.include_router(circle_events_router)
    app.include_router(events_router)
    app.include_router(disaster_circle_router)
    app.include_router(disaster_alerts_router)
    app.include_router(check_in_settings_router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready(request: Request) -> JSONResponse:
        results = dict(
            await asyncio.gather(
                *(
                    check_service(name, check)
                    for name, check in request.app.state.readiness_checks.items()
                )
            )
        )
        if not all(results.values()):
            return JSONResponse(
                status_code=503,
                content={"message": "A backend dependency is unavailable."},
            )
        return JSONResponse(content={"status": "ready", "checks": results})

    return app


app = create_app()
