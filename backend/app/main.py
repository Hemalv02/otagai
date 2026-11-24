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
from app.routes.ai.route import router as ai_router
from app.routes.ask_sessions.route import router as ask_sessions_router
from app.routes.assistant.route import router as assistant_router
from app.routes.categories.route import router as categories_router
from app.routes.chat.route import (
    me_router as my_conversations_router,
)
from app.routes.chat.route import (
    router as conversations_router,
)
from app.routes.check_ins.route import router as check_in_settings_router
from app.routes.circles.route import (
    invites_router as circle_invites_router,
)
from app.routes.circles.route import (
    memberships_router,
)
from app.routes.circles.route import (
    router as circles_router,
)
from app.routes.coordinator.route import (
    circle_router as coordinator_router,
)
from app.routes.coordinator.route import (
    map_router,
)
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
from app.routes.exchanges.route import (
    checks_router as handover_checks_router,
)
from app.routes.exchanges.route import (
    extensions_router as loan_extensions_router,
)
from app.routes.exchanges.route import (
    me_router as my_exchanges_router,
)
from app.routes.exchanges.route import (
    router as exchanges_router,
)
from app.routes.home.route import router as home_router
from app.routes.listings.route import (
    me_router as my_listings_router,
)
from app.routes.listings.route import (
    router as listings_router,
)
from app.routes.media.route import router as media_router
from app.routes.notices.route import (
    circle_router as circle_notices_router,
)
from app.routes.notices.route import (
    router as notices_router,
)
from app.routes.notifications.route import router as notifications_router
from app.routes.payments.route import (
    me_router as my_payments_router,
)
from app.routes.payments.route import (
    router as payments_router,
)
from app.routes.payments.route import (
    webhooks_router,
)
from app.routes.relationships.route import (
    family_router,
    grants_router,
    managed_router,
    my_family_router,
    my_grants_router,
    neighbours_router,
)
from app.routes.requests.route import (
    me_requests_router,
    received_router,
)
from app.routes.requests.route import (
    router as requests_router,
)
from app.routes.safety.route import (
    blocks_router,
    circle_reports_router,
    my_reports_router,
    reports_router,
)
from app.routes.thanks.route import (
    circle_wall_router,
)
from app.routes.thanks.route import (
    me_router as my_thanks_router,
)
from app.routes.thanks.route import (
    router as thank_yous_router,
)
from app.routes.users.neighbours import router as user_profiles_router
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
UNEXPECTED_MESSAGE = "Something went wrong."


def service_error_response(error: ServiceError) -> JSONResponse:
    for error_type, status_code in ERROR_STATUSES:
        if isinstance(error, error_type):
            headers = None
            if isinstance(error, RetryLaterError) and error.retry_after_seconds:
                headers = {"Retry-After": str(error.retry_after_seconds)}
            return JSONResponse(
                status_code=status_code,
                content={"message": str(error), **getattr(error, "details", {})},
                headers=headers,
            )
    if isinstance(error, ServiceConfigurationError):
        logger.warning("Service not configured (%s)", type(error).__name__)
        return JSONResponse(status_code=503, content={"message": UNAVAILABLE_MESSAGE})
    logger.error("Unmapped service error (%s)", type(error).__name__)
    return JSONResponse(status_code=500, content={"message": UNEXPECTED_MESSAGE})


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
    app.state.settings = settings
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

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"message": UNEXPECTED_MESSAGE})

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
    app.include_router(media_router)
    app.include_router(circles_router)
    app.include_router(circle_invites_router)
    app.include_router(memberships_router)
    app.include_router(categories_router)
    app.include_router(listings_router)
    app.include_router(my_listings_router)
    app.include_router(requests_router)
    app.include_router(me_requests_router)
    app.include_router(received_router)
    app.include_router(exchanges_router)
    app.include_router(my_exchanges_router)
    app.include_router(loan_extensions_router)
    app.include_router(handover_checks_router)
    app.include_router(conversations_router)
    app.include_router(my_conversations_router)
    app.include_router(thank_yous_router)
    app.include_router(my_thanks_router)
    app.include_router(circle_wall_router)
    app.include_router(payments_router)
    app.include_router(my_payments_router)
    app.include_router(webhooks_router)
    app.include_router(notifications_router)
    app.include_router(blocks_router)
    app.include_router(reports_router)
    app.include_router(my_reports_router)
    app.include_router(circle_reports_router)
    app.include_router(neighbours_router)
    app.include_router(managed_router)
    app.include_router(family_router)
    app.include_router(my_family_router)
    app.include_router(grants_router)
    app.include_router(my_grants_router)
    app.include_router(home_router)
    app.include_router(ai_router)
    app.include_router(ask_sessions_router)
    app.include_router(assistant_router)
    app.include_router(coordinator_router)
    app.include_router(map_router)
    app.include_router(circle_notices_router)
    app.include_router(notices_router)
    app.include_router(circle_events_router)
    app.include_router(events_router)
    app.include_router(disaster_circle_router)
    app.include_router(disaster_alerts_router)
    app.include_router(check_in_settings_router)
    app.include_router(user_profiles_router)

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
                status_code=503, content={"message": UNAVAILABLE_MESSAGE}
            )
        return JSONResponse(content={"status": "ready", "checks": results})

    return app


app = create_app()
