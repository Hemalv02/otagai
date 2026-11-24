import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Category,
    Circle,
    CircleMembership,
    FamilyLink,
    HelpRequest,
    Listing,
    PairStats,
    RequestRecipient,
    User,
)
from app.database.models.enums import (
    CircleStatus,
    CircleUnitType,
    LinkStatus,
    ListingStatus,
    ListingVisibility,
    MembershipStatus,
    RippleStage,
    UserStatus,
)
from app.repositories.blocks import blocked_user_ids
from app.repositories.circles import NEARBY_RADIUS_METERS, circle_distance_meters
from app.repositories.listings import listing_term_score

ASSOCIATION_TYPES = (CircleUnitType.ASSOCIATION.value, CircleUnitType.MOHOLLA.value)


@dataclass(frozen=True)
class RippleCandidate:
    user_id: uuid.UUID
    skills: str | None
    pair_balance: int
    distance_m: float | None


@dataclass(frozen=True)
class ListingMatch:
    available_score: int = 0
    unavailable_score: int = 0


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

    def _origin(self, lineage: list[Circle]) -> Circle | None:
        return next(
            (
                circle
                for circle in lineage
                if circle.approx_lat is not None
                and circle.approx_lng is not None
                and circle.unit_type != CircleUnitType.CITY.value
            ),
            None,
        )

    def _circle_scope(self, stage: RippleStage, lineage: list[Circle]) -> Select | None:
        home = lineage[0]
        if stage is RippleStage.HAN:
            return select(Circle.id).where(Circle.id == home.id)

        association = self._association_circles(lineage)
        if stage is RippleStage.ASSOCIATION:
            if association is None:
                return None
            return select(Circle.id).where(
                Circle.id.in_(association), Circle.id != home.id
            )
        origin = self._origin(lineage)
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
        return nearby

    def _distance(self, lineage: list[Circle], circles: Select | None):
        origin = self._origin(lineage)
        if origin is None:
            return None
        distance = (
            select(
                func.min(
                    circle_distance_meters(
                        float(origin.approx_lat), float(origin.approx_lng)
                    )
                )
            )
            .join(CircleMembership, CircleMembership.circle_id == Circle.id)
            .where(
                CircleMembership.user_id == User.id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
                Circle.region == origin.region,
                Circle.status == CircleStatus.ACTIVE.value,
                Circle.unit_type != CircleUnitType.CITY.value,
                Circle.approx_lat.is_not(None),
                Circle.approx_lng.is_not(None),
            )
            .correlate(User)
        )
        if circles is not None:
            distance = distance.where(Circle.id.in_(circles))
        else:
            distance = distance.where(Circle.open_to_nearby.is_(True))
        return distance.scalar_subquery()

    async def candidates(
        self, request: HelpRequest, stage: RippleStage, lineage: list[Circle]
    ) -> list[RippleCandidate]:
        owner_id = request.requester_user_id
        circles = None
        if stage is RippleStage.DIRECT:
            if request.direct_to_user_id is None:
                return []
            scope = self._direct_scope(owner_id, request.direct_to_user_id)
        elif stage is RippleStage.FAMILY:
            relative = case(
                (FamilyLink.user_id == owner_id, FamilyLink.relative_user_id),
                else_=FamilyLink.user_id,
            )
            scope = select(relative).where(
                FamilyLink.status == LinkStatus.ACCEPTED.value,
                or_(
                    FamilyLink.user_id == owner_id,
                    FamilyLink.relative_user_id == owner_id,
                ),
            )
        else:
            circles = self._circle_scope(stage, lineage)
            if circles is None:
                return []
            scope = self._approved_in(circles)
        existing = select(RequestRecipient.user_id).where(
            RequestRecipient.request_id == request.id
        )
        balance = case(
            (
                PairStats.user_low_id == owner_id,
                PairStats.low_helped_high - PairStats.high_helped_low,
            ),
            else_=PairStats.high_helped_low - PairStats.low_helped_high,
        )
        statement = (
            select(
                User.id,
                case((User.profile_details_visible.is_(True), User.happy_to_help_with)),
                func.coalesce(balance, 0),
                self._distance(lineage, circles),
            )
            .outerjoin(
                PairStats,
                or_(
                    and_(
                        PairStats.user_low_id == owner_id,
                        PairStats.user_high_id == User.id,
                    ),
                    and_(
                        PairStats.user_high_id == owner_id,
                        PairStats.user_low_id == User.id,
                    ),
                ),
            )
            .where(
                User.id.in_(scope),
                User.id != owner_id,
                User.status == UserStatus.ACTIVE.value,
                User.id.not_in(blocked_user_ids(owner_id)),
                User.id.not_in(existing),
            )
        )
        rows = await self._session.execute(statement)
        return [RippleCandidate(*row) for row in rows]

    async def listing_matches(
        self,
        user_ids: list[uuid.UUID],
        request: HelpRequest,
        stage: RippleStage,
        terms: list[str],
        lend_modes: list[str],
        now: datetime,
    ) -> dict[uuid.UUID, ListingMatch]:
        visibility = {
            RippleStage.ASSOCIATION: [
                ListingVisibility.ASSOCIATION,
                ListingVisibility.NEARBY,
            ],
            RippleStage.NEARBY: [ListingVisibility.NEARBY],
        }.get(stage, list(ListingVisibility))
        score = listing_term_score(terms, terms)
        if request.category_id is not None:
            score = case((Listing.category_id == request.category_id, 7), else_=score)
        needed_at = max(request.needed_from or now, now)
        available = and_(
            Listing.status == ListingStatus.ACTIVE.value,
            or_(
                Listing.available_again_at.is_(None),
                Listing.available_again_at <= needed_at,
            ),
        )
        rows = await self._session.execute(
            select(
                Listing.owner_user_id,
                func.max(case((available, score), else_=0)),
                func.max(case((available, 0), else_=score)),
            )
            .join(Category, Category.id == Listing.category_id)
            .where(
                Listing.owner_user_id.in_(user_ids),
                Listing.status != ListingStatus.DELETED.value,
                Listing.visibility.in_(visibility),
                Listing.lend_mode.in_(lend_modes),
                score > 0,
            )
            .group_by(Listing.owner_user_id)
        )
        return {
            user_id: ListingMatch(available_score, unavailable_score)
            for user_id, available_score, unavailable_score in rows
        }
