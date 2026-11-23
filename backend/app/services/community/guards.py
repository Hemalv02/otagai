import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Circle
from app.repositories.circles import CircleRepository, MembershipRepository
from app.services.errors import NotFoundError, PermissionDeniedError


class CircleNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Circle not found.")


class NotCircleMemberError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Join this circle to do that.")


class NotCircleLeaderError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only a leader or coordinator can do that.")


async def get_circle(session: AsyncSession, circle_id: uuid.UUID) -> Circle:
    circle = await CircleRepository(session).get(circle_id)
    if circle is None:
        raise CircleNotFoundError
    return circle


async def require_member(
    session: AsyncSession, circle_id: uuid.UUID, user_id: uuid.UUID
) -> Circle:
    circle = await get_circle(session, circle_id)
    if not await MembershipRepository(session).is_approved_member(circle_id, user_id):
        raise NotCircleMemberError
    return circle


async def require_leader(
    session: AsyncSession, circle_id: uuid.UUID, user_id: uuid.UUID
) -> Circle:
    circle = await get_circle(session, circle_id)
    if not await MembershipRepository(session).is_coordinator_or_leader(
        circle_id, user_id
    ):
        raise NotCircleLeaderError
    return circle
