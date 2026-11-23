import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints

from app.database.models import Notice
from app.database.models.enums import Language
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.notices.service import (
    NewNotice,
    create_notice,
    delete_notice,
    get_notice,
    list_notices,
    update_notice,
)

circle_router = APIRouter(prefix="/circles", tags=["notices"])
router = APIRouter(prefix="/notices", tags=["notices"])

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
Body = Annotated[str, StringConstraints(max_length=5000)]


class CreateNoticeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    body: Body | None = None
    lang: Language
    pinned: bool = False


class UpdateNoticeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    body: Body | None = None
    pinned: bool | None = None


class NoticeModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    circle_id: uuid.UUID
    author_user_id: uuid.UUID
    title: str
    body: str | None
    lang: str
    translations: dict[str, Any]
    pinned: bool
    created_at: datetime
    updated_at: datetime


def notice_model(notice: Notice) -> NoticeModel:
    return NoticeModel.model_validate(notice)


@circle_router.get("/{circle_id}/notices")
async def read_circle_notices(
    circle_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[NoticeModel]:
    result = await list_notices(database, user, circle_id, query.page())
    return Page.build(result, NoticeModel)


@circle_router.post("/{circle_id}/notices", status_code=status.HTTP_201_CREATED)
async def post_circle_notice(
    circle_id: uuid.UUID,
    body: CreateNoticeBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> NoticeModel:
    notice = await create_notice(
        database,
        user,
        circle_id,
        NewNotice(
            title=body.title,
            body=body.body,
            lang=body.lang.value,
            pinned=body.pinned,
        ),
    )
    response.headers["Location"] = f"/notices/{notice.id}"
    return notice_model(notice)


@router.get("/{notice_id}")
async def read_notice(
    notice_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> NoticeModel:
    return notice_model(await get_notice(database, user, notice_id))


@router.patch("/{notice_id}")
async def edit_notice(
    notice_id: uuid.UUID,
    body: UpdateNoticeBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> NoticeModel:
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "title cannot be empty."
        )
    return notice_model(await update_notice(database, user, notice_id, changes))


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_notice(
    notice_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> None:
    await delete_notice(database, user, notice_id)
