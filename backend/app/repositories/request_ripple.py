import uuid

from sqlalchemy import Select, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Circle,
    CircleMembership,
    FamilyLink,
    HelpRequest,
    RequestRecipient,
    User,
)
from app.database.models.enums import (
    CircleStatus,
    CircleUnitType,
    LinkStatus,
    MembershipStatus,
    RippleStage,
    UserStatus,
)
from app.repositories.blocks import blocked_user_ids
from app.repositories.circles import NEARBY_RADIUS_METERS, circle_distance_meters

ASSOCIATION_TYPES = (CircleUnitType.ASSOCIATION.value, CircleUnitType.MOHOLLA.value)


class RippleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def home_circles(self, owner_id: uuid.UUID) -> list[Circle]:
        statement = (
            select(Circle)
            .join(CircleMembership, CircleMembership.circle_id == Circle.id)
            .join(User, User.id == CircleMembership.user_id)
            .where(
                Circle.status == CircleStatus.ACTIVE.value,
                CircleMembership.user_id == owner_id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
                User.status == UserStatus.ACTIVE.value,
            )
            .order_by(CircleMembership.created_at, Circle.id)
        )
        return list(await self._session.scalars(statement))

    async def home_lineage(
        self, owner_id: uuid.UUID, home_id: uuid.UUID
    ) -> list[Circle]:
        home = await self._session.scalar(
            select(Circle)
            .join(CircleMembership, CircleMembership.circle_id == Circle.id)
            .join(User, User.id == CircleMembership.user_id)
            .where(
                Circle.id == home_id,
                Circle.status == CircleStatus.ACTIVE.value,
                CircleMembership.user_id == owner_id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
                User.status == UserStatus.ACTIVE.value,
            )
        )
        if home is None:
            return []
        chain = [home]
        seen = {home.id}
        while chain[-1].parent_id is not None and chain[-1].parent_id not in seen:
            parent = await self._session.get(Circle, chain[-1].parent_id)
            if (
                parent is None
                or parent.status != CircleStatus.ACTIVE.value
                or parent.region != home.region
            ):
                break
            chain.append(parent)
            seen.add(parent.id)
        return chain

    def _association_circles(self, lineage: list[Circle]) -> Select | None:
        nearest = next(
            (circle for circle in lineage if circle.unit_type in ASSOCIATION_TYPES),
            None,
        )
        if nearest is None:
            return None
        branch = select(Circle.id).where(Circle.id == nearest.id).cte(recursive=True)
        branch = branch.union(
            select(Circle.id)
            .join(branch, Circle.parent_id == branch.c.id)
            .where(
                Circle.region == nearest.region,
                Circle.status == CircleStatus.ACTIVE.value,
            )
        )
        return select(branch.c.id)

    def _approved_in(self, circles: Select) -> Select:
        return select(CircleMembership.user_id).where(
            CircleMembership.circle_id.in_(circles),
            CircleMembership.status == MembershipStatus.APPROVED.value,
        )

    def _direct_scope(self, owner_id: uuid.UUID, target_id: uuid.UUID) -> Select:
        shared = (
            select(Circle.id)
            .join(CircleMembership, CircleMembership.circle_id == Circle.id)
            .where(
                CircleMembership.user_id == owner_id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
                Circle.status == CircleStatus.ACTIVE.value,
            )
        )
        return self._approved_in(shared).where(CircleMembership.user_id == target_id)

    async def can_send_direct(self, owner_id: uuid.UUID, target_id: uuid.UUID) -> bool:
        return (
            await self._session.scalar(
                select(User.id).where(
                    User.id == target_id,
                    User.id != owner_id,
                    User.status == UserStatus.ACTIVE.value,
                    User.id.in_(self._direct_scope(owner_id, target_id)),
                    User.id.not_in(blocked_user_ids(owner_id)),
                )
            )
            is not None
        )

    def _scope(
        self, request: HelpRequest, stage: RippleStage, lineage: list[Circle]
    ) -> Select | None:
        owner_id = request.requester_user_id
        home = lineage[0]
        if stage is RippleStage.DIRECT:
            if request.direct_to_user_id is None:
                return None
            return self._direct_scope(owner_id, request.direct_to_user_id)
        if stage is RippleStage.FAMILY:
            relative = case(
                (FamilyLink.user_id == owner_id, FamilyLink.relative_user_id),
                else_=FamilyLink.user_id,
            )
            return select(relative).where(
                FamilyLink.status == LinkStatus.ACCEPTED.value,
                or_(
                    FamilyLink.user_id == owner_id,
                    FamilyLink.relative_user_id == owner_id,
                ),
            )
        if stage is RippleStage.HAN:
            return self._approved_in(select(Circle.id).where(Circle.id == home.id))

        association = self._association_circles(lineage)
        if stage is RippleStage.ASSOCIATION:
            if association is None:
                return None
            return self._approved_in(association).where(
                CircleMembership.circle_id != home.id
            )
        origin = next(
            (
                circle
                for circle in lineage
                if circle.approx_lat is not None
                and circle.approx_lng is not None
                and circle.unit_type != CircleUnitType.CITY.value
            ),
            None,
        )
        if origin is None:
            return None
        nearby = select(Circle.id).where(
            Circle.id != home.id,
            Circle.region == home.region,
            Circle.status == CircleStatus.ACTIVE.value,
            Circle.open_to_nearby.is_(True),
            Circle.unit_type != CircleUnitType.CITY.value,
            Circle.approx_lat.is_not(None),
            Circle.approx_lng.is_not(None),
            circle_distance_meters(float(origin.approx_lat), float(origin.approx_lng))
            <= NEARBY_RADIUS_METERS,
        )
        if association is not None:
            nearby = nearby.where(Circle.id.not_in(association))
        return self._approved_in(nearby)

    async def recipients(
        self, request: HelpRequest, stage: RippleStage, lineage: list[Circle]
    ) -> list[uuid.UUID]:
        scope = self._scope(request, stage, lineage)
        if scope is None:
            return []
        owner_id = request.requester_user_id
        existing = select(RequestRecipient.user_id).where(
            RequestRecipient.request_id == request.id
        )
        statement = (
            select(User.id)
            .where(
                User.id.in_(scope),
                User.id != owner_id,
                User.status == UserStatus.ACTIVE.value,
                User.id.not_in(blocked_user_ids(owner_id)),
                User.id.not_in(existing),
            )
            .order_by(User.id)
        )
        return list(await self._session.scalars(statement))
