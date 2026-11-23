import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.database.models.enums import (
    Language,
    RequestKind,
    RequestStatus,
    RequestTone,
    ResponseKind,
    RippleStage,
)
from app.routes.dependencies import ActorDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.actors.service import ProxyScope
from app.services.requests.service import (
    NewRequest,
    ReceivedView,
    RequestDetail,
    accept_response,
    cancel_request,
    create_request,
    create_response,
    get_request,
    list_my_requests,
    list_received,
    list_responses,
    mark_received,
    update_request,
    update_response,
    widen_request,
    withdraw_response,
)

router = APIRouter(prefix="/requests", tags=["requests"])
me_requests_router = APIRouter(prefix="/users/me/requests", tags=["requests"])
received_router = APIRouter(prefix="/users/me/received-requests", tags=["requests"])

RawText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]
PoliteText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]
MessageText = Annotated[str, StringConstraints(max_length=2000)]


def _parse_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    values = [part.strip() for part in raw.split(",") if part.strip()]
    allowed = {item.value for item in RequestStatus}
    for value in values:
        if value not in allowed:
            raise ValueError("Unknown request status.")
    return tuple(dict.fromkeys(values))


class MyRequestsQuery(PageQuery):
    status: str | None = Field(default=None, max_length=120)

    @field_validator("status")
    @classmethod
    def check_statuses(cls, value: str | None) -> str | None:
        _parse_statuses(value)
        return value

    def statuses(self) -> tuple[str, ...]:
        return _parse_statuses(self.status)


class CreateRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: RequestKind
    raw_text: RawText
    polite_text: PoliteText | None = None
    tone: RequestTone = RequestTone.POLITE
    lang: Language
    category_id: uuid.UUID | None = None
    listing_id: uuid.UUID | None = None
    direct_to_user_id: uuid.UUID | None = None
    needed_from: datetime | None = None
    needed_until: datetime | None = None
    ripple_max_stage: RippleStage = RippleStage.HAN
    home_circle_id: uuid.UUID | None = None
    media_ids: list[uuid.UUID] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def check_direct(self) -> "CreateRequestBody":
        if (
            self.direct_to_user_id is None
            and self.ripple_max_stage is RippleStage.DIRECT
        ):
            raise ValueError("Set a direct recipient for a direct request.")
        if (
            self.needed_from is not None
            and self.needed_until is not None
            and self.needed_until < self.needed_from
        ):
            raise ValueError("The end time must be after the start time.")
        return self


class UpdateRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_text: RawText | None = None
    polite_text: PoliteText | None = None
    tone: RequestTone | None = None
    needed_from: datetime | None = None
    needed_until: datetime | None = None


class CreateResponseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ResponseKind
    listing_id: uuid.UUID | None = None
    brings_tool: bool = False
    proposed_start: datetime | None = None
    proposed_end: datetime | None = None
    message: MessageText | None = None
    lang: Language | None = None

    @model_validator(mode="after")
    def check_counter(self) -> "CreateResponseBody":
        if self.kind is ResponseKind.COUNTER_TIME and self.proposed_start is None:
            raise ValueError("Suggest a start time for a counter time.")
        if (
            self.proposed_start is not None
            and self.proposed_end is not None
            and self.proposed_end < self.proposed_start
        ):
            raise ValueError("The end time must be after the start time.")
        return self


class UpdateResponseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brings_tool: bool | None = None
    proposed_start: datetime | None = None
    proposed_end: datetime | None = None
    message: MessageText | None = None


class ReceivedPatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seen: bool = False
    hidden: bool | None = None


class ReceivedPageQuery(PageQuery):
    direct: bool = False


class RequestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_user_id: uuid.UUID
    kind: str
    status: str
    polite_text: str
    lang: str
    listing_id: uuid.UUID | None
    direct_to_user_id: uuid.UUID | None
    needed_from: datetime | None
    needed_until: datetime | None
    ripple_stage: str
    ripple_max_stage: str
    created_at: datetime


class ListingSummaryModel(BaseModel):
    id: uuid.UUID
    title: str


class RequestDetailModel(RequestSummary):
    raw_text: str
    tone: str
    category_id: uuid.UUID | None
    home_circle_id: uuid.UUID
    expires_at: datetime
    my_role: str
    my_response_status: str | None
    my_response_id: uuid.UUID | None
    exchange_id: uuid.UUID | None
    listing: ListingSummaryModel | None


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    responder_user_id: uuid.UUID
    kind: str
    listing_id: uuid.UUID | None
    brings_tool: bool
    proposed_start: datetime | None
    proposed_end: datetime | None
    message: str | None
    status: str
    created_at: datetime


class ReceivedItem(BaseModel):
    request: RequestSummary
    seen: bool
    hidden: bool
    my_response_status: str | None


def request_detail(view: RequestDetail) -> RequestDetailModel:
    return RequestDetailModel(
        **RequestSummary.model_validate(view.request).model_dump(),
        raw_text=view.request.raw_text,
        tone=view.request.tone,
        category_id=view.request.category_id,
        home_circle_id=view.request.home_circle_id,
        expires_at=view.request.expires_at,
        my_role=view.my_role,
        my_response_status=view.my_response_status,
        my_response_id=view.my_response_id,
        exchange_id=view.exchange_id,
        listing=ListingSummaryModel(id=view.listing.id, title=view.listing.title)
        if view.listing
        else None,
    )


def received_item(view: ReceivedView) -> ReceivedItem:
    return ReceivedItem(
        request=RequestSummary.model_validate(view.request),
        seen=view.recipient.seen_at is not None,
        hidden=view.recipient.hidden_at is not None,
        my_response_status=view.my_response_status,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def post_request(
    body: CreateRequestBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
) -> RequestSummary:
    request = await create_request(
        database,
        actor,
        NewRequest(
            kind=body.kind.value,
            raw_text=body.raw_text,
            polite_text=body.polite_text,
            tone=body.tone.value,
            lang=body.lang.value,
            category_id=body.category_id,
            listing_id=body.listing_id,
            direct_to_user_id=body.direct_to_user_id,
            needed_from=body.needed_from,
            needed_until=body.needed_until,
            ripple_max_stage=body.ripple_max_stage.value,
            home_circle_id=body.home_circle_id,
            media_ids=body.media_ids,
        ),
    )
    response.headers["Location"] = f"/requests/{request.id}"
    return RequestSummary.model_validate(request)


@me_requests_router.get("")
async def my_requests(
    query: Annotated[MyRequestsQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[RequestSummary]:
    result = await list_my_requests(database, actor, query.statuses(), query.page())
    return Page.build(result, RequestSummary)


@router.get("/{request_id}")
async def read_request(
    request_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> RequestDetailModel:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    return request_detail(await get_request(database, actor, request_id))


@router.patch("/{request_id}")
async def edit_request(
    request_id: uuid.UUID,
    body: UpdateRequestBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> RequestDetailModel:
    changes = body.model_dump(exclude_unset=True)
    normalized = {
        name: (value.value if hasattr(value, "value") else value)
        for name, value in changes.items()
    }
    await update_request(database, actor, request_id, normalized)
    return request_detail(await get_request(database, actor, request_id))


@router.post("/{request_id}/cancel")
async def cancel(
    request_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> RequestDetailModel:
    await cancel_request(database, actor, request_id)
    return request_detail(await get_request(database, actor, request_id))


@router.post("/{request_id}/widen")
async def widen(
    request_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> RequestDetailModel:
    await widen_request(database, actor, request_id)
    return request_detail(await get_request(database, actor, request_id))


@router.get("/{request_id}/responses")
async def request_responses(
    request_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[ResponseModel]:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    result = await list_responses(database, actor, request_id, query.page())
    return Page.build(result, ResponseModel)


@router.post("/{request_id}/responses", status_code=status.HTTP_201_CREATED)
async def post_response(
    request_id: uuid.UUID,
    body: CreateResponseBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
) -> ResponseModel:
    created = await create_response(
        database,
        actor,
        request_id,
        {
            "kind": body.kind.value,
            "listing_id": body.listing_id,
            "brings_tool": body.brings_tool,
            "proposed_start": body.proposed_start,
            "proposed_end": body.proposed_end,
            "message": body.message,
            "lang": body.lang.value if body.lang else None,
        },
    )
    response.headers["Location"] = f"/requests/{request_id}/responses/{created.id}"
    return ResponseModel.model_validate(created)


@router.patch("/{request_id}/responses/{response_id}")
async def edit_response(
    request_id: uuid.UUID,
    response_id: uuid.UUID,
    body: UpdateResponseBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> ResponseModel:
    changes = body.model_dump(exclude_unset=True)
    updated = await update_response(database, actor, request_id, response_id, changes)
    return ResponseModel.model_validate(updated)


@router.post("/{request_id}/responses/{response_id}/accept")
async def accept(
    request_id: uuid.UUID,
    response_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
) -> ResponseModel:
    accepted = await accept_response(database, actor, request_id, response_id)
    return ResponseModel.model_validate(accepted)


@router.post("/{request_id}/responses/{response_id}/withdraw")
async def withdraw(
    request_id: uuid.UUID,
    response_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
) -> ResponseModel:
    withdrawn = await withdraw_response(database, actor, request_id, response_id)
    return ResponseModel.model_validate(withdrawn)


@received_router.get("")
async def my_received_requests(
    query: Annotated[ReceivedPageQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[ReceivedItem]:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    result = await list_received(
        database, actor, direct_only=query.direct, page=query.page()
    )
    return Page[ReceivedItem](
        items=[received_item(view) for view in result.items],
        next_cursor=result.next_cursor,
    )


@received_router.patch("/{request_id}")
async def patch_received(
    request_id: uuid.UUID,
    body: ReceivedPatchBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> ReceivedItem:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    view = await mark_received(
        database, actor, request_id, seen=body.seen, hidden=body.hidden
    )
    return received_item(view)
