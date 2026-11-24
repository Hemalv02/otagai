import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.database.models import PointsEntry, ThankYou
from app.database.models.enums import Currency, GiftType, Language
from app.routes.dependencies import ActorDep, CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.thanks.service import (
    NewThankYou,
    create_thank_you,
    decline_money,
    get_thank_you,
    list_circle_wall,
    list_my_thank_yous,
    list_points_entries,
    points_balance,
    set_wall_visibility,
    validate_gift,
)

router = APIRouter(prefix="/thank-yous", tags=["thanks"])
me_router = APIRouter(prefix="/users/me", tags=["thanks"])
circle_wall_router = APIRouter(prefix="/circles", tags=["thanks"])

NoteText = Annotated[str, StringConstraints(max_length=1000)]


class CreateThankYouBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exchange_id: uuid.UUID
    gift_type: GiftType
    note: NoteText | None = None
    lang: Language | None = None
    amount_minor: int | None = Field(default=None, gt=0, le=10_000_000)
    currency: Currency | None = None
    points_amount: int | None = Field(default=None, gt=0, le=100_000)
    ai_drafted: bool = False
    allow_wall_sharing: bool = False


class WallBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    show_on_wall: bool


class ThankYouQuery(PageQuery):
    direction: Literal["sent", "received"] = "received"


class ThankYouModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exchange_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    note: str | None
    lang: str | None
    gift_type: str
    points_amount: int | None
    amount_minor: int | None
    currency: str | None
    money_status: str
    allow_wall_sharing: bool
    show_on_wall: bool
    created_at: datetime


class WallThankYouModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    from_name: str
    to_name: str
    note: str
    lang: str | None
    created_at: datetime


class PointsBalance(BaseModel):
    balance: int


def thank_you_model(thank_you: ThankYou) -> ThankYouModel:
    return ThankYouModel.model_validate(thank_you)


@router.post("", status_code=status.HTTP_201_CREATED)
async def send_thank_you(
    body: CreateThankYouBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
) -> ThankYouModel:
    validate_gift(
        body.gift_type.value,
        body.amount_minor,
        body.currency.value if body.currency else None,
        body.points_amount,
    )
    thank_you = await create_thank_you(
        database,
        actor,
        NewThankYou(
            exchange_id=body.exchange_id,
            gift_type=body.gift_type.value,
            note=body.note,
            lang=body.lang.value if body.lang else None,
            amount_minor=body.amount_minor,
            currency=body.currency.value if body.currency else None,
            points_amount=body.points_amount,
            ai_drafted=body.ai_drafted,
            allow_wall_sharing=body.allow_wall_sharing,
        ),
    )
    response.headers["Location"] = f"/thank-yous/{thank_you.id}"
    return thank_you_model(thank_you)


@router.get("/{thank_you_id}")
async def read_thank_you(
    thank_you_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ThankYouModel:
    return thank_you_model(await get_thank_you(database, actor, thank_you_id))


@router.patch("/{thank_you_id}")
async def update_thank_you(
    thank_you_id: uuid.UUID,
    body: WallBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> ThankYouModel:
    return thank_you_model(
        await set_wall_visibility(database, user.id, thank_you_id, body.show_on_wall)
    )


@router.post("/{thank_you_id}/decline-money")
async def decline_thank_you_money(
    thank_you_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ThankYouModel:
    return thank_you_model(await decline_money(database, actor, thank_you_id))


@me_router.get("/thank-yous")
async def my_thank_yous(
    query: Annotated[ThankYouQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[ThankYouModel]:
    result = await list_my_thank_yous(database, actor, query.direction, query.page())
    return Page.build(result, ThankYouModel)


@me_router.get("/points")
async def my_points(actor: ActorDep, database: DatabaseDep) -> PointsBalance:
    return PointsBalance(balance=await points_balance(database, actor))


class PointsEntryModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    delta: int
    reason: str
    thank_you_id: uuid.UUID | None
    created_at: datetime


def points_entry_model(entry: PointsEntry) -> PointsEntryModel:
    return PointsEntryModel.model_validate(entry)


@me_router.get("/points-entries")
async def my_points_entries(
    query: Annotated[PageQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[PointsEntryModel]:
    result = await list_points_entries(database, actor, query.page())
    return Page.build(result, PointsEntryModel)


@circle_wall_router.get("/{circle_id}/thank-yous")
async def circle_wall(
    circle_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[WallThankYouModel]:
    result = await list_circle_wall(database, user.id, circle_id, query.page())
    return Page.build(result, WallThankYouModel)
