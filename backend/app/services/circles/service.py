import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Circle, CircleInvite, CircleMembership, User
from app.database.models.enums import (
    CircleStatus,
    JoinMethod,
    MembershipRole,
    MembershipStatus,
    NotificationType,
)
from app.repositories.circles import (
    CircleRepository,
    CircleSearch,
    DuplicateMembershipError,
    InviteRepository,
    MembershipRepository,
    invite_is_usable,
)
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)


class CircleNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Circle not found.")


class InviteNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("This invite code is invalid or has expired.")


class AlreadyMemberError(ConflictError):
    def __init__(self) -> None:
        super().__init__("You already belong to this circle.")


class NotCircleLeaderError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only a circle leader can do this.")


class JoinTargetError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Provide either an invite code or a circle id.")


@dataclass(frozen=True)
class NewCircle:
    name: str
    region: str
    unit_type: str
    approx_lat: float | None
    approx_lng: float | None
    open_to_nearby: bool


@dataclass(frozen=True)
class CircleView:
    circle: Circle
    member_count: int
    my_status: str | None
    my_role: str | None


async def search_circles(
    database: Database, criteria: CircleSearch, page: PageRequest
) -> PageResult[Circle]:
    async with database.session() as session:
        return await CircleRepository(session).search(criteria, page)


async def _build_view(session, circle: Circle, user_id: uuid.UUID) -> CircleView:
    memberships = MembershipRepository(session)
    membership = await memberships.get(circle.id, user_id)
    count = await memberships.count_approved(circle.id)
    return CircleView(
        circle=circle,
        member_count=count,
        my_status=membership.status if membership else None,
        my_role=membership.role if membership else None,
    )


async def get_circle(
    database: Database, user: User, circle_id: uuid.UUID
) -> CircleView:
    async with database.session() as session:
        circle = await CircleRepository(session).get(circle_id)
        if circle is None:
            raise CircleNotFoundError
        membership = await MembershipRepository(session).get(circle_id, user.id)
        is_member = (
            membership is not None
            and membership.status == MembershipStatus.APPROVED.value
        )
        if circle.status != CircleStatus.ACTIVE.value and not is_member:
            raise CircleNotFoundError
        return await _build_view(session, circle, user.id)


async def create_circle(
    database: Database, user: User, new_circle: NewCircle
) -> CircleView:
    async with database.session() as session:
        circle = await CircleRepository(session).create(
            {
                "name": new_circle.name,
                "region": new_circle.region,
                "unit_type": new_circle.unit_type,
                "approx_lat": new_circle.approx_lat,
                "approx_lng": new_circle.approx_lng,
                "open_to_nearby": new_circle.open_to_nearby,
                "created_by_user_id": user.id,
            }
        )
        await MembershipRepository(session).create(
            {
                "circle_id": circle.id,
                "user_id": user.id,
                "role": MembershipRole.LEADER.value,
                "status": MembershipStatus.APPROVED.value,
                "joined_via": JoinMethod.SEEDED.value,
                "decided_by_user_id": user.id,
                "decided_at": datetime.now(UTC),
            }
        )
        return await _build_view(session, circle, user.id)


async def preview_invite(database: Database, code: str) -> tuple[Circle, CircleInvite]:
    async with database.session() as session:
        invite = await InviteRepository(session).get_by_code(code)
        if invite is None or not invite_is_usable(invite, datetime.now(UTC)):
            raise InviteNotFoundError
        circle = await CircleRepository(session).get(invite.circle_id)
        if circle is None or circle.status != CircleStatus.ACTIVE.value:
            raise InviteNotFoundError
        return circle, invite


async def join_circle(
    database: Database,
    user: User,
    *,
    invite_code: str | None,
    circle_id: uuid.UUID | None,
) -> CircleMembership:
    if (invite_code is None) == (circle_id is None):
        raise JoinTargetError
    async with database.session() as session:
        circles = CircleRepository(session)
        memberships = MembershipRepository(session)
        invite: CircleInvite | None = None
        if invite_code is not None:
            invite = await InviteRepository(session).get_for_update_by_code(invite_code)
            if invite is None or not invite_is_usable(invite, datetime.now(UTC)):
                raise InviteNotFoundError
            target_circle_id = invite.circle_id
        else:
            target_circle_id = circle_id
        circle = await circles.get(target_circle_id)
        if circle is None or circle.status != CircleStatus.ACTIVE.value:
            raise CircleNotFoundError
        if invite is None and (
            not circle.open_to_nearby or circle.region != user.region
        ):
            raise CircleNotFoundError
        existing = await memberships.get_for_update(target_circle_id, user.id)
        if existing is not None and existing.status in (
            MembershipStatus.APPROVED.value,
            MembershipStatus.PENDING.value,
        ):
            raise AlreadyMemberError
        auto_approve = invite is not None and invite.auto_approve
        values = {
            "circle_id": target_circle_id,
            "user_id": user.id,
            "role": MembershipRole.MEMBER.value,
            "status": (
                MembershipStatus.APPROVED.value
                if auto_approve
                else MembershipStatus.PENDING.value
            ),
            "joined_via": (
                JoinMethod.INVITE.value if invite else JoinMethod.SEARCH.value
            ),
            "invite_id": invite.id if invite else None,
            "decided_by_user_id": None,
            "decided_at": None,
        }
        if auto_approve:
            values["decided_at"] = datetime.now(UTC)
        if existing is not None:
            membership = await memberships.update(existing, values)
        else:
            try:
                membership = await memberships.create(values)
            except DuplicateMembershipError as error:
                raise AlreadyMemberError from error
        if invite is not None:
            invite.use_count += 1
        return membership


@dataclass(frozen=True)
class MembershipView:
    membership: CircleMembership
    circle: Circle | None


@dataclass(frozen=True)
class RosterEntry:
    membership: CircleMembership
    display_name: str | None


async def list_memberships(
    database: Database, user: User, page: PageRequest
) -> PageResult[MembershipView]:
    async with database.session() as session:
        result = await MembershipRepository(session).list_for_user(user.id, page)
        circles = await CircleRepository(session).get_many(
            [membership.circle_id for membership in result.items]
        )
    items = [
        MembershipView(membership=membership, circle=circles.get(membership.circle_id))
        for membership in result.items
    ]
    return PageResult(items=items, next_cursor=result.next_cursor)


def generate_invite_code() -> str:
    return secrets.token_urlsafe(12)


async def _require_leader(session, circle_id: uuid.UUID, user_id: uuid.UUID) -> None:
    circle = await CircleRepository(session).get(circle_id)
    if circle is None:
        raise CircleNotFoundError
    if not await MembershipRepository(session).is_leader(circle_id, user_id):
        raise NotCircleLeaderError


async def update_circle(
    database: Database, user: User, circle_id: uuid.UUID, changes: dict
) -> CircleView:
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        circle = await CircleRepository(session).get_for_update(circle_id)
        if changes:
            circle = await CircleRepository(session).update(circle, changes)
        return await _build_view(session, circle, user.id)


async def archive_circle(
    database: Database, user: User, circle_id: uuid.UUID
) -> CircleView:
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        circle = await CircleRepository(session).get_for_update(circle_id)
        if circle.status != CircleStatus.ARCHIVED.value:
            circle = await CircleRepository(session).update(
                circle, {"status": CircleStatus.ARCHIVED.value}
            )
        return await _build_view(session, circle, user.id)


async def leave_circle(database: Database, user: User, circle_id: uuid.UUID) -> None:
    async with database.session() as session:
        memberships = MembershipRepository(session)
        membership = await memberships.get_for_update(circle_id, user.id)
        if membership is None or membership.status == MembershipStatus.LEFT.value:
            return
        await memberships.update(membership, {"status": MembershipStatus.LEFT.value})


async def list_circle_memberships(
    database: Database,
    user: User,
    circle_id: uuid.UUID,
    statuses: tuple[str, ...],
    page: PageRequest,
) -> PageResult[RosterEntry]:
    async with database.session() as session:
        memberships = MembershipRepository(session)
        is_leader = await memberships.is_leader(circle_id, user.id)
        if not is_leader and not await memberships.is_approved_member(
            circle_id, user.id
        ):
            raise CircleNotFoundError
        if is_leader:
            allowed = statuses or (
                MembershipStatus.PENDING.value,
                MembershipStatus.APPROVED.value,
                MembershipStatus.REJECTED.value,
                MembershipStatus.REMOVED.value,
            )
        else:
            allowed = (MembershipStatus.APPROVED.value,)
        result = await memberships.list_for_circle(circle_id, list(allowed), page)
        names = (
            await memberships.display_names([item.user_id for item in result.items])
            if is_leader
            else {}
        )
        return PageResult(
            items=[RosterEntry(item, names.get(item.user_id)) for item in result.items],
            next_cursor=result.next_cursor,
        )


async def decide_membership(
    database: Database,
    user: User,
    circle_id: uuid.UUID,
    member_user_id: uuid.UUID,
    target_status: str,
) -> CircleMembership:
    now = datetime.now(UTC)
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        memberships = MembershipRepository(session)
        membership = await memberships.get_for_update(circle_id, member_user_id)
        if membership is None:
            raise CircleNotFoundError
        if membership.status == target_status:
            return membership
        expected_status = (
            MembershipStatus.APPROVED.value
            if target_status == MembershipStatus.REMOVED.value
            else MembershipStatus.PENDING.value
        )
        if membership.status != expected_status:
            raise ConflictError("This membership has already changed.")
        updated = await memberships.update(
            membership,
            {
                "status": target_status,
                "decided_by_user_id": user.id,
                "decided_at": now,
            },
        )
        await NotificationRepository(session).create(
            member_user_id,
            NotificationType.MEMBERSHIP_DECIDED.value,
            {"circle_id": str(circle_id), "status": target_status},
        )
        return updated


async def change_member_role(
    database: Database,
    user: User,
    circle_id: uuid.UUID,
    member_user_id: uuid.UUID,
    role: str,
) -> CircleMembership:
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        memberships = MembershipRepository(session)
        membership = await memberships.get_for_update(circle_id, member_user_id)
        if membership is None:
            raise CircleNotFoundError
        return await memberships.update(membership, {"role": role})


async def create_invite(
    database: Database, user: User, circle_id: uuid.UUID, params: dict
) -> CircleInvite:
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        return await InviteRepository(session).create(
            {
                "circle_id": circle_id,
                "code": generate_invite_code(),
                "created_by_user_id": user.id,
                **params,
            }
        )


async def list_invites(
    database: Database, user: User, circle_id: uuid.UUID, page: PageRequest
) -> PageResult[CircleInvite]:
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        return await InviteRepository(session).list_for_circle(circle_id, page)


async def revoke_invite(
    database: Database, user: User, circle_id: uuid.UUID, invite_id: uuid.UUID
) -> CircleInvite:
    now = datetime.now(UTC)
    async with database.session() as session:
        await _require_leader(session, circle_id, user.id)
        invites = InviteRepository(session)
        invite = await invites.get_for_update(invite_id)
        if invite is None or invite.circle_id != circle_id:
            raise InviteNotFoundError
        if invite.revoked_at is None:
            invite = await invites.revoke(invite, now)
        return invite
