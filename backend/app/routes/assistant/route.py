import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, ConfigDict, model_validator

from app.database.models.enums import Language, LendMode, ListingKind, RequestKind
from app.routes.dependencies import (
    CurrentUserDep,
    DatabaseDep,
    RedisDep,
    SettingsDep,
    StorageDep,
)
from app.routes.listings.route import ListingSummary, OwnerSummary, listing_summary
from app.routes.pagination import Page, PageQuery
from app.routes.requests.route import RequestSummary
from app.services.assistant.service import (
    Clarification,
    Confirmation,
    Draft,
    MessageText,
    Turn,
    confirm_turn,
    list_threads,
    read_history,
    run_turn,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])


class StartTurnBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: MessageText | None = None
    previous_turn_id: uuid.UUID | None = None
    language: Language | None = None
    image_media_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def check_input(self) -> "StartTurnBody":
        if self.text is None and self.image_media_id is None:
            raise ValueError("Enter a message or add a photo.")
        return self


class ResultCard(BaseModel):
    type: Literal["tool", "helper"]
    action: Literal["borrow", "ask_for_help"]
    listing: ListingSummary
    owner: OwnerSummary


class DraftCard(Draft):
    status: Literal["awaiting_confirmation", "posted"]


class ListingRequestModel(BaseModel):
    listing_id: uuid.UUID
    request_id: uuid.UUID
    title: str
    kind: RequestKind


class TurnModel(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    text: str | None
    reply: str
    clarification: Clarification | None
    cards: list[ResultCard]
    draft: DraftCard | None
    image_media_id: uuid.UUID | None
    image_subject: str | None
    request_id: uuid.UUID | None
    listing_requests: list[ListingRequestModel]
    created_at: datetime


class ThreadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


def turn_model(turn: Turn) -> TurnModel:
    cards = []
    helpers: set[uuid.UUID] = set()
    for card, name in turn.matches:
        listing = card.listing
        is_skill = listing.kind == ListingKind.SKILL
        if is_skill:
            if listing.owner_user_id in helpers:
                continue
            helpers.add(listing.owner_user_id)
        cards.append(
            ResultCard(
                type="helper" if is_skill else "tool",
                action="ask_for_help"
                if listing.lend_mode == LendMode.HELP_ONLY
                else "borrow",
                listing=listing_summary(card),
                owner=OwnerSummary(id=listing.owner_user_id, display_name=name),
            )
        )
    saved = turn.saved
    draft = (
        DraftCard(
            **saved.draft,
            status="posted" if saved.request_id else "awaiting_confirmation",
        )
        if saved.draft
        else None
    )
    return TurnModel(
        id=saved.id,
        thread_id=saved.thread_id,
        text=saved.text,
        reply=saved.reply,
        clarification=saved.context.get("clarification"),
        cards=cards,
        draft=draft,
        image_media_id=saved.image_media_id,
        image_subject=saved.context.get("image_subject"),
        request_id=saved.request_id,
        listing_requests=[
            ListingRequestModel.model_validate(receipt)
            for receipt in saved.context.get("listing_requests", {}).values()
        ],
        created_at=saved.created_at,
    )


@router.post("/turns", status_code=status.HTTP_201_CREATED)
async def start_turn(
    body: StartTurnBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    redis: RedisDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> TurnModel:
    turn = await run_turn(
        database,
        redis,
        storage,
        settings,
        user,
        body.text,
        body.previous_turn_id,
        body.language,
        body.image_media_id,
    )
    return turn_model(turn)


@router.get("/threads")
async def threads(
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[ThreadModel]:
    result = await list_threads(database, user.id, query.page())
    return Page.build(result, ThreadModel)


@router.get("/threads/{thread_id}/turns")
async def thread_turns(
    thread_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> Page[TurnModel]:
    result = await read_history(
        database, storage, settings, user.id, thread_id, query.page()
    )
    return Page[TurnModel](
        items=[turn_model(turn) for turn in result.items],
        next_cursor=result.next_cursor,
    )


@router.post("/turns/{turn_id}/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_request(
    turn_id: uuid.UUID,
    body: Confirmation,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> RequestSummary:
    request, created = await confirm_turn(database, user, turn_id, body)
    if not created:
        response.status_code = status.HTTP_200_OK
    response.headers["Location"] = f"/requests/{request.id}"
    return RequestSummary.model_validate(request)
