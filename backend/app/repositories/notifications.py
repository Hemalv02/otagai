import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Notification
from app.repositories.pagination import PageRequest, PageResult, paginate


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, user_id: uuid.UUID, notification_type: str, payload: dict[str, Any]
    ) -> Notification:
        notification = Notification(
            user_id=user_id, type=notification_type, payload=payload
        )
        self._session.add(notification)
        await self._session.flush()
        await self._session.refresh(notification)
        return notification

    async def create_many(
        self,
        user_ids: list[uuid.UUID],
        notification_type: str,
        payload: dict[str, Any],
    ) -> list[Notification]:
        notifications = [
            Notification(user_id=user_id, type=notification_type, payload=payload)
            for user_id in user_ids
        ]
        self._session.add_all(notifications)
        await self._session.flush()
        return notifications

    async def get_owned(
        self, notification_id: uuid.UUID, user_id: uuid.UUID
    ) -> Notification | None:
        notification = await self._session.get(Notification, notification_id)
        if notification is None or notification.user_id != user_id:
            return None
        return notification

    async def list_for_user(
        self, user_id: uuid.UUID, page: PageRequest, *, unread_only: bool = False
    ) -> PageResult[Notification]:
        statement = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            statement = statement.where(Notification.read_at.is_(None))
        return await paginate(
            self._session, statement, page, Notification.created_at, Notification.id
        )

    async def mark_read(
        self, notification: Notification, when: datetime
    ) -> Notification:
        if notification.read_at is None:
            notification.read_at = when
            await self._session.flush()
            await self._session.refresh(notification)
        return notification

    async def mark_all_read(self, user_id: uuid.UUID, when: datetime) -> None:
        await self._session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=when)
        )

    async def unread_count(self, user_id: uuid.UUID) -> int:
        statement = select(func.count()).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
        return await self._session.scalar(statement) or 0
