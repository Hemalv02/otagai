import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.database.models import FamilyLink, ProxyGrant
from app.database.models.enums import (
    AgeBand,
    CaretakerRole,
    ConsentMethod,
    FamilyRelation,
    Language,
    Region,
)
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.services.relationships.service import (
    GrantScopes,
    LinkView,
    NeighbourView,
    NewGrant,
    NewManagedUser,
    accept_family_link,
    create_family_link,
    create_managed_user,
    create_proxy_grant,
    list_family_links,
    list_neighbours,
    list_proxy_grants,
    revoke_family_link,
    revoke_proxy_grant,
    update_managed_user,
    update_proxy_grant,
)

neighbours_router = APIRouter(prefix="/users/me/neighbours", tags=["relationships"])
managed_router = APIRouter(prefix="/managed-users", tags=["relationships"])
family_router = APIRouter(prefix="/family-links", tags=["relationships"])
my_family_router = APIRouter(prefix="/users/me/family-links", tags=["relationships"])
grants_router = APIRouter(prefix="/proxy-grants", tags=["relationships"])
my_grants_router = APIRouter(prefix="/users/me/proxy-grants", tags=["relationships"])

DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class FamilyPersonSummary(UserSummary):
    kind: str


class ScopesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    can_post_requests: bool = True
    can_chat: bool = True
    can_thank_and_pay: bool = False
    can_view_activity: bool = True
    can_manage_listings: bool = False

    def to_scopes(self) -> GrantScopes:
        return GrantScopes(**self.model_dump())


class ConsentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caretaker_role: CaretakerRole
    consent_method: ConsentMethod
    consent_witness_user_id: uuid.UUID | None = None
    scopes: ScopesBody = Field(default_factory=ScopesBody)


class CreateManagedUserBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName
    preferred_language: Language
    region: Region
    languages: list[Language] = Field(default_factory=list, max_length=3)
    age_band: AgeBand | None = None
    grant: ConsentBody


class UpdateManagedUserBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    preferred_language: Language | None = None
    languages: list[Language] | None = Field(default=None, max_length=3)
    age_band: AgeBand | None = None


class CreateFamilyLinkBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relative_user_id: uuid.UUID
    relation: FamilyRelation
    invite_code: Annotated[str, StringConstraints(max_length=64)] | None = None


class CreateProxyGrantBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    member_user_id: uuid.UUID
    caretaker_user_id: uuid.UUID
    caretaker_role: CaretakerRole
    consent_method: ConsentMethod
    consent_witness_user_id: uuid.UUID | None = None
    scopes: ScopesBody = Field(default_factory=ScopesBody)


class UpdateProxyGrantBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    can_post_requests: bool | None = None
    can_chat: bool | None = None
    can_thank_and_pay: bool | None = None
    can_view_activity: bool | None = None
    can_manage_listings: bool | None = None


class ManagedUserModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    display_name: str
    preferred_language: str
    languages: list[str]
    region: str
    age_band: str | None
    created_at: datetime


class NeighbourItem(BaseModel):
    other: UserSummary
    i_helped_them: int
    they_helped_me: int
    last_exchange_at: datetime | None


class NeighbourList(BaseModel):
    items: list[NeighbourItem]


class FamilyLinkModel(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    relative_user_id: uuid.UUID
    relation: str
    status: str
    other: FamilyPersonSummary | None
    created_at: datetime
    decided_at: datetime | None


class FamilyLinkList(BaseModel):
    items: list[FamilyLinkModel]


class GrantModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    member_user_id: uuid.UUID
    caretaker_user_id: uuid.UUID
    caretaker_role: str
    can_post_requests: bool
    can_chat: bool
    can_thank_and_pay: bool
    can_view_activity: bool
    can_manage_listings: bool
    consent_method: str
    consented_at: datetime
    created_at: datetime


class GrantWithUser(GrantModel):
    other: FamilyPersonSummary | None
    can_change_scopes: bool


class GrantList(BaseModel):
    items: list[GrantWithUser]


class ManagedUserCreated(BaseModel):
    user: ManagedUserModel
    grant: GrantModel


def _grant_model(grant: ProxyGrant) -> GrantModel:
    return GrantModel.model_validate(grant)


def _neighbour_item(view: NeighbourView, viewer_id: uuid.UUID) -> NeighbourItem:
    if view.pair.user_low_id == viewer_id:
        i_helped = view.pair.low_helped_high
        they_helped = view.pair.high_helped_low
    else:
        i_helped = view.pair.high_helped_low
        they_helped = view.pair.low_helped_high
    return NeighbourItem(
        other=UserSummary.model_validate(view.other),
        i_helped_them=i_helped,
        they_helped_me=they_helped,
        last_exchange_at=view.pair.last_exchange_at,
    )


def _link_model(view: LinkView) -> FamilyLinkModel:
    return FamilyLinkModel(
        id=view.link.id,
        user_id=view.link.user_id,
        relative_user_id=view.link.relative_user_id,
        relation=view.link.relation,
        status=view.link.status,
        other=FamilyPersonSummary.model_validate(view.other) if view.other else None,
        created_at=view.link.created_at,
        decided_at=view.link.decided_at,
    )


def _link_only(link: FamilyLink) -> FamilyLinkModel:
    return FamilyLinkModel(
        id=link.id,
        user_id=link.user_id,
        relative_user_id=link.relative_user_id,
        relation=link.relation,
        status=link.status,
        other=None,
        created_at=link.created_at,
        decided_at=link.decided_at,
    )


@neighbours_router.get("")
async def my_neighbours(user: CurrentUserDep, database: DatabaseDep) -> NeighbourList:
    views = await list_neighbours(database, user)
    return NeighbourList(items=[_neighbour_item(view, user.id) for view in views])


@managed_router.post("", status_code=status.HTTP_201_CREATED)
async def create_managed(
    body: CreateManagedUserBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> ManagedUserCreated:
    managed, grant = await create_managed_user(
        database,
        user,
        NewManagedUser(
            display_name=body.display_name,
            preferred_language=body.preferred_language.value,
            region=body.region.value,
            languages=[language.value for language in body.languages],
            age_band=body.age_band.value if body.age_band else None,
        ),
        NewGrant(
            member_user_id=uuid.uuid4(),
            caretaker_user_id=user.id,
            caretaker_role=body.grant.caretaker_role.value,
            scopes=body.grant.scopes.to_scopes(),
            consent_method=body.grant.consent_method.value,
            consent_witness_user_id=body.grant.consent_witness_user_id,
        ),
    )
    response.headers["Location"] = f"/users/{managed.id}"
    return ManagedUserCreated(
        user=ManagedUserModel.model_validate(managed), grant=_grant_model(grant)
    )


@managed_router.patch("/{user_id}")
async def edit_managed(
    user_id: uuid.UUID,
    body: UpdateManagedUserBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> ManagedUserModel:
    changes = body.model_dump(mode="json", exclude_unset=True)
    updated = await update_managed_user(database, user, user_id, changes)
    return ManagedUserModel.model_validate(updated)


@my_family_router.get("")
async def my_family_links(
    user: CurrentUserDep, database: DatabaseDep
) -> FamilyLinkList:
    views = await list_family_links(database, user)
    return FamilyLinkList(items=[_link_model(view) for view in views])


@family_router.post("", status_code=status.HTTP_201_CREATED)
async def link_family(
    body: CreateFamilyLinkBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> FamilyLinkModel:
    link = await create_family_link(
        database, user, body.relative_user_id, body.relation.value
    )
    response.headers["Location"] = f"/family-links/{link.id}"
    return _link_only(link)


@family_router.post("/{link_id}/accept")
async def accept_link(
    link_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> FamilyLinkModel:
    return _link_only(await accept_family_link(database, user, link_id))


@family_router.post("/{link_id}/revoke")
async def revoke_link(
    link_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> FamilyLinkModel:
    return _link_only(await revoke_family_link(database, user, link_id))


@my_grants_router.get("")
async def my_proxy_grants(
    user: CurrentUserDep,
    database: DatabaseDep,
    as_role: Annotated[Literal["caretaker", "member"], Query(alias="as")] = "caretaker",
) -> GrantList:
    pairs = await list_proxy_grants(database, user, as_caretaker=as_role == "caretaker")
    return GrantList(
        items=[
            GrantWithUser(
                **_grant_model(grant).model_dump(),
                other=FamilyPersonSummary.model_validate(other) if other else None,
                can_change_scopes=can_change,
            )
            for grant, other, can_change in pairs
        ]
    )


@grants_router.post("", status_code=status.HTTP_201_CREATED)
async def grant_proxy(
    body: CreateProxyGrantBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> GrantModel:
    grant = await create_proxy_grant(
        database,
        user,
        NewGrant(
            member_user_id=body.member_user_id,
            caretaker_user_id=body.caretaker_user_id,
            caretaker_role=body.caretaker_role.value,
            scopes=body.scopes.to_scopes(),
            consent_method=body.consent_method.value,
            consent_witness_user_id=body.consent_witness_user_id,
        ),
    )
    response.headers["Location"] = f"/proxy-grants/{grant.id}"
    return _grant_model(grant)


@grants_router.patch("/{grant_id}")
async def edit_proxy_grant(
    grant_id: uuid.UUID,
    body: UpdateProxyGrantBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> GrantModel:
    changes = body.model_dump(exclude_unset=True)
    return _grant_model(await update_proxy_grant(database, user, grant_id, changes))


@grants_router.post("/{grant_id}/revoke")
async def revoke_grant(
    grant_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> GrantModel:
    return _grant_model(await revoke_proxy_grant(database, user, grant_id))
