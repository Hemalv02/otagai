import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.database.models import Circle, CircleInvite, CircleMembership
from app.database.models.enums import (
    CircleUnitType,
    MembershipRole,
    MembershipStatus,
    Region,
)
from app.repositories.circles import CircleSearch
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.circles.service import (
    CircleView,
    MembershipView,
    NewCircle,
    archive_circle,
    change_member_role,
    create_circle,
    create_invite,
    decide_membership,
    get_circle,
    join_circle,
    leave_circle,
    list_circle_memberships,
    list_invites,
    list_memberships,
    preview_invite,
    revoke_invite,
    search_circles,
    update_circle,
)

router = APIRouter(prefix="/circles", tags=["circles"])
invites_router = APIRouter(prefix="/circle-invites", tags=["circles"])
memberships_router = APIRouter(prefix="/users/me/memberships", tags=["circles"])

CircleName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
InviteCode = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=8, max_length=32)
]


class CircleSearchQuery(PageQuery):
    q: str | None = Field(default=None, min_length=1, max_length=100)
    near: str | None = Field(default=None, max_length=64)

    def criteria(self, region: str) -> CircleSearch:
        lat = lng = None
        if self.near is not None:
            raw_lat, _, raw_lng = self.near.partition(",")
            lat, lng = float(raw_lat), float(raw_lng)
        query = self.q.strip() if self.q else None
        return CircleSearch(query=query, lat=lat, lng=lng, region=region)

    @model_validator(mode="after")
    def check_near(self) -> "CircleSearchQuery":
        if self.near is None:
            return self
        parts = self.near.split(",")
        if len(parts) != 2:
            raise ValueError("Use near=lat,lng.")
        try:
            lat, lng = float(parts[0]), float(parts[1])
        except ValueError as error:
            raise ValueError("Use numeric coordinates for near.") from error
        if not -90 <= lat <= 90 or not -180 <= lng <= 180:
            raise ValueError("Coordinates are out of range.")
        return self


class CreateCircleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CircleName
    unit_type: CircleUnitType
    region: Region | None = None
    approx_lat: float | None = Field(default=None, ge=-90, le=90)
    approx_lng: float | None = Field(default=None, ge=-180, le=180)
    open_to_nearby: bool = True
    parent_id: uuid.UUID | None = None


class JoinCircleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invite_code: InviteCode | None = None
    circle_id: uuid.UUID | None = None


class CircleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    region: str
    unit_type: str
    name: str
    name_translations: dict[str, Any]
    approx_lat: float | None
    approx_lng: float | None
    open_to_nearby: bool
    status: str


class CircleDetail(CircleSummary):
    parent_id: uuid.UUID | None
    member_count: int
    my_status: str | None
    my_role: str | None


class InvitePreview(BaseModel):
    circle: CircleSummary
    auto_approve: bool


class MembershipItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    circle_id: uuid.UUID
    role: str
    status: str
    joined_via: str
    created_at: datetime
    decided_at: datetime | None
    circle: CircleSummary | None


def circle_detail(view: CircleView) -> CircleDetail:
    return CircleDetail(
        **CircleSummary.model_validate(view.circle).model_dump(),
        parent_id=(
            view.circle.parent_id
            if view.my_status == MembershipStatus.APPROVED.value
            else None
        ),
        member_count=view.member_count,
        my_status=view.my_status,
        my_role=view.my_role,
    )


def membership_item(view: MembershipView) -> MembershipItem:
    return MembershipItem(
        circle_id=view.membership.circle_id,
        role=view.membership.role,
        status=view.membership.status,
        joined_via=view.membership.joined_via,
        created_at=view.membership.created_at,
        decided_at=view.membership.decided_at,
        circle=(CircleSummary.model_validate(view.circle) if view.circle else None),
    )


@router.get("")
async def browse_circles(
    query: Annotated[CircleSearchQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[CircleSummary]:
    result = await search_circles(database, query.criteria(user.region), query.page())
    return Page.build(result, CircleSummary)


@router.get("/{circle_id}")
async def read_circle(
    circle_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> CircleDetail:
    return circle_detail(await get_circle(database, user, circle_id))


@router.post("", status_code=status.HTTP_201_CREATED)
async def start_circle(
    body: CreateCircleBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> CircleDetail:
    view = await create_circle(
        database,
        user,
        NewCircle(
            name=body.name,
            region=(body.region.value if body.region else user.region),
            unit_type=body.unit_type.value,
            approx_lat=body.approx_lat,
            approx_lng=body.approx_lng,
            open_to_nearby=body.open_to_nearby,
            parent_id=body.parent_id,
        ),
    )
    response.headers["Location"] = f"/circles/{view.circle.id}"
    return circle_detail(view)


@invites_router.get("/{code}")
async def preview_circle_invite(
    code: InviteCode, user: CurrentUserDep, database: DatabaseDep
) -> InvitePreview:
    circle, invite = await preview_invite(database, code)
    return _invite_preview(circle, invite)


def _invite_preview(circle: Circle, invite: CircleInvite) -> InvitePreview:
    return InvitePreview(
        circle=CircleSummary.model_validate(circle), auto_approve=invite.auto_approve
    )


@memberships_router.post("", status_code=status.HTTP_201_CREATED)
async def join_a_circle(
    body: JoinCircleBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> MembershipItem:
    membership = await join_circle(
        database, user, invite_code=body.invite_code, circle_id=body.circle_id
    )
    response.headers["Location"] = f"/circles/{membership.circle_id}"
    return _membership_only(membership)


@memberships_router.get("")
async def my_memberships(
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[MembershipItem]:
    result = await list_memberships(database, user, query.page())
    return Page[MembershipItem](
        items=[membership_item(view) for view in result.items],
        next_cursor=result.next_cursor,
    )


def _membership_only(membership: CircleMembership) -> MembershipItem:
    return MembershipItem(
        circle_id=membership.circle_id,
        role=membership.role,
        status=membership.status,
        joined_via=membership.joined_via,
        created_at=membership.created_at,
        decided_at=membership.decided_at,
        circle=None,
    )


class UpdateCircleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CircleName | None = None
    name_translations: dict[str, Any] | None = None
    open_to_nearby: bool | None = None
    parent_id: uuid.UUID | None = None


class CreateInviteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_at: datetime | None = None
    max_uses: int | None = Field(default=None, ge=1, le=10000)
    auto_approve: bool = False


class RoleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: MembershipRole


class MembershipDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    circle_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    joined_via: str
    created_at: datetime
    decided_at: datetime | None


class RosterMembershipDetail(MembershipDetail):
    display_name: str | None = None


class InviteModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    expires_at: datetime | None
    max_uses: int | None
    use_count: int
    auto_approve: bool
    revoked_at: datetime | None
    created_at: datetime


def _parse_membership_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    values = [part.strip() for part in raw.split(",") if part.strip()]
    allowed = {item.value for item in MembershipStatus}
    for value in values:
        if value not in allowed:
            raise ValueError("Unknown membership status.")
    return tuple(dict.fromkeys(values))


class MembershipPageQuery(PageQuery):
    status: str | None = Field(default=None, max_length=120)

    @field_validator("status")
    @classmethod
    def check_statuses(cls, value: str | None) -> str | None:
        _parse_membership_statuses(value)
        return value


@router.patch("/{circle_id}")
async def edit_circle(
    circle_id: uuid.UUID,
    body: UpdateCircleBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> CircleDetail:
    changes = body.model_dump(exclude_unset=True)
    return circle_detail(await update_circle(database, user, circle_id, changes))


@router.post("/{circle_id}/archive")
async def archive(
    circle_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> CircleDetail:
    return circle_detail(await archive_circle(database, user, circle_id))


@memberships_router.delete("/{circle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def leave(
    circle_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> None:
    await leave_circle(database, user, circle_id)


@router.get("/{circle_id}/memberships")
async def circle_memberships(
    circle_id: uuid.UUID,
    query: Annotated[MembershipPageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[RosterMembershipDetail]:
    result = await list_circle_memberships(
        database,
        user,
        circle_id,
        _parse_membership_statuses(query.status),
        query.page(),
    )
    return Page[RosterMembershipDetail](
        items=[
            RosterMembershipDetail.model_validate(item.membership).model_copy(
                update={"display_name": item.display_name}
            )
            for item in result.items
        ],
        next_cursor=result.next_cursor,
    )


@router.post("/{circle_id}/memberships/{member_id}/approve")
async def approve_member(
    circle_id: uuid.UUID,
    member_id: uuid.UUID,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> MembershipDetail:
    membership = await decide_membership(
        database, user, circle_id, member_id, MembershipStatus.APPROVED.value
    )
    return MembershipDetail.model_validate(membership)


@router.post("/{circle_id}/memberships/{member_id}/reject")
async def reject_member(
    circle_id: uuid.UUID,
    member_id: uuid.UUID,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> MembershipDetail:
    membership = await decide_membership(
        database, user, circle_id, member_id, MembershipStatus.REJECTED.value
    )
    return MembershipDetail.model_validate(membership)


@router.post("/{circle_id}/memberships/{member_id}/remove")
async def remove_member(
    circle_id: uuid.UUID,
    member_id: uuid.UUID,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> MembershipDetail:
    membership = await decide_membership(
        database, user, circle_id, member_id, MembershipStatus.REMOVED.value
    )
    return MembershipDetail.model_validate(membership)


@router.patch("/{circle_id}/memberships/{member_id}")
async def set_member_role(
    circle_id: uuid.UUID,
    member_id: uuid.UUID,
    body: RoleBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> MembershipDetail:
    membership = await change_member_role(
        database, user, circle_id, member_id, body.role.value
    )
    return MembershipDetail.model_validate(membership)


@router.post("/{circle_id}/invites", status_code=status.HTTP_201_CREATED)
async def make_invite(
    circle_id: uuid.UUID,
    body: CreateInviteBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> InviteModel:
    invite = await create_invite(
        database,
        user,
        circle_id,
        {
            "expires_at": body.expires_at,
            "max_uses": body.max_uses,
            "auto_approve": body.auto_approve,
        },
    )
    response.headers["Location"] = f"/circle-invites/{invite.code}"
    return InviteModel.model_validate(invite)


@router.get("/{circle_id}/invites")
async def circle_invites(
    circle_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[InviteModel]:
    result = await list_invites(database, user, circle_id, query.page())
    return Page.build(result, InviteModel)


@router.post("/{circle_id}/invites/{invite_id}/revoke")
async def revoke_circle_invite(
    circle_id: uuid.UUID,
    invite_id: uuid.UUID,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> InviteModel:
    invite = await revoke_invite(database, user, circle_id, invite_id)
    return InviteModel.model_validate(invite)
