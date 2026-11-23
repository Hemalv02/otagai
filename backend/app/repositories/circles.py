import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Integer, cast, func, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database.models import Circle, CircleInvite, CircleMembership
from app.database.models.enums import (
    CircleStatus,
    MembershipRole,
    MembershipStatus,
)
from app.repositories.errors import violates
from app.repositories.pagination import (
    MAX_PAGE_SIZE,
    PageRequest,
    PageResult,
    decode_cursor,
    encode_cursor,
    paginate,
)

NEARBY_RADIUS_METERS = 3000
EARTH_RADIUS_METERS = 6371000


class DuplicateMembershipError(Exception):
    pass


@dataclass(frozen=True)
class CircleSearch:
    query: str | None = None
    lat: float | None = None
    lng: float | None = None
    region: str | None = None


class CircleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, circle_id: uuid.UUID) -> Circle | None:
        return await self._session.get(Circle, circle_id)

    async def get_many(self, circle_ids: list[uuid.UUID]) -> dict[uuid.UUID, Circle]:
        if not circle_ids:
            return {}
        result = await self._session.scalars(
            select(Circle).where(Circle.id.in_(circle_ids))
        )
        return {circle.id: circle for circle in result}

    async def get_for_update(self, circle_id: uuid.UUID) -> Circle | None:
        return await self._session.get(
            Circle, circle_id, with_for_update=True, populate_existing=True
        )

    async def approved_circle_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        statement = select(CircleMembership.circle_id).where(
            CircleMembership.user_id == user_id,
            CircleMembership.status == MembershipStatus.APPROVED.value,
        )
        return list(await self._session.scalars(statement))

    async def share_approved_circle(
        self, user_id: uuid.UUID, other_id: uuid.UUID
    ) -> bool:
        if user_id == other_id:
            return True
        mine = aliased(CircleMembership)
        theirs = aliased(CircleMembership)
        statement = (
            select(mine.circle_id)
            .join(theirs, theirs.circle_id == mine.circle_id)
            .where(
                mine.user_id == user_id,
                mine.status == MembershipStatus.APPROVED.value,
                theirs.user_id == other_id,
                theirs.status == MembershipStatus.APPROVED.value,
            )
            .limit(1)
        )
        return await self._session.scalar(statement) is not None

    async def search(
        self, criteria: CircleSearch, page: PageRequest
    ) -> PageResult[Circle]:
        statement = select(Circle).where(
            Circle.status == CircleStatus.ACTIVE.value, Circle.open_to_nearby.is_(True)
        )
        if criteria.region:
            statement = statement.where(Circle.region == criteria.region)
        if criteria.query:
            statement = statement.where(Circle.name.ilike(f"%{criteria.query}%"))
        if criteria.lat is not None and criteria.lng is not None:
            origin_lat = func.radians(criteria.lat)
            circle_lat = func.radians(Circle.approx_lat)
            lng_delta = func.radians(Circle.approx_lng - criteria.lng)
            cosine = func.sin(origin_lat) * func.sin(circle_lat) + (
                func.cos(origin_lat) * func.cos(circle_lat) * func.cos(lng_delta)
            )
            meters = EARTH_RADIUS_METERS * func.acos(
                func.least(1.0, func.greatest(-1.0, cosine))
            )
            distance = cast(meters, Integer).label("distance_m")
            nearby = statement.where(
                Circle.approx_lat.is_not(None),
                Circle.approx_lng.is_not(None),
                meters <= NEARBY_RADIUS_METERS,
            ).add_columns(distance)
            cursor_name = "circle_distance_m,id:asc"
            if page.cursor is not None:
                position = decode_cursor(
                    page.cursor, (distance, Circle.id), cursor_name
                )
                nearby = nearby.where(tuple_(distance, Circle.id) > tuple_(*position))
            limit = min(max(page.limit, 1), MAX_PAGE_SIZE)
            result = await self._session.execute(
                nearby.order_by(distance.asc(), Circle.id.asc()).limit(limit + 1)
            )
            rows = result.all()
            items = [circle for circle, _ in rows[:limit]]
            if len(rows) <= limit:
                return PageResult(items=items, next_cursor=None)
            last, last_meters = rows[limit - 1]
            return PageResult(
                items=items,
                next_cursor=encode_cursor([last_meters, last.id], cursor_name),
            )
        return await paginate(
            self._session, statement, page, Circle.created_at, Circle.id
        )

    async def create(self, values: dict[str, Any]) -> Circle:
        circle = Circle(**values)
        self._session.add(circle)
        await self._session.flush()
        await self._session.refresh(circle)
        return circle

    async def update(self, circle: Circle, values: dict[str, Any]) -> Circle:
        for name, value in values.items():
            setattr(circle, name, value)
        await self._session.flush()
        await self._session.refresh(circle)
        return circle


class MembershipRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, circle_id: uuid.UUID, user_id: uuid.UUID
    ) -> CircleMembership | None:
        return await self._session.get(CircleMembership, (circle_id, user_id))

    async def get_for_update(
        self, circle_id: uuid.UUID, user_id: uuid.UUID
    ) -> CircleMembership | None:
        return await self._session.get(
            CircleMembership,
            (circle_id, user_id),
            with_for_update=True,
            populate_existing=True,
        )

    async def count_approved(self, circle_id: uuid.UUID) -> int:
        statement = select(func.count()).where(
            CircleMembership.circle_id == circle_id,
            CircleMembership.status == MembershipStatus.APPROVED.value,
        )
        return await self._session.scalar(statement) or 0

    async def is_approved_member(
        self, circle_id: uuid.UUID, user_id: uuid.UUID
    ) -> bool:
        membership = await self.get(circle_id, user_id)
        return (
            membership is not None
            and membership.status == MembershipStatus.APPROVED.value
        )

    async def approved_member_ids(self, circle_id: uuid.UUID) -> list[uuid.UUID]:
        statement = select(CircleMembership.user_id).where(
            CircleMembership.circle_id == circle_id,
            CircleMembership.status == MembershipStatus.APPROVED.value,
        )
        return list(await self._session.scalars(statement))

    async def approved_members(self, circle_id: uuid.UUID) -> list[CircleMembership]:
        statement = select(CircleMembership).where(
            CircleMembership.circle_id == circle_id,
            CircleMembership.status == MembershipStatus.APPROVED.value,
        )
        return list(await self._session.scalars(statement))

    async def is_coordinator_or_leader(
        self, circle_id: uuid.UUID, user_id: uuid.UUID
    ) -> bool:
        membership = await self.get(circle_id, user_id)
        return (
            membership is not None
            and membership.status == MembershipStatus.APPROVED.value
            and membership.role
            in (MembershipRole.LEADER.value, MembershipRole.COORDINATOR.value)
        )

    async def is_leader(self, circle_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        membership = await self.get(circle_id, user_id)
        return (
            membership is not None
            and membership.status == MembershipStatus.APPROVED.value
            and membership.role == MembershipRole.LEADER.value
        )

    async def create(self, values: dict[str, Any]) -> CircleMembership:
        membership = CircleMembership(**values)
        self._session.add(membership)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "pk_circle_memberships"):
                raise DuplicateMembershipError from error
            raise
        await self._session.refresh(membership)
        return membership

    async def update(
        self, membership: CircleMembership, values: dict[str, Any]
    ) -> CircleMembership:
        for name, value in values.items():
            setattr(membership, name, value)
        await self._session.flush()
        await self._session.refresh(membership)
        return membership

    async def list_for_user(
        self, user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[CircleMembership]:
        statement = select(CircleMembership).where(
            CircleMembership.user_id == user_id,
            CircleMembership.status != MembershipStatus.LEFT.value,
        )
        return await paginate(
            self._session,
            statement,
            page,
            CircleMembership.created_at,
            CircleMembership.circle_id,
        )

    async def list_for_circle(
        self, circle_id: uuid.UUID, statuses: list[str], page: PageRequest
    ) -> PageResult[CircleMembership]:
        statement = select(CircleMembership).where(
            CircleMembership.circle_id == circle_id,
            CircleMembership.status.in_(statuses),
        )
        return await paginate(
            self._session,
            statement,
            page,
            CircleMembership.created_at,
            CircleMembership.user_id,
        )


class InviteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_code(self, code: str) -> CircleInvite | None:
        return await self._session.scalar(
            select(CircleInvite).where(CircleInvite.code == code)
        )

    async def get_for_update_by_code(self, code: str) -> CircleInvite | None:
        return await self._session.scalar(
            select(CircleInvite).where(CircleInvite.code == code).with_for_update()
        )

    async def get_for_update(self, invite_id: uuid.UUID) -> CircleInvite | None:
        return await self._session.get(
            CircleInvite, invite_id, with_for_update=True, populate_existing=True
        )

    async def create(self, values: dict[str, Any]) -> CircleInvite:
        invite = CircleInvite(**values)
        self._session.add(invite)
        await self._session.flush()
        await self._session.refresh(invite)
        return invite

    async def list_for_circle(
        self, circle_id: uuid.UUID, page: PageRequest
    ) -> PageResult[CircleInvite]:
        statement = select(CircleInvite).where(CircleInvite.circle_id == circle_id)
        return await paginate(
            self._session, statement, page, CircleInvite.created_at, CircleInvite.id
        )

    async def revoke(self, invite: CircleInvite, when: datetime) -> CircleInvite:
        invite.revoked_at = when
        await self._session.flush()
        await self._session.refresh(invite)
        return invite

    async def count_active_leaders(self, circle_id: uuid.UUID) -> int:
        statement = select(func.count()).where(
            CircleMembership.circle_id == circle_id,
            CircleMembership.status == MembershipStatus.APPROVED.value,
            CircleMembership.role == MembershipRole.LEADER.value,
        )
        return await self._session.scalar(statement) or 0


def invite_is_usable(invite: CircleInvite, now: datetime) -> bool:
    if invite.revoked_at is not None:
        return False
    if invite.expires_at is not None and invite.expires_at <= now:
        return False
    return not (invite.max_uses is not None and invite.use_count >= invite.max_uses)
