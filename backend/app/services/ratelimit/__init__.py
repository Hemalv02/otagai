import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.services.errors import RateLimitedError


async def enforce(
    redis: Redis | None,
    *,
    scope: str,
    user_id: uuid.UUID,
    limit: int,
    window_seconds: int,
) -> None:
    if redis is None:
        return
    key = f"otagai:ratelimit:{scope}:{user_id}"
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window_seconds)
        if count > limit:
            ttl = await redis.ttl(key)
            raise RateLimitedError(
                "You're doing that too often. Try again soon.",
                retry_after_seconds=ttl if ttl and ttl > 0 else window_seconds,
            )
    except RedisError:
        return
