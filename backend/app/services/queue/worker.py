import asyncio
import logging
from uuid import uuid4

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from dramatiq.middleware import AsyncIO
from redis.exceptions import AuthenticationError, RedisError
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.services.errors import ServiceConfigurationError, ServiceError
from app.services.notifications.service import (
    PushDeliveryError,
    PushMessage,
    PushUnavailableError,
    send_push,
)
from app.services.redis import create_redis
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)


def create_broker(settings: Settings) -> RedisBroker:
    if not settings.redis_host or not settings.redis_password:
        raise ServiceConfigurationError("Configure Redis for the job queue.")
    broker = RedisBroker(
        host=settings.redis_host,
        port=settings.redis_port,
        password=settings.redis_password.get_secret_value(),
        db=settings.queue_redis_db,
        namespace="otagai",
        socket_timeout=5,
        socket_connect_timeout=3,
    )
    broker.add_middleware(AsyncIO())
    return broker


broker = create_broker(get_settings())
dramatiq.set_broker(broker)


def retry_push(retries: int, error: BaseException) -> bool:
    return (
        retries < 2
        and isinstance(
            error, (PushUnavailableError, RedisConnectionError, RedisTimeoutError)
        )
        and not isinstance(error, AuthenticationError)
    )


@dramatiq.actor(
    queue_name="notifications",
    min_backoff=2000,
    max_backoff=10000,
    retry_when=retry_push,
)
async def deliver_push(payload_key: str) -> None:
    settings = get_settings()
    async with create_redis(settings, database=settings.queue_redis_db) as redis:
        payload = await redis.get(payload_key)
        if payload is None:
            raise PushDeliveryError("The queued notification has expired.")
        await send_push(settings, PushMessage.model_validate_json(payload))
        try:
            await redis.delete(payload_key)
        except RedisError:
            logger.warning("Could not remove a delivered notification payload.")


class QueueError(ServiceError):
    pass


async def enqueue_push(message: PushMessage, *, delay_ms: int | None = None) -> str:
    if delay_ms is not None and not 0 <= delay_ms < 7 * 24 * 60 * 60 * 1000:
        raise QueueError("Use a notification delay of less than seven days.")
    settings = get_settings()
    payload_key = f"otagai:push:{uuid4().hex}"
    ttl = 24 * 60 * 60 + (delay_ms or 0) // 1000
    try:
        async with create_redis(settings, database=settings.queue_redis_db) as redis:
            await redis.set(payload_key, message.model_dump_json(), ex=ttl)
        job = await asyncio.to_thread(
            deliver_push.send_with_options,
            args=(payload_key,),
            delay=delay_ms,
        )
    except (RedisError, dramatiq.errors.ConnectionClosed) as error:
        raise QueueError("Could not queue the notification.") from error
    return job.message_id
