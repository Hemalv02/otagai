import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Notice
from app.repositories.pagination import PageRequest, PageResult, paginate


class NoticeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, notice_id: uuid.UUID) -> Notice | None:
        notice = await self._session.get(Notice, notice_id)
        if notice is None or notice.deleted_at is not None:
            return None
        return notice

    async def list_for_circle(
        self, circle_id: uuid.UUID, page: PageRequest
    ) -> PageResult[Notice]:
        statement = select(Notice).where(
            Notice.circle_id == circle_id, Notice.deleted_at.is_(None)
        )
        return await paginate(
            self._session, statement, page, Notice.created_at, Notice.id
        )

    async def create(self, values: dict[str, Any]) -> Notice:
        notice = Notice(**values)
        self._session.add(notice)
        await self._session.flush()
        await self._session.refresh(notice)
        return notice

    async def update(self, notice: Notice, values: dict[str, Any]) -> Notice:
        for name, value in values.items():
            setattr(notice, name, value)
        await self._session.flush()
        await self._session.refresh(notice)
        return notice
