import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import CircleMembership, PointsEntry, ThankYou
from app.database.models.enums import MembershipStatus
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class DuplicateThankYouError(Exception):
    pass


class ThankYouRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, thank_you_id: uuid.UUID) -> ThankYou | None:
        return await self._session.get(ThankYou, thank_you_id)

    async def get_for_update(self, thank_you_id: uuid.UUID) -> ThankYou | None:
        return await self._session.get(
            ThankYou, thank_you_id, with_for_update=True, populate_existing=True
        )

    async def create(self, values: dict[str, Any]) -> ThankYou:
        thank_you = ThankYou(**values)
        self._session.add(thank_you)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_thank_yous_exchange_id_from_user_id"):
                raise DuplicateThankYouError from error
            raise
        await self._session.refresh(thank_you)
        return thank_you

    async def update(self, thank_you: ThankYou, values: dict[str, Any]) -> ThankYou:
        for name, value in values.items():
            setattr(thank_you, name, value)
        await self._session.flush()
        await self._session.refresh(thank_you)
        return thank_you

    async def list_for_user(
        self, user_id: uuid.UUID, *, direction: str, page: PageRequest
    ) -> PageResult[ThankYou]:
        statement = select(ThankYou)
        if direction == "sent":
            statement = statement.where(ThankYou.from_user_id == user_id)
        else:
            statement = statement.where(ThankYou.to_user_id == user_id)
        return await paginate(
            self._session, statement, page, ThankYou.created_at, ThankYou.id
        )

    async def list_for_recipient(
        self, to_user_id: uuid.UUID, page: PageRequest, *, wall_only: bool
    ) -> PageResult[ThankYou]:
        statement = select(ThankYou).where(ThankYou.to_user_id == to_user_id)
        if wall_only:
            statement = statement.where(ThankYou.show_on_wall.is_(True))
        return await paginate(
            self._session, statement, page, ThankYou.created_at, ThankYou.id
        )

    async def list_circle_wall(
        self, circle_id: uuid.UUID, page: PageRequest
    ) -> PageResult[ThankYou]:
        statement = (
            select(ThankYou)
            .join(
                CircleMembership,
                CircleMembership.user_id == ThankYou.to_user_id,
            )
            .where(
                ThankYou.show_on_wall.is_(True),
                CircleMembership.circle_id == circle_id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
            )
        )
        return await paginate(
            self._session, statement, page, ThankYou.created_at, ThankYou.id
        )


class PointsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add_entry(
        self,
        user_id: uuid.UUID,
        delta: int,
        reason: str,
        thank_you_id: uuid.UUID | None,
    ) -> PointsEntry:
        entry = PointsEntry(
            user_id=user_id, delta=delta, reason=reason, thank_you_id=thank_you_id
        )
        self._session.add(entry)
        await self._session.flush()
        await self._session.refresh(entry)
        return entry

    async def balance(self, user_id: uuid.UUID) -> int:
        statement = select(func.coalesce(func.sum(PointsEntry.delta), 0)).where(
            PointsEntry.user_id == user_id
        )
        return await self._session.scalar(statement) or 0

    async def list_entries(
        self, user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[PointsEntry]:
        statement = select(PointsEntry).where(PointsEntry.user_id == user_id)
        return await paginate(
            self._session, statement, page, PointsEntry.created_at, PointsEntry.id
        )
