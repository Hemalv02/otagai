import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Notice, User
from app.repositories.circles import MembershipRepository
from app.repositories.notices import NoticeRepository
from app.repositories.pagination import PageRequest, PageResult
from app.services.community.guards import require_leader, require_member
from app.services.errors import NotFoundError, PermissionDeniedError


class NoticeNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Notice not found.")


class NotNoticeEditorError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only the author or a leader can change this notice.")


@dataclass(frozen=True)
class NewNotice:
    title: str
    body: str | None
    lang: str
    pinned: bool


async def list_notices(
    database: Database, user: User, circle_id: uuid.UUID, page: PageRequest
) -> PageResult[Notice]:
    async with database.session() as session:
        await require_member(session, circle_id, user.id)
        return await NoticeRepository(session).list_for_circle(circle_id, page)


async def create_notice(
    database: Database, user: User, circle_id: uuid.UUID, data: NewNotice
) -> Notice:
    async with database.session() as session:
        await require_leader(session, circle_id, user.id)
        return await NoticeRepository(session).create(
            {
                "circle_id": circle_id,
                "author_user_id": user.id,
                "title": data.title,
                "body": data.body,
                "lang": data.lang,
                "pinned": data.pinned,
            }
        )


async def _load_notice(session, notice_id: uuid.UUID) -> Notice:
    notice = await NoticeRepository(session).get(notice_id)
    if notice is None:
        raise NoticeNotFoundError
    return notice


async def get_notice(database: Database, user: User, notice_id: uuid.UUID) -> Notice:
    async with database.session() as session:
        notice = await _load_notice(session, notice_id)
        await require_member(session, notice.circle_id, user.id)
        return notice


async def _require_editor(session, notice: Notice, user_id: uuid.UUID) -> None:
    if notice.author_user_id == user_id:
        return
    if await MembershipRepository(session).is_coordinator_or_leader(
        notice.circle_id, user_id
    ):
        return
    raise NotNoticeEditorError


async def update_notice(
    database: Database, user: User, notice_id: uuid.UUID, changes: dict
) -> Notice:
    async with database.session() as session:
        notice = await _load_notice(session, notice_id)
        if not await MembershipRepository(session).is_approved_member(
            notice.circle_id, user.id
        ):
            raise NotNoticeEditorError
        await _require_editor(session, notice, user.id)
        if not changes:
            return notice
        return await NoticeRepository(session).update(notice, changes)


async def delete_notice(database: Database, user: User, notice_id: uuid.UUID) -> None:
    async with database.session() as session:
        notice = await _load_notice(session, notice_id)
        if not await MembershipRepository(session).is_approved_member(
            notice.circle_id, user.id
        ):
            raise NotNoticeEditorError
        await _require_editor(session, notice, user.id)
        await NoticeRepository(session).update(
            notice, {"deleted_at": datetime.now(UTC)}
        )
