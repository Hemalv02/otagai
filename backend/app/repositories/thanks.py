import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Block,
    Circle,
    CircleMembership,
    Exchange,
    HelpRequest,
    PointsEntry,
    ThankYou,
    User,
)
from app.database.models.enums import CircleStatus, MembershipStatus, UserStatus
from app.repositories.blocks import blocked_user_ids
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class DuplicateThankYouError(Exception):
    pass


@dataclass(frozen=True)
class WallThankYou:
    id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    from_name: str
    to_name: str
    note: str
    lang: str | None
    created_at: datetime


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

    async def list_public(
        self,
        viewer_id: uuid.UUID,
        page: PageRequest,
        *,
        circle_id: uuid.UUID | None = None,
        recipient_id: uuid.UUID | None = None,
    ) -> PageResult[WallThankYou]:
        def approved(user_id):
            return (
                select(CircleMembership.user_id)
                .where(
                    CircleMembership.circle_id == HelpRequest.home_circle_id,
                    CircleMembership.user_id == user_id,
                    CircleMembership.status == MembershipStatus.APPROVED.value,
                )
                .exists()
            )

        active_users = select(User.id).where(User.status == UserStatus.ACTIVE.value)
        blocked = blocked_user_ids(viewer_id)
        pair_blocked = (
            select(Block.blocker_user_id)
            .where(
                or_(
                    and_(
                        Block.blocker_user_id == ThankYou.from_user_id,
                        Block.blocked_user_id == ThankYou.to_user_id,
                    ),
                    and_(
                        Block.blocker_user_id == ThankYou.to_user_id,
                        Block.blocked_user_id == ThankYou.from_user_id,
                    ),
                )
            )
            .exists()
        )
        statement = (
            select(ThankYou)
            .join(Exchange, Exchange.id == ThankYou.exchange_id)
            .join(HelpRequest, HelpRequest.id == Exchange.request_id)
            .join(Circle, Circle.id == HelpRequest.home_circle_id)
            .where(
                Circle.status == CircleStatus.ACTIVE.value,
                ThankYou.allow_wall_sharing.is_(True),
                ThankYou.show_on_wall.is_(True),
                ThankYou.note.is_not(None),
                ThankYou.from_user_id.in_(active_users),
                ThankYou.to_user_id.in_(active_users),
                ThankYou.from_user_id.not_in(blocked),
                ThankYou.to_user_id.not_in(blocked),
                ~pair_blocked,
                approved(viewer_id),
                approved(ThankYou.from_user_id),
                approved(ThankYou.to_user_id),
            )
        )
        if circle_id is not None:
            statement = statement.where(HelpRequest.home_circle_id == circle_id)
        if recipient_id is not None:
            statement = statement.where(ThankYou.to_user_id == recipient_id)
        result = await paginate(
            self._session, statement, page, ThankYou.created_at, ThankYou.id
        )
        user_ids = {
            user_id
            for item in result.items
            for user_id in (item.from_user_id, item.to_user_id)
        }
        if not user_ids:
            return PageResult([], result.next_cursor)
        names = dict(
            (
                await self._session.execute(
                    select(User.id, User.display_name).where(User.id.in_(user_ids))
                )
            ).all()
        )
        return PageResult(
            [
                WallThankYou(
                    id=item.id,
                    from_user_id=item.from_user_id,
                    to_user_id=item.to_user_id,
                    from_name=names[item.from_user_id],
                    to_name=names[item.to_user_id],
                    note=item.note,
                    lang=item.lang,
                    created_at=item.created_at,
                )
                for item in result.items
            ],
            result.next_cursor,
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
