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
from app.routes.users.route import router as users_router
from app.services.auth.service import TokenVerifier
from app.services.errors import ServiceError
from app.services.redis import create_redis
from app.services.storage.service import Storage
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)


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
