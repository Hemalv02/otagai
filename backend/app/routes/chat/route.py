import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.database.models import ConversationParticipant
from app.database.models.enums import MessageKind
from app.repositories.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_CURSOR_LENGTH,
    MAX_PAGE_SIZE,
    PageRequest,
)
from app.routes.dependencies import ActorDep, DatabaseDep, SettingsDep, StorageDep
from app.routes.pagination import Page, PageQuery
from app.services.chat.service import (
    ConversationView,
    MessageView,
    delete_message,
    edit_message,
    get_conversation,
    list_conversations,
    list_messages,
    messages_since,
    send_message,
    start_conversation,
    update_participant_settings,
    verify_stream_access,
)

SSE_POLL_SECONDS = 2.0
SSE_MAX_DURATION_SECONDS = 600

router = APIRouter(prefix="/conversations", tags=["chat"])
me_router = APIRouter(prefix="/users/me/conversations", tags=["chat"])

MessageBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
]


class HistoryQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    before: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)

    def page(self) -> PageRequest:
        return PageRequest(limit=self.limit, cursor=self.before)


class StartConversationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: uuid.UUID | None = None
    target_user_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def check_target(self) -> "StartConversationBody":
        if (self.listing_id is None) == (self.target_user_id is None):
            raise ValueError("Provide a listing id or a target user id.")
        return self


class SendMessageBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: MessageKind = MessageKind.TEXT
    body: MessageBody | None = None
    client_message_id: uuid.UUID | None = None
    media_ids: list[uuid.UUID] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def check_kind(self) -> "SendMessageBody":
        if self.kind in (MessageKind.SYSTEM, MessageKind.CARD):
            raise ValueError("You can't send this kind of message.")
        if self.kind is MessageKind.TEXT and not self.body:
            raise ValueError("A text message needs a body.")
        return self


class ParticipantPatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mark_read: bool = False
    muted_until: datetime | None = None
    archived: bool | None = None


class ParticipantModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    role: str
    last_read_at: datetime | None
    muted_until: datetime | None
    archived_at: datetime | None


class MessagePreview(BaseModel):
    id: uuid.UUID
    kind: str
    body: str | None
    sender_user_id: uuid.UUID | None
    created_at: datetime


class ConversationItem(BaseModel):
    id: uuid.UUID
    kind: str
    request_id: uuid.UUID | None
    response_id: uuid.UUID | None
    listing_id: uuid.UUID | None
    status: str
    last_message_at: datetime | None
    last_message: MessagePreview | None
    unread_count: int
    participants: list[ParticipantModel]


class MessageAttachmentModel(BaseModel):
    media_id: uuid.UUID
    urls: dict[str, str]


class MessageModel(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_user_id: uuid.UUID | None
    kind: str
    body: str | None
    lang: str | None
    card_type: str | None
    card_ref_id: uuid.UUID | None
    attachments: list[MessageAttachmentModel]
    edited_at: datetime | None
    deleted: bool
    created_at: datetime


def _preview(view: ConversationView) -> MessagePreview | None:
    message = view.last_message
    if message is None:
        return None
    return MessagePreview(
        id=message.id,
        kind=message.kind,
        body=None if message.deleted_at else message.body,
        sender_user_id=message.sender_user_id,
        created_at=message.created_at,
    )


def conversation_item(view: ConversationView) -> ConversationItem:
    conversation = view.conversation
    return ConversationItem(
        id=conversation.id,
        kind=conversation.kind,
        request_id=conversation.request_id,
        response_id=conversation.response_id,
        listing_id=conversation.listing_id,
        status=conversation.status,
        last_message_at=conversation.last_message_at,
        last_message=_preview(view),
        unread_count=view.unread_count,
        participants=[
            ParticipantModel.model_validate(participant)
            for participant in view.participants
        ],
    )


def message_model(view: MessageView) -> MessageModel:
    message = view.message
    return MessageModel(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_user_id=message.sender_user_id,
        kind=message.kind,
        body=view.display_body,
        lang=message.lang,
        card_type=message.card_type,
        card_ref_id=message.card_ref_id,
        attachments=[
            MessageAttachmentModel(media_id=media_id, urls=urls)
            for media_id, urls in view.attachments.items()
        ],
        edited_at=message.edited_at,
        deleted=message.deleted_at is not None,
        created_at=message.created_at,
    )


@me_router.get("")
async def my_conversations(
    query: Annotated[PageQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[ConversationItem]:
    result = await list_conversations(database, actor, query.page())
    return Page[ConversationItem](
        items=[conversation_item(view) for view in result.items],
        next_cursor=result.next_cursor,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: StartConversationBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
) -> ConversationItem:
    view, created = await start_conversation(
        database,
        actor,
        listing_id=body.listing_id,
        target_user_id=body.target_user_id,
    )
    if created:
        response.headers["Location"] = f"/conversations/{view.conversation.id}"
    else:
        response.status_code = status.HTTP_200_OK
    return conversation_item(view)


@router.get("/{conversation_id}")
async def read_conversation(
    conversation_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> ConversationItem:
    return conversation_item(await get_conversation(database, actor, conversation_id))


@router.get("/{conversation_id}/messages")
async def conversation_messages(
    conversation_id: uuid.UUID,
    query: Annotated[HistoryQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> Page[MessageModel]:
    result = await list_messages(
        database, storage, settings, actor, conversation_id, query.page()
    )
    return Page[MessageModel](
        items=[message_model(view) for view in result.items],
        next_cursor=result.next_cursor,
    )


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def post_message(
    conversation_id: uuid.UUID,
    body: SendMessageBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
    response: Response,
) -> MessageModel:
    message, created = await send_message(
        database,
        actor,
        conversation_id,
        kind=body.kind.value,
        body=body.body,
        client_message_id=body.client_message_id,
        media_ids=body.media_ids,
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    views = await list_messages(
        database,
        storage,
        settings,
        actor,
        conversation_id,
        PageRequest(limit=1),
    )
    for view in views.items:
        if view.message.id == message.id:
            return message_model(view)
    return MessageModel(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_user_id=message.sender_user_id,
        kind=message.kind,
        body=message.body,
        lang=message.lang,
        card_type=message.card_type,
        card_ref_id=message.card_ref_id,
        attachments=[],
        edited_at=message.edited_at,
        deleted=message.deleted_at is not None,
        created_at=message.created_at,
    )


class EditMessageBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: MessageBody


@router.patch("/{conversation_id}/messages/{message_id}")
async def edit_my_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: EditMessageBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> MessageModel:
    message = await edit_message(
        database, actor, conversation_id, message_id, body.body
    )
    views = await list_messages(
        database, storage, settings, actor, conversation_id, PageRequest(limit=1)
    )
    for view in views.items:
        if view.message.id == message.id:
            return message_model(view)
    return MessageModel(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_user_id=message.sender_user_id,
        kind=message.kind,
        body=message.body,
        lang=message.lang,
        card_type=message.card_type,
        card_ref_id=message.card_ref_id,
        attachments=[],
        edited_at=message.edited_at,
        deleted=message.deleted_at is not None,
        created_at=message.created_at,
    )


@router.delete(
    "/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_my_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
) -> None:
    await delete_message(database, actor, conversation_id, message_id)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@router.get("/{conversation_id}/events")
async def conversation_events(
    conversation_id: uuid.UUID,
    request: Request,
    actor: ActorDep,
    database: DatabaseDep,
) -> StreamingResponse:
    await verify_stream_access(database, actor, conversation_id)

    async def stream() -> AsyncIterator[str]:
        cursor = datetime.now(UTC)
        elapsed = 0.0
        yield _sse("ready", {"conversation_id": str(conversation_id)})
        while elapsed < SSE_MAX_DURATION_SECONDS:
            if await request.is_disconnected():
                break
            messages = await messages_since(database, conversation_id, cursor)
            for message in messages:
                cursor = max(cursor, message.created_at)
                yield _sse(
                    "message",
                    {
                        "id": str(message.id),
                        "sender_user_id": (
                            str(message.sender_user_id)
                            if message.sender_user_id
                            else None
                        ),
                        "kind": message.kind,
                        "created_at": message.created_at.isoformat(),
                    },
                )
            if not messages:
                yield ": keep-alive\n\n"
            await asyncio.sleep(SSE_POLL_SECONDS)
            elapsed += SSE_POLL_SECONDS

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/{conversation_id}/participants/me")
async def update_my_participation(
    conversation_id: uuid.UUID,
    body: ParticipantPatchBody,
    actor: ActorDep,
    database: DatabaseDep,
) -> ParticipantModel:
    changes: dict = {}
    if body.mark_read:
        changes["last_read_at"] = datetime.now(UTC)
    fields = body.model_dump(exclude_unset=True)
    if "muted_until" in fields:
        changes["muted_until"] = body.muted_until
    if "archived" in fields:
        changes["archived_at"] = datetime.now(UTC) if body.archived else None
    participant = await update_participant_settings(
        database, actor, conversation_id, changes
    )
    return participant_model(participant)


def participant_model(participant: ConversationParticipant) -> ParticipantModel:
    return ParticipantModel.model_validate(participant)
