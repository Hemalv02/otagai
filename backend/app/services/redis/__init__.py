from redis.asyncio import Redis

from app.services.errors import ServiceConfigurationError
from app.settings import Settings


def create_redis(settings: Settings, *, database: int | None = None) -> Redis:
    if not settings.redis_host or not settings.redis_password:
        raise ServiceConfigurationError("Configure the Redis connection.")
    return Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        db=settings.redis_db if database is None else database,
        password=settings.redis_password.get_secret_value(),
        decode_responses=True,
        socket_timeout=5,
        socket_connect_timeout=3,
    )
