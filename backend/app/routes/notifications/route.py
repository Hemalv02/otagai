import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, ConfigDict

from app.database.models import Notification
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.notifications.feed import (
    list_notifications,
    mark_all_read,
    mark_notification_read,
)

router = APIRouter(prefix="/users/me/notifications", tags=["notifications"])


class NotificationModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime


def notification_model(notification: Notification) -> NotificationModel:
    return NotificationModel.model_validate(notification)


@router.get("")
async def my_notifications(
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[NotificationModel]:
    result = await list_notifications(database, user, query.page())
    return Page.build(result, NotificationModel)


@router.patch("/{notification_id}")
async def read_notification(
    notification_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> NotificationModel:
    return notification_model(
        await mark_notification_read(database, user, notification_id)
    )


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def read_all(user: CurrentUserDep, database: DatabaseDep) -> None:
    await mark_all_read(database, user)
