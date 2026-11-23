import uuid
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Notification, User
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.services.errors import NotFoundError


class NotificationNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Notification not found.")


async def list_notifications(
    database: Database, user: User, page: PageRequest
) -> PageResult[Notification]:
    async with database.session() as session:
        return await NotificationRepository(session).list_for_user(user.id, page)


async def mark_notification_read(
    database: Database, user: User, notification_id: uuid.UUID
) -> Notification:
    async with database.session() as session:
        repository = NotificationRepository(session)
        notification = await repository.get_owned(notification_id, user.id)
        if notification is None:
            raise NotificationNotFoundError
        return await repository.mark_read(notification, datetime.now(UTC))


async def mark_all_read(database: Database, user: User) -> None:
    async with database.session() as session:
        await NotificationRepository(session).mark_all_read(user.id, datetime.now(UTC))
