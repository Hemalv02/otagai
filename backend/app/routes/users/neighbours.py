import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app.database.models import User
from app.database.models.enums import MediaVariantName
from app.repositories.listings import ListingFilters
from app.routes.dependencies import (
    CurrentUserDep,
    DatabaseDep,
    OptionalStorageDep,
    SettingsDep,
    StorageDep,
)
from app.routes.exchanges.route import ExchangeModel
from app.routes.listings.route import ListingSummary, listing_summary
from app.routes.pagination import Page, PageQuery
from app.routes.requests.route import RequestSummary
from app.routes.thanks.route import ThankYouModel
from app.services.actors.service import Actor
from app.services.listings.service import list_user_listings
from app.services.media.service import MediaNotFoundError, read_media
from app.services.users.profiles import (
    get_pair,
    get_public_profile,
    list_user_exchanges,
    list_user_requests,
    list_user_thank_yous,
    may_see_profile_details,
)

router = APIRouter(prefix="/users", tags=["users"])


def _parse_request_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(dict.fromkeys(part.strip() for part in raw.split(",") if part.strip()))


class PublicProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    display_name: str
    region: str
    languages: list[str]
    age_band: str | None
    intro: str | None
    happy_to_help_with: str | None
    avatar_url: str | None = None
    accepts_money_orei: bool
    created_at: datetime


class PairModel(BaseModel):
    i_helped_them: int
    they_helped_me: int
    first_met_at: datetime | None
    last_exchange_at: datetime | None


def _self_actor(user: User) -> Actor:
    return Actor(user=user, subject=user, grant=None)


@router.get("/{user_id}")
async def read_user(
    user_id: uuid.UUID,
    user: CurrentUserDep,
    database: DatabaseDep,
    storage: OptionalStorageDep,
    settings: SettingsDep,
) -> PublicProfile:
    target = await get_public_profile(database, user, user_id)
    response = PublicProfile.model_validate(target)
    if not may_see_profile_details(user.id, target):
        return response.model_copy(
            update={"age_band": None, "intro": None, "happy_to_help_with": None}
        )
    if storage is not None and target.avatar_media_id is not None:
        try:
            media = await read_media(
                database, storage, settings, _self_actor(user), target.avatar_media_id
            )
        except MediaNotFoundError:
            return response
        response.avatar_url = media.urls.get(MediaVariantName.THUMB)
    return response


@router.get("/{user_id}/pair")
async def read_pair(
    user_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> PairModel:
    view = await get_pair(database, user, user_id)
    return PairModel(
        i_helped_them=view.i_helped_them,
        they_helped_me=view.they_helped_me,
        first_met_at=view.pair.first_met_at if view.pair else None,
        last_exchange_at=view.pair.last_exchange_at if view.pair else None,
    )


@router.get("/{user_id}/listings")
async def read_user_listings(
    user_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> Page[ListingSummary]:
    result = await list_user_listings(
        database,
        storage,
        settings,
        _self_actor(user),
        user_id,
        ListingFilters(),
        query.page(),
    )
    return Page[ListingSummary](
        items=[listing_summary(card) for card in result.items],
        next_cursor=result.next_cursor,
    )


@router.get("/{user_id}/requests")
async def read_user_requests(
    user_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
    status_filter: Annotated[str | None, Query(alias="status", max_length=120)] = None,
) -> Page[RequestSummary]:
    result = await list_user_requests(
        database, user, user_id, _parse_request_statuses(status_filter), query.page()
    )
    return Page.build(result, RequestSummary)


@router.get("/{user_id}/exchanges")
async def read_user_exchanges(
    user_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
    status_filter: Annotated[str | None, Query(alias="status", max_length=120)] = None,
) -> Page[ExchangeModel]:
    result = await list_user_exchanges(
        database, user, user_id, _parse_request_statuses(status_filter), query.page()
    )
    return Page.build(result, ExchangeModel)


@router.get("/{user_id}/thank-yous")
async def read_user_thank_yous(
    user_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[ThankYouModel]:
    result = await list_user_thank_yous(database, user, user_id, query.page())
    return Page.build(result, ThankYouModel)
