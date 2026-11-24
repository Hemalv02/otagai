import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import Database
from app.database.models import Exchange, HelpRequest, PairStats, ThankYou, User
from app.database.models.enums import UserStatus
from app.repositories.blocks import BlockRepository
from app.repositories.circles import CircleRepository
from app.repositories.exchanges import ExchangeRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.pair_stats import PairStatsRepository
from app.repositories.proxy_grants import ProxyGrantRepository
from app.repositories.requests import RequestRepository
from app.repositories.thanks import ThankYouRepository
from app.repositories.users import UserRepository
from app.services.errors import NotFoundError, PermissionDeniedError


class ProfileHiddenError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("User not found.")


class ActivityForbiddenError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("You can't see this person's activity.")


@dataclass(frozen=True)
class PairView:
    pair: PairStats | None
    i_helped_them: int
    they_helped_me: int


async def can_view_profile(
    session: AsyncSession, viewer_id: uuid.UUID, target_id: uuid.UUID
) -> bool:
    if viewer_id == target_id:
        return True
    if await BlockRepository(session).is_blocked_either_way(viewer_id, target_id):
        return False
    if await CircleRepository(session).share_approved_circle(viewer_id, target_id):
        return True
    pair = await PairStatsRepository(session).get(viewer_id, target_id)
    return pair is not None


def may_see_profile_details(viewer_id: uuid.UUID, target: User) -> bool:
    return viewer_id == target.id or target.profile_details_visible


async def get_public_profile(
    database: Database, viewer: User, target_id: uuid.UUID
) -> User:
    async with database.session() as session:
        target = await UserRepository(session).get(target_id)
        if target is None or target.status == UserStatus.DELETED.value:
            raise ProfileHiddenError
        if not await can_view_profile(session, viewer.id, target_id):
            raise ProfileHiddenError
        return target


async def get_pair(database: Database, viewer: User, target_id: uuid.UUID) -> PairView:
    async with database.session() as session:
        if not await can_view_profile(session, viewer.id, target_id):
            raise ProfileHiddenError
        pair = await PairStatsRepository(session).get(viewer.id, target_id)
    if pair is None:
        return PairView(pair=None, i_helped_them=0, they_helped_me=0)
    if pair.user_low_id == viewer.id:
        return PairView(
            pair=pair,
            i_helped_them=pair.low_helped_high,
            they_helped_me=pair.high_helped_low,
        )
    return PairView(
        pair=pair,
        i_helped_them=pair.high_helped_low,
        they_helped_me=pair.low_helped_high,
    )


async def _can_view_activity(
    session, viewer_id: uuid.UUID, target_id: uuid.UUID
) -> bool:
    grant = await ProxyGrantRepository(session).get_active(
        member_user_id=target_id, caretaker_user_id=viewer_id
    )
    return grant is not None and grant.can_view_activity


async def list_user_requests(
    database: Database,
    viewer: User,
    target_id: uuid.UUID,
    statuses: tuple[str, ...],
    page: PageRequest,
) -> PageResult[HelpRequest]:
    async with database.session() as session:
        if not await can_view_profile(session, viewer.id, target_id):
            raise ProfileHiddenError
        include_all = viewer.id == target_id or await _can_view_activity(
            session, viewer.id, target_id
        )
        return await RequestRepository(session).list_for_user_visible(
            viewer.id, target_id, statuses, page, include_all=include_all
        )


async def list_user_exchanges(
    database: Database,
    viewer: User,
    target_id: uuid.UUID,
    statuses: tuple[str, ...],
    page: PageRequest,
) -> PageResult[Exchange]:
    async with database.session() as session:
        if target_id != viewer.id and not await _can_view_activity(
            session, viewer.id, target_id
        ):
            raise ActivityForbiddenError
        return await ExchangeRepository(session).list_for_user(
            target_id, statuses, page
        )


async def list_user_thank_yous(
    database: Database, viewer: User, target_id: uuid.UUID, page: PageRequest
) -> PageResult[ThankYou]:
    async with database.session() as session:
        if not await can_view_profile(session, viewer.id, target_id):
            raise ProfileHiddenError
        wall_only = viewer.id != target_id
        return await ThankYouRepository(session).list_for_recipient(
            target_id, page, wall_only=wall_only
        )
