import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import CommunityEvent, EventSignup
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class DuplicateSignupError(Exception):
    pass


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, event_id: uuid.UUID) -> CommunityEvent | None:
        return await self._session.get(CommunityEvent, event_id)

    async def get_for_update(self, event_id: uuid.UUID) -> CommunityEvent | None:
        return await self._session.get(
            CommunityEvent, event_id, with_for_update=True, populate_existing=True
        )

    async def list_for_circle(
        self, circle_id: uuid.UUID, page: PageRequest
    ) -> PageResult[CommunityEvent]:
        statement = select(CommunityEvent).where(CommunityEvent.circle_id == circle_id)
        return await paginate(
            self._session,
            statement,
            page,
            CommunityEvent.starts_at,
            CommunityEvent.id,
            descending=False,
        )

    async def create(self, values: dict[str, Any]) -> CommunityEvent:
        event = CommunityEvent(**values)
        self._session.add(event)
        await self._session.flush()
        await self._session.refresh(event)
        return event

    async def update(
        self, event: CommunityEvent, values: dict[str, Any]
    ) -> CommunityEvent:
        for name, value in values.items():
            setattr(event, name, value)
        await self._session.flush()
        await self._session.refresh(event)
        return event


class EventSignupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, event_id: uuid.UUID, user_id: uuid.UUID) -> EventSignup | None:
        return await self._session.get(EventSignup, (event_id, user_id))

    async def count(self, event_id: uuid.UUID) -> int:
        statement = select(func.count()).where(EventSignup.event_id == event_id)
        return await self._session.scalar(statement) or 0

    async def list_for_event(self, event_id: uuid.UUID) -> list[EventSignup]:
        statement = (
            select(EventSignup)
            .where(EventSignup.event_id == event_id)
            .order_by(EventSignup.created_at.asc())
        )
        return list(await self._session.scalars(statement))

    async def create(self, values: dict[str, Any]) -> EventSignup:
        signup = EventSignup(**values)
        self._session.add(signup)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "pk_event_signups"):
                raise DuplicateSignupError from error
            raise
        await self._session.refresh(signup)
        return signup

    async def delete(self, signup: EventSignup) -> None:
        await self._session.delete(signup)
        await self._session.flush()
