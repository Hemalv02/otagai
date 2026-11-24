import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.database.models import Exchange, LoanExtension
from app.database.models.enums import ExchangeStatus, HandoverPhase, Language
from app.routes.dependencies import (
    ActorDep,
    CurrentUserDep,
    DatabaseDep,
    RedisDep,
    SettingsDep,
    StorageDep,
)
from app.routes.pagination import Page, PageQuery
from app.routes.requests.route import RequestSummary
from app.services.exchanges.handover import (
    CheckView,
    add_item,
    attach_check_media,
    confirm_check,
    create_check,
    delete_item,
    get_check,
    list_checks,
    update_item,
)
from app.services.exchanges.handover_ai import PickupSuggestions, suggest_pickup_items
from app.services.exchanges.service import (
    cancel_exchange,
    confirm_exchange,
    decide_extension,
    dispute_exchange,
    get_exchange,
    hand_over,
    list_extensions,
    list_my_exchanges,
    list_return_favours,
    mark_returned,
    request_extension,
    update_exchange,
)

router = APIRouter(prefix="/exchanges", tags=["exchanges"])
me_router = APIRouter(prefix="/users/me/exchanges", tags=["exchanges"])
extensions_router = APIRouter(prefix="/loan-extensions", tags=["exchanges"])
checks_router = APIRouter(prefix="/handover-checks", tags=["exchanges"])

PlaceNote = Annotated[str, StringConstraints(max_length=200)]
ExtensionMessage = Annotated[str, StringConstraints(max_length=1000)]
ItemLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
DisputeNote = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
]


def _parse_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    values = [part.strip() for part in raw.split(",") if part.strip()]
    allowed = {item.value for item in ExchangeStatus}
    for value in values:
        if value not in allowed:
            raise ValueError("Unknown exchange status.")
    return tuple(dict.fromkeys(values))


class ExchangeQuery(PageQuery):
    status: str | None = Field(default=None, max_length=120)

    @field_validator("status")
    @classmethod
    def validate_status(cls, raw: str | None) -> str | None:
        _parse_statuses(raw)
        return raw


class UpdateExchangeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scheduled_at: datetime | None = None
    meet_place_note: PlaceNote | None = None
    due_at: datetime | None = None


class ExtensionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_due_at: AwareDatetime
    message: ExtensionMessage | None = None


class CreateCheckBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: HandoverPhase
    media_ids: list[uuid.UUID] = Field(default_factory=list, max_length=8)


class AddItemBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: ItemLabel
    quantity: int = Field(default=1, ge=1, le=999)


class PatchItemBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: ItemLabel | None = None
    quantity: int | None = Field(default=None, ge=1, le=999)
    present: bool | None = None
    dispute_note: DisputeNote | None = None


class AttachCheckMediaBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_ids: list[uuid.UUID] = Field(min_length=1, max_length=8)


class PickupSuggestionsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lang: Language


class ConfirmCheckBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


class ExchangeModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    response_id: uuid.UUID
    requester_user_id: uuid.UUID
    helper_user_id: uuid.UUID
    listing_id: uuid.UUID | None
    mode: str
    status: str
    scheduled_at: datetime | None
    meet_place_note: str | None
    due_at: datetime | None
    handed_over_at: datetime | None
    returned_at: datetime | None
    requester_confirmed_at: datetime | None
    helper_confirmed_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class ExtensionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exchange_id: uuid.UUID
    requested_by_user_id: uuid.UUID
    new_due_at: datetime
    message: str | None
    status: str
    created_at: datetime
    decided_at: datetime | None


class ItemModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    quantity: int
    source: str
    present: bool | None
    disputed_by_user_id: uuid.UUID | None
    dispute_note: str | None


class CheckModel(BaseModel):
    id: uuid.UUID
    exchange_id: uuid.UUID
    phase: str
    lender_confirmed_at: datetime | None
    borrower_confirmed_at: datetime | None
    lender_confirmed_by_user_id: uuid.UUID | None
    borrower_confirmed_by_user_id: uuid.UUID | None
    created_at: datetime
    items: list[ItemModel]
    media_ids: list[uuid.UUID]
    revision: str


class CheckList(BaseModel):
    items: list[CheckModel]


def exchange_model(exchange: Exchange) -> ExchangeModel:
    return ExchangeModel.model_validate(exchange)


def extension_model(extension: LoanExtension) -> ExtensionModel:
    return ExtensionModel.model_validate(extension)


def check_model(view: CheckView) -> CheckModel:
    return CheckModel(
        id=view.check.id,
        exchange_id=view.check.exchange_id,
        phase=view.check.phase,
        lender_confirmed_at=view.lender_confirmed_at,
        borrower_confirmed_at=view.borrower_confirmed_at,
        lender_confirmed_by_user_id=view.check.lender_confirmed_by_user_id
        if view.lender_confirmed_at is not None
        else None,
        borrower_confirmed_by_user_id=view.check.borrower_confirmed_by_user_id
        if view.borrower_confirmed_at is not None
        else None,
        created_at=view.check.created_at,
        items=[ItemModel.model_validate(item) for item in view.items],
        media_ids=view.media_ids,
        revision=view.revision,
    )


@me_router.get("")
async def my_exchanges(
    query: Annotated[ExchangeQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[ExchangeModel]:
    result = await list_my_exchanges(
        database, actor, _parse_statuses(query.status), query.page()
    )
    return Page.build(result, ExchangeModel)


@router.get("/{exchange_id}")
async def read_exchange(
    exchange_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExchangeModel:
    return exchange_model(await get_exchange(database, actor, exchange_id))


class ReturnFavourOptions(BaseModel):
    items: list[RequestSummary]


@router.get("/{exchange_id}/return-favours")
async def read_return_favours(
    exchange_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> ReturnFavourOptions:
    options = await list_return_favours(database, user.id, exchange_id)
    return ReturnFavourOptions(
        items=[RequestSummary.model_validate(request) for request in options]
    )


@router.patch("/{exchange_id}")
async def edit_exchange(
    exchange_id: uuid.UUID,
    body: UpdateExchangeBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> ExchangeModel:
    changes = body.model_dump(exclude_unset=True)
    return exchange_model(await update_exchange(database, actor, exchange_id, changes))


@router.post("/{exchange_id}/hand-over")
async def hand_over_exchange(
    exchange_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExchangeModel:
    return exchange_model(await hand_over(database, actor, exchange_id))


@router.post("/{exchange_id}/return")
async def return_exchange(
    exchange_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExchangeModel:
    return exchange_model(await mark_returned(database, actor, exchange_id))


@router.post("/{exchange_id}/confirm")
async def confirm(
    exchange_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExchangeModel:
    return exchange_model(await confirm_exchange(database, actor, exchange_id))


@router.post("/{exchange_id}/cancel")
async def cancel(
    exchange_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExchangeModel:
    return exchange_model(await cancel_exchange(database, actor, exchange_id))


class DisputeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[str, StringConstraints(max_length=1000)] | None = None


@router.post("/{exchange_id}/dispute")
async def dispute(
    exchange_id: uuid.UUID,
    body: DisputeBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> ExchangeModel:
    return exchange_model(
        await dispute_exchange(database, actor, exchange_id, body.reason)
    )


@router.post("/{exchange_id}/extensions", status_code=status.HTTP_201_CREATED)
async def create_extension(
    exchange_id: uuid.UUID,
    body: ExtensionBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
) -> ExtensionModel:
    extension = await request_extension(
        database, actor, exchange_id, body.new_due_at, body.message
    )
    response.headers["Location"] = f"/loan-extensions/{extension.id}"
    return extension_model(extension)


@router.get("/{exchange_id}/extensions")
async def exchange_extensions(
    exchange_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[ExtensionModel]:
    result = await list_extensions(database, actor, exchange_id, query.page())
    return Page.build(result, ExtensionModel)


@extensions_router.post("/{extension_id}/accept")
async def accept_extension(
    extension_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExtensionModel:
    return extension_model(
        await decide_extension(database, actor, extension_id, accept=True)
    )


@extensions_router.post("/{extension_id}/decline")
async def decline_extension(
    extension_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ExtensionModel:
    return extension_model(
        await decide_extension(database, actor, extension_id, accept=False)
    )


@router.post("/{exchange_id}/handover-checks", status_code=status.HTTP_201_CREATED)
async def start_check(
    exchange_id: uuid.UUID,
    body: CreateCheckBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
) -> CheckModel:
    view = await create_check(
        database, actor, exchange_id, body.phase.value, body.media_ids
    )
    response.headers["Location"] = f"/handover-checks/{view.check.id}"
    return check_model(view)


@router.get("/{exchange_id}/handover-checks")
async def exchange_checks(
    exchange_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> CheckList:
    views = await list_checks(database, actor, exchange_id)
    return CheckList(items=[check_model(view) for view in views])


@checks_router.get("/{check_id}")
async def read_check(
    check_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> CheckModel:
    return check_model(await get_check(database, actor, check_id))


@checks_router.post("/{check_id}/media")
async def attach_photos(
    check_id: uuid.UUID,
    body: AttachCheckMediaBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> CheckModel:
    return check_model(
        await attach_check_media(database, actor, check_id, body.media_ids)
    )


@checks_router.post("/{check_id}/suggestions")
async def pickup_suggestions(
    check_id: uuid.UUID,
    body: PickupSuggestionsBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> PickupSuggestions:
    return await suggest_pickup_items(
        database, storage, settings, redis, actor, check_id, body.lang.value
    )


@checks_router.post("/{check_id}/items", status_code=status.HTTP_201_CREATED)
async def create_item(
    check_id: uuid.UUID,
    body: AddItemBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> CheckModel:
    return check_model(
        await add_item(database, actor, check_id, body.label, body.quantity)
    )


@checks_router.patch("/{check_id}/items/{item_id}")
async def patch_item(
    check_id: uuid.UUID,
    item_id: uuid.UUID,
    body: PatchItemBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> CheckModel:
    changes = {
        key: value
        for key, value in body.model_dump(exclude_unset=True).items()
        if value is not None or key in ("present", "dispute_note")
    }
    return check_model(await update_item(database, actor, check_id, item_id, changes))


@checks_router.delete(
    "/{check_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_item(
    check_id: uuid.UUID,
    item_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
) -> None:
    await delete_item(database, actor, check_id, item_id)


@checks_router.post("/{check_id}/confirm")
async def confirm_handover_check(
    check_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    body: ConfirmCheckBody | None = None,
) -> CheckModel:
    return check_model(
        await confirm_check(database, actor, check_id, body.revision if body else None)
    )
