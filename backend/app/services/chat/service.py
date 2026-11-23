import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.database.connection import Database
from app.database.models import (
    Conversation,
    ConversationParticipant,
    Message,
    User,
)
from app.database.models.enums import (
    ConversationKind,
    ConversationStatus,
    MediaPurpose,
    MessageKind,
    NotificationType,
    ParticipantRole,
    TranslationStatus,
)
from app.repositories.blocks import BlockRepository
from app.repositories.chat import (
    ConversationRepository,
    DuplicateMessageError,
    MessageRepository,
    direct_key,
)
from app.repositories.circles import CircleRepository
from app.repositories.listings import ListingRepository
from app.repositories.media import MediaRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.users import UserRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import BadRequestError, ConflictError, NotFoundError
from app.services.storage.service import Storage
from app.settings import Settings


class ConversationNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Conversation not found.")


class ConversationClosedError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This conversation is closed.")


class CannotStartChatError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("You can't start a chat with this person.")


@dataclass(frozen=True)
class MessageView:
    message: Message
    display_body: str | None
    attachments: dict[uuid.UUID, dict[str, str]]


@dataclass(frozen=True)
class ConversationView:
    conversation: Conversation
    participants: list[ConversationParticipant]
    last_message: Message | None
    unread_count: int


async def _require_participant(
    session, conversation_id: uuid.UUID, user_id: uuid.UUID, *, lock: bool = False
) -> ConversationParticipant:
    conversations = ConversationRepository(session)
    participant = (
        await conversations.get_participant_for_update(conversation_id, user_id)
        if lock
        else await conversations.get_participant(conversation_id, user_id)
    )
    if (
        participant is None
        or participant.left_at is not None
        or await conversations.has_blocked_participant(conversation_id, user_id)
    ):
        raise ConversationNotFoundError
    return participant


async def list_conversations(
    database: Database, actor: Actor, page: PageRequest
) -> PageResult[ConversationView]:
    actor.require(ProxyScope.CHAT)
    async with database.session() as session:
        conversations = ConversationRepository(session)
        messages = MessageRepository(session)
        result = await conversations.inbox(actor.subject_id, page)
        ids = [conversation.id for conversation in result.items]
        last = await messages.last_messages(ids)
        unread = await messages.unread_counts(actor.subject_id, ids)
        views = []
        for conversation in result.items:
            participants = await conversations.participants_for(conversation.id)
            views.append(
                ConversationView(
                    conversation=conversation,
                    participants=participants,
                    last_message=last.get(conversation.id),
                    unread_count=unread.get(conversation.id, 0),
                )
            )
    return PageResult(items=views, next_cursor=result.next_cursor)


async def get_conversation(
    database: Database, actor: Actor, conversation_id: uuid.UUID
) -> ConversationView:
    actor.require(ProxyScope.CHAT)
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)
        conversations = ConversationRepository(session)
        conversation = await conversations.get(conversation_id)
        participants = await conversations.participants_for(conversation_id)
        last = await MessageRepository(session).last_messages([conversation_id])
        unread = await MessageRepository(session).unread_counts(
            actor.subject_id, [conversation_id]
        )
    return ConversationView(
        conversation=conversation,
        participants=participants,
        last_message=last.get(conversation_id),
        unread_count=unread.get(conversation_id, 0),
    )


async def start_conversation(
    database: Database,
    actor: Actor,
    *,
    listing_id: uuid.UUID | None,
    target_user_id: uuid.UUID | None,
) -> tuple[ConversationView, bool]:
    actor.require(ProxyScope.CHAT)
    if (listing_id is None) == (target_user_id is None):
        raise CannotStartChatError
    starter = actor.subject_id
    async with database.session() as session:
        conversations = ConversationRepository(session)
        if listing_id is not None:
            listing = await ListingRepository(session).get(listing_id)
            if listing is None:
                raise ConversationNotFoundError
            owner_id = listing.owner_user_id
            if owner_id == starter:
                raise CannotStartChatError
            if not await _connected(session, starter, owner_id):
                raise CannotStartChatError
            existing = await conversations.find_listing_conversation(
                listing_id, starter
            )
            if existing is not None:
                return await _view(session, existing, actor.subject_id), False
            conversation = await conversations.create(
                {
                    "kind": ConversationKind.LISTING.value,
                    "listing_id": listing_id,
                    "started_by_user_id": starter,
                },
                [
                    {"user_id": starter, "role": ParticipantRole.ASKER.value},
                    {"user_id": owner_id, "role": ParticipantRole.OWNER.value},
                ],
            )
            return await _view(session, conversation, actor.subject_id), True

        if target_user_id == starter:
            raise CannotStartChatError
        if not await _connected(session, starter, target_user_id):
            raise CannotStartChatError
        key = direct_key(starter, target_user_id)
        existing = await conversations.find_direct(key)
        if existing is not None:
            return await _view(session, existing, actor.subject_id), False
        conversation = await conversations.create(
            {
                "kind": ConversationKind.DIRECT.value,
                "direct_key": key,
                "started_by_user_id": starter,
            },
            [
                {"user_id": starter, "role": ParticipantRole.MEMBER.value},
                {"user_id": target_user_id, "role": ParticipantRole.MEMBER.value},
            ],
        )
        return await _view(session, conversation, actor.subject_id), True


async def _connected(session, viewer_id: uuid.UUID, other_id: uuid.UUID) -> bool:
    if viewer_id == other_id:
        return False
    if await BlockRepository(session).is_blocked_either_way(viewer_id, other_id):
        return False
    return await CircleRepository(session).share_approved_circle(viewer_id, other_id)


async def _view(
    session, conversation: Conversation, viewer_id: uuid.UUID
) -> ConversationView:
    conversations = ConversationRepository(session)
    participants = await conversations.participants_for(conversation.id)
    last = await MessageRepository(session).last_messages([conversation.id])
    unread = await MessageRepository(session).unread_counts(
        viewer_id, [conversation.id]
    )
    return ConversationView(
        conversation=conversation,
        participants=participants,
        last_message=last.get(conversation.id),
        unread_count=unread.get(conversation.id, 0),
    )


async def list_messages(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    conversation_id: uuid.UUID,
    page: PageRequest,
) -> PageResult[MessageView]:
    actor.require(ProxyScope.CHAT)
    reader = await _reader_language(database, actor)
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)
        messages = MessageRepository(session)
        result = await messages.history(conversation_id, page)
        message_ids = [message.id for message in result.items]
        attachments = await messages.attachments_for(message_ids)
        media_ids = {mid for ids in attachments.values() for mid in ids}
        signed = await _sign_media(session, storage, settings, list(media_ids))
    views = [
        MessageView(
            message=message,
            display_body=_translated(message, reader),
            attachments={
                media_id: signed.get(media_id, {})
                for media_id in attachments.get(message.id, [])
            },
        )
        for message in result.items
    ]
    return PageResult(items=views, next_cursor=result.next_cursor)


async def _reader_language(database: Database, actor: Actor) -> str:
    return actor.subject.preferred_language


def _translated(message: Message, language: str) -> str | None:
    if message.deleted_at is not None:
        return None
    if message.translations and language in message.translations:
        return message.translations[language]
    return message.body


async def _sign_media(
    session, storage: Storage, settings: Settings, media_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, str]]:
    if not media_ids:
        return {}
    repository = MediaRepository(session)
    result: dict[uuid.UUID, dict[str, str]] = {}
    ttl = settings.media_signed_url_ttl_seconds
    for media_id in media_ids:
        variants = await repository.get_variants(media_id)
        signed = await asyncio.gather(
            *(storage.presigned_get_url(v.s3_key, expires_in=ttl) for v in variants)
        )
        result[media_id] = {
            variant.variant: url for variant, url in zip(variants, signed, strict=True)
        }
    return result


async def send_message(
    database: Database,
    actor: Actor,
    conversation_id: uuid.UUID,
    *,
    kind: str,
    body: str | None,
    client_message_id: uuid.UUID | None,
    media_ids: list[uuid.UUID],
) -> tuple[Message, bool]:
    actor.require(ProxyScope.CHAT)
    now = datetime.now(UTC)
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)
        conversations = ConversationRepository(session)
        conversation = await conversations.get(conversation_id)
        if conversation.status != ConversationStatus.OPEN.value:
            raise ConversationClosedError
        messages = MessageRepository(session)
        if client_message_id is not None:
            existing = await messages.find_by_client_id(
                conversation_id, actor.subject_id, client_message_id
            )
            if existing is not None:
                return existing, False
        attachments = await _validated_attachments(
            session, actor.subject_id, kind, media_ids
        )
        lang = actor.subject.preferred_language
        values = {
            "conversation_id": conversation_id,
            "sender_user_id": actor.subject_id,
            "acted_by_user_id": actor.user.id,
            "client_message_id": client_message_id,
            "kind": kind,
            "body": body,
            "lang": lang if body else None,
            "translation_status": (
                TranslationStatus.PENDING.value
                if body
                else TranslationStatus.NONE.value
            ),
        }
        try:
            message = await messages.create(values, attachments)
        except DuplicateMessageError:
            existing = await messages.find_by_client_id(
                conversation_id, actor.subject_id, client_message_id
            )
            if existing is not None:
                return existing, False
            raise
        await conversations.touch_last_message(conversation_id, now)
        recipients = [
            other.user_id
            for other in await conversations.participants_for(conversation_id)
            if other.user_id != actor.subject_id and other.left_at is None
        ]
        await NotificationRepository(session).create_many(
            recipients,
            NotificationType.MESSAGE.value,
            {"conversation_id": str(conversation_id), "message_id": str(message.id)},
        )
    return message, True


async def _validated_attachments(
    session, owner_user_id: uuid.UUID, kind: str, media_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    deduped = list(dict.fromkeys(media_ids))
    if kind in (MessageKind.IMAGE.value, MessageKind.VOICE.value) and not deduped:
        raise BadRequestError("Attach a file for this message.")
    if kind == MessageKind.TEXT.value and deduped:
        raise BadRequestError("A text message can't carry attachments.")
    if not deduped:
        return []
    purpose = (
        MediaPurpose.VOICE.value
        if kind == MessageKind.VOICE.value
        else MediaPurpose.CHAT.value
    )
    owned = await MediaRepository(session).owned_ready_ids(
        deduped, owner_user_id, purpose
    )
    if set(deduped) != owned:
        raise BadRequestError("Choose files you have uploaded.")
    return deduped


EDIT_WINDOW = timedelta(minutes=15)


class MessageNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Message not found.")


class MessageLockedError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This message can no longer be changed.")


async def edit_message(
    database: Database,
    actor: Actor,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: str,
) -> Message:
    actor.require(ProxyScope.CHAT)
    now = datetime.now(UTC)
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)
        messages = MessageRepository(session)
        message = await messages.get_for_update(message_id)
        if (
            message is None
            or message.conversation_id != conversation_id
            or message.sender_user_id != actor.subject_id
        ):
            raise MessageNotFoundError
        if (
            message.deleted_at is not None
            or message.kind != MessageKind.TEXT.value
            or now - message.created_at > EDIT_WINDOW
        ):
            raise MessageLockedError
        return await messages.update(
            message,
            {
                "body": body,
                "edited_at": now,
                "translations": {},
                "translation_status": TranslationStatus.PENDING.value,
            },
        )


async def delete_message(
    database: Database,
    actor: Actor,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
) -> None:
    actor.require(ProxyScope.CHAT)
    now = datetime.now(UTC)
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)
        messages = MessageRepository(session)
        message = await messages.get_for_update(message_id)
        if (
            message is None
            or message.conversation_id != conversation_id
            or message.sender_user_id != actor.subject_id
        ):
            return
        if message.deleted_at is None:
            await messages.update(message, {"deleted_at": now})


async def verify_stream_access(
    database: Database, actor: Actor, conversation_id: uuid.UUID
) -> None:
    actor.require(ProxyScope.CHAT)
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)


async def messages_since(
    database: Database, actor: Actor, conversation_id: uuid.UUID, after: datetime
) -> list[Message]:
    async with database.session() as session:
        await _require_participant(session, conversation_id, actor.subject_id)
        return await MessageRepository(session).since(conversation_id, after)


async def update_participant_settings(
    database: Database,
    actor: Actor,
    conversation_id: uuid.UUID,
    changes: dict,
) -> ConversationParticipant:
    actor.require(ProxyScope.CHAT)
    async with database.session() as session:
        participant = await _require_participant(
            session, conversation_id, actor.subject_id, lock=True
        )
        if not changes:
            return participant
        return await ConversationRepository(session).update_participant(
            participant, changes
        )


def participant_for(
    view: ConversationView, user_id: uuid.UUID
) -> ConversationParticipant | None:
    for participant in view.participants:
        if participant.user_id == user_id:
            return participant
    return None


async def resolve_users(
    database: Database, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, User]:
    async with database.session() as session:
        repository = UserRepository(session)
        result: dict[uuid.UUID, User] = {}
        for user_id in user_ids:
            user = await repository.get(user_id)
            if user is not None:
                result[user_id] = user
    return result
