import ssl
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import URL, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.services.errors import ServiceConfigurationError
from app.settings import Settings


def database_url(settings: Settings, *, migration: bool = False) -> URL:
    host = settings.database_host
    port = settings.database_port
    if migration:
        host = settings.migration_database_host
        port = settings.migration_database_port
    if not host or not settings.postgres_password:
        raise ServiceConfigurationError("Configure the PostgreSQL connection.")
    return URL.create(
        "postgresql+asyncpg",
        username=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        host=host,
        port=port,
        database=settings.postgres_db,
    )


def ssl_option(settings: Settings) -> ssl.SSLContext | str | None:
    if settings.database_ssl_mode == "disable":
        return None
    if settings.database_ssl_mode == "require":
        return "require"
    context = ssl.create_default_context(cafile=str(settings.database_ssl_root_cert))
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return context


def prepared_statement_name() -> str:
    return f"__asyncpg_{uuid.uuid4().hex}__"


def create_engine(settings: Settings, *, migration: bool = False) -> AsyncEngine:
    connect_args: dict[str, Any] = {"timeout": 5}
    ssl_value = ssl_option(settings)
    if ssl_value is not None:
        connect_args["ssl"] = ssl_value
    if not migration:
        connect_args["prepared_statement_cache_size"] = 0
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_name_func"] = prepared_statement_name
    return create_async_engine(
        database_url(settings, migration=migration),
        poolclass=NullPool,
        connect_args=connect_args,
        hide_parameters=True,
    )


class Database:
    def __init__(self, settings: Settings) -> None:
        self.engine = create_engine(settings)
        self._sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._sessions.begin() as session:
            yield session

    async def check(self) -> None:
        async with self.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))

    async def close(self) -> None:
        await self.engine.dispose()
