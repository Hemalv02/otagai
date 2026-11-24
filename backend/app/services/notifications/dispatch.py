import asyncio
import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import ARRAY, Uuid, cast, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import Database
from app.database.models import (
    HelpRequest,
    Notification,
    PushDelivery,
    PushToken,
    RequestRecipient,
    User,
)
from app.database.models.enums import (
    NotificationType,
    Platform,
    Region,
    RequestStatus,
    UserStatus,
)
from app.repositories.blocks import BlockRepository
from app.services.notifications.service import (
    PushDeliveryError,
    PushDeviceNotRegisteredError,
    PushMessage,
    PushRateExceededError,
    PushUnavailableError,
    check_push_receipt,
    quiet_until,
    send_push,
)
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

_TYPES = {NotificationType.REQUEST_DIRECT, NotificationType.REQUEST_NEARBY}
_REQUEST_PUSH_BODY = {
    "ja": "新しいお願いが届きました。",
    "en": "You have a new request.",
    "bn": "আপনার কাছে একটি নতুন অনুরোধ এসেছে।",
}
_RECEIPT_DELAY = timedelta(minutes=15)
_RECEIPT_WINDOW = timedelta(hours=24)
_SEND_ATTEMPTS = 5


async def enqueue_ripple_push(
    session: AsyncSession, notifications: Sequence[Notification]
) -> None:
    ids = [
        notification.id for notification in notifications if notification.type in _TYPES
    ]
    if not ids:
        return
    ordered = (
        func.unnest(cast(ids, ARRAY(Uuid)))
        .table_valued("notification_id", with_ordinality="position")
        .render_derived()
    )
    available_at = func.now() + (ordered.c.position - 1) * timedelta(microseconds=1)
    devices = (
        select(Notification.id, PushToken.id, available_at)
        .select_from(ordered)
        .join(Notification, Notification.id == ordered.c.notification_id)
        .join(User, User.id == Notification.user_id)
        .join(PushToken, PushToken.user_id == User.id)
        .where(
            User.status == UserStatus.ACTIVE,
            User.push_enabled.is_(True),
            PushToken.disabled_at.is_(None),
        )
    )
    await session.execute(
        insert(PushDelivery)
        .from_select(["notification_id", "push_token_id", "available_at"], devices)
        .on_conflict_do_nothing(index_elements=["notification_id", "push_token_id"])
    )


def _finish(delivery: PushDelivery, now: datetime, error: str | None = None) -> None:
    delivery.finished_at = now
    delivery.last_error = error


def _retry_send(delivery: PushDelivery, now: datetime) -> None:
    delivery.last_error = "provider_unavailable"
    if delivery.attempts >= _SEND_ATTEMPTS:
        _finish(delivery, now, delivery.last_error)
        return
    delivery.available_at = now + timedelta(minutes=2 ** (delivery.attempts - 1))


def _disable_device(token: PushToken, attempted_at: datetime, now: datetime) -> None:
    if token.last_seen_at is None or token.last_seen_at <= attempted_at:
        token.disabled_at = now


async def _eligible_request(
    session: AsyncSession, notification: Notification, now: datetime
) -> HelpRequest | None:
    try:
        request_id = uuid.UUID(str(notification.payload["request_id"]))
    except (KeyError, ValueError):
        return None
    request = await session.scalar(
        select(HelpRequest)
        .join(RequestRecipient, RequestRecipient.request_id == HelpRequest.id)
        .where(
            HelpRequest.id == request_id,
            HelpRequest.status == RequestStatus.OPEN,
            HelpRequest.expires_at > now,
            RequestRecipient.user_id == notification.user_id,
            RequestRecipient.hidden_at.is_(None),
        )
    )
    if request is not None and await BlockRepository(session).is_blocked_either_way(
        request.requester_user_id, notification.user_id
    ):
        return None
    return request


def _recipient_timezone(user: User) -> tzinfo:
    try:
        return ZoneInfo(user.timezone)
    except (ValueError, ZoneInfoNotFoundError):
        # The supported regions currently use UTC+06:00 and UTC+09:00.
        return timezone(timedelta(hours=6 if user.region == Region.BD else 9))


async def _send_notification(
    session: AsyncSession,
    settings: Settings,
    delivery: PushDelivery,
    notification: Notification,
    token: PushToken,
    now: datetime,
) -> None:
    user = await session.get(User, notification.user_id)
    if (
        user is None
        or not user.push_enabled
        or user.status != UserStatus.ACTIVE
        or token.disabled_at is not None
    ):
        _finish(delivery, now, "push_disabled")
        return
    request = await _eligible_request(session, notification, now)
    if request is None:
        _finish(delivery, now, "request_unavailable")
        return
    deferred_at = quiet_until(
        now, _recipient_timezone(user), user.quiet_hours_start, user.quiet_hours_end
    )
    if deferred_at is not None:
        if deferred_at >= request.expires_at:
            _finish(delivery, now, "request_expires_during_quiet_hours")
        else:
            delivery.available_at = deferred_at
        return

    message = PushMessage(
        to=token.expo_token,
        title="Otagai",
        body=_REQUEST_PUSH_BODY.get(user.preferred_language, _REQUEST_PUSH_BODY["en"]),
        data={
            "type": notification.type,
            "request_id": str(request.id),
            "notification_id": str(notification.id),
        },
        ttl=max(1, int((request.expires_at - now).total_seconds())),
        channel_id="requests" if token.platform == Platform.ANDROID else None,
    )
    delivery.attempts += 1
    try:
        delivery.ticket_id = await send_push(settings, message)
    except PushDeviceNotRegisteredError:
        _disable_device(token, now, now)
        _finish(delivery, now, "device_not_registered")
    except PushUnavailableError:
        _retry_send(delivery, now)
    except PushDeliveryError:
        _finish(delivery, now, "provider_rejected")
    else:
        delivery.ticket_created_at = now
        delivery.available_at = now + _RECEIPT_DELAY
        delivery.last_error = None


async def _check_receipt(
    session: AsyncSession,
    settings: Settings,
    delivery: PushDelivery,
    token: PushToken,
    now: datetime,
) -> None:
    ticket_id = delivery.ticket_id
    attempted_at = delivery.ticket_created_at
    if (
        ticket_id is None
        or attempted_at is None
        or now >= attempted_at + _RECEIPT_WINDOW
    ):
        _finish(delivery, now, "receipt_missing")
        return
    try:
        accepted = await check_push_receipt(settings, ticket_id)
    except PushDeviceNotRegisteredError:
        _disable_device(token, attempted_at, now)
        _finish(delivery, now, "device_not_registered")
        return
    except PushRateExceededError:
        # Expo explicitly rejected the earlier ticket instead of accepting it.
        delivery.ticket_id = None
        delivery.ticket_created_at = None
        _retry_send(delivery, now)
        return
    except PushUnavailableError:
        delivery.last_error = "provider_unavailable"
        accepted = False
    except PushDeliveryError:
        _finish(delivery, now, "provider_rejected")
        return
    if not accepted:
        delivery.available_at = min(
            now + _RECEIPT_DELAY, attempted_at + _RECEIPT_WINDOW
        )
        return

    await session.execute(
        update(Notification)
        .where(
            Notification.id == delivery.notification_id,
            Notification.pushed_at.is_(None),
        )
        .values(pushed_at=now)
    )
    _finish(delivery, now)


async def dispatch_next(
    database: Database, settings: Settings, *, now: datetime | None = None
) -> bool:
    async with database.session() as session:
        cutoff = now or datetime.now(UTC)
        delivery = await session.scalar(
            select(PushDelivery)
            .where(
                PushDelivery.finished_at.is_(None), PushDelivery.available_at <= cutoff
            )
            .order_by(PushDelivery.available_at, PushDelivery.notification_id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if delivery is None:
            return False

        notification = await session.get(Notification, delivery.notification_id)
        token = await session.get(
            PushToken, delivery.push_token_id, with_for_update=True
        )
        current = now or datetime.now(UTC)
        # A token can be removed, or registered by another account on the same device.
        if (
            notification is None
            or token is None
            or token.user_id != notification.user_id
        ):
            _finish(delivery, current, "device_unavailable")
        elif delivery.ticket_id is not None:
            await _check_receipt(session, settings, delivery, token, current)
        else:
            await _send_notification(
                session, settings, delivery, notification, token, current
            )
    return True


async def run() -> None:
    settings = get_settings()
    database = Database(settings)
    logger.info("Ripple push dispatcher started")
    try:
        while True:
            try:
                if await dispatch_next(database, settings):
                    continue
            except SQLAlchemyError as error:
                logger.error("Push dispatch database error (%s)", type(error).__name__)
            await asyncio.sleep(2)
    finally:
        await database.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
