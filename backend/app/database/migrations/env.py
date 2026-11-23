import asyncio

from alembic import context
from sqlalchemy.engine import Connection

from app.database.connection import create_engine, database_url
from app.database.models import Base
from app.settings import get_settings


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    if type_ == "table":
        return name in Base.metadata.tables
    return True


def run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        include_name=include_name,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def migrate_online() -> None:
    engine = create_engine(get_settings(), migration=True)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(run_migrations)
    finally:
        await engine.dispose()


if context.is_offline_mode():
    context.configure(
        url=database_url(get_settings(), migration=True),
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(migrate_online())
