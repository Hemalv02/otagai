import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Conversation,
    ConversationParticipant,
    Message,
    MessageAttachment,
)
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class DuplicateMessageError(Exception):
    pass


def direct_key(user_a: uuid.UUID, user_b: uuid.UUID) -> str:
    low, high = sorted((str(user_a), str(user_b)))
    return f"{low}:{high}"


@dataclass(frozen=True)
class InboxEntry:
    conversation: Conversation
    participant: ConversationParticipant
    last_message: Message | None
    unread_count: int


class ConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, conversation_id: uuid.UUID) -> Conversation | None:
        return await self._session.get(Conversation, conversation_id)

    async def create(
        self, values: dict[str, Any], participants: list[dict[str, Any]]
    ) -> Conversation:
        conversation = Conversation(**values)
        self._session.add(conversation)
        await self._session.flush()
        for participant in participants:
            self._session.add(
                ConversationParticipant(conversation_id=conversation.id, **participant)
            )
        await self._session.flush()
        await self._session.refresh(conversation)
        return conversation

    async def find_listing_conversation(
        self, listing_id: uuid.UUID, starter_user_id: uuid.UUID
    ) -> Conversation | None:
        statement = select(Conversation).where(
            Conversation.listing_id == listing_id,
            Conversation.started_by_user_id == starter_user_id,
        )
        return await self._session.scalar(statement)

    async def find_direct(self, key: str) -> Conversation | None:
        statement = select(Conversation).where(Conversation.direct_key == key)
        return await self._session.scalar(statement)

    async def participants_for(
        self, conversation_id: uuid.UUID
    ) -> list[ConversationParticipant]:
        statement = select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id
        )
        return list(await self._session.scalars(statement))

    async def get_participant(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID
    ) -> ConversationParticipant | None:
        return await self._session.get(
            ConversationParticipant, (conversation_id, user_id)
        )

    async def get_participant_for_update(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID
    ) -> ConversationParticipant | None:
        return await self._session.get(
            ConversationParticipant,
            (conversation_id, user_id),
            with_for_update=True,
            populate_existing=True,
        )

    async def update_participant(
        self, participant: ConversationParticipant, values: dict[str, Any]
    ) -> ConversationParticipant:
        for name, value in values.items():
            setattr(participant, name, value)
        await self._session.flush()
        await self._session.refresh(participant)
        return participant

    async def touch_last_message(
        self, conversation_id: uuid.UUID, when: datetime
    ) -> None:
        conversation = await self._session.get(Conversation, conversation_id)
        if conversation is not None:
            conversation.last_message_at = when
            await self._session.flush()

    async def inbox(
        self, user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[Conversation]:
        statement = (
            select(Conversation)
            .join(
                ConversationParticipant,
                ConversationParticipant.conversation_id == Conversation.id,
            )
            .where(
                ConversationParticipant.user_id == user_id,
                ConversationParticipant.left_at.is_(None),
                ConversationParticipant.archived_at.is_(None),
                Conversation.last_message_at.is_not(None),
            )
        )
        return await paginate(
            self._session,
            statement,
            page,
            Conversation.last_message_at,
            Conversation.id,
        )


class MessageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, message_id: uuid.UUID) -> Message | None:
        return await self._session.get(Message, message_id)

    async def get_for_update(self, message_id: uuid.UUID) -> Message | None:
        return await self._session.get(
            Message, message_id, with_for_update=True, populate_existing=True
        )

    async def find_by_client_id(
        self,
        conversation_id: uuid.UUID,
        sender_user_id: uuid.UUID,
        client_message_id: uuid.UUID,
    ) -> Message | None:
        statement = select(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_user_id == sender_user_id,
            Message.client_message_id == client_message_id,
        )
        return await self._session.scalar(statement)

    async def create(
        self, values: dict[str, Any], media_ids: list[uuid.UUID]
    ) -> Message:
        message = Message(**values)
        self._session.add(message)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_messages_client_message"):
                raise DuplicateMessageError from error
            raise
        for index, media_id in enumerate(media_ids):
            self._session.add(
                MessageAttachment(
                    message_id=message.id, media_id=media_id, sort_order=index
                )
            )
        await self._session.flush()
        await self._session.refresh(message)
        return message

    async def update(self, message: Message, values: dict[str, Any]) -> Message:
        for name, value in values.items():
            setattr(message, name, value)
        await self._session.flush()
        await self._session.refresh(message)
        return message

    async def history(
        self, conversation_id: uuid.UUID, page: PageRequest
    ) -> PageResult[Message]:
        statement = select(Message).where(Message.conversation_id == conversation_id)
        return await paginate(
            self._session, statement, page, Message.created_at, Message.id
        )

    async def since(
        self, conversation_id: uuid.UUID, after: datetime, limit: int = 50
    ) -> list[Message]:
        statement = (
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.created_at > after,
            )
            .order_by(Message.created_at.asc(), Message.id.asc())
            .limit(limit)
        )
        return list(await self._session.scalars(statement))

    async def last_messages(
        self, conversation_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, Message]:
        if not conversation_ids:
            return {}
        ranked = (
            select(
                Message.id,
                func.row_number()
                .over(
                    partition_by=Message.conversation_id,
                    order_by=(Message.created_at.desc(), Message.id.desc()),
                )
                .label("rank"),
            )
            .where(Message.conversation_id.in_(conversation_ids))
            .subquery()
        )
        latest_ids: Select[tuple[uuid.UUID]] = select(ranked.c.id).where(
            ranked.c.rank == 1
        )
        statement = select(Message).where(Message.id.in_(latest_ids))
        result = await self._session.scalars(statement)
        return {message.conversation_id: message for message in result}

    async def unread_counts(
        self, user_id: uuid.UUID, conversation_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        if not conversation_ids:
            return {}
        last_read = (
            select(
                ConversationParticipant.conversation_id,
                ConversationParticipant.last_read_at,
            )
            .where(
                ConversationParticipant.user_id == user_id,
                ConversationParticipant.conversation_id.in_(conversation_ids),
            )
            .subquery()
        )
        statement = (
            select(Message.conversation_id, func.count())
            .join(last_read, last_read.c.conversation_id == Message.conversation_id)
            .where(
                Message.sender_user_id != user_id,
                Message.deleted_at.is_(None),
                (last_read.c.last_read_at.is_(None))
                | (Message.created_at > last_read.c.last_read_at),
            )
            .group_by(Message.conversation_id)
        )
        return {row[0]: row[1] for row in await self._session.execute(statement)}

    async def total_unread(self, user_id: uuid.UUID) -> int:
        last_read = (
            select(
                ConversationParticipant.conversation_id,
                ConversationParticipant.last_read_at,
            )
            .where(ConversationParticipant.user_id == user_id)
            .subquery()
        )
        statement = (
            select(func.count())
            .select_from(Message)
            .join(last_read, last_read.c.conversation_id == Message.conversation_id)
            .where(
                Message.sender_user_id != user_id,
                Message.deleted_at.is_(None),
                (last_read.c.last_read_at.is_(None))
                | (Message.created_at > last_read.c.last_read_at),
            )
        )
        return await self._session.scalar(statement) or 0

    async def attachments_for(
        self, message_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        if not message_ids:
            return {}
        statement = (
            select(MessageAttachment.message_id, MessageAttachment.media_id)
            .where(MessageAttachment.message_id.in_(message_ids))
            .order_by(MessageAttachment.sort_order)
        )
        result: dict[uuid.UUID, list[uuid.UUID]] = {}
        for message_id, media_id in await self._session.execute(statement):
            result.setdefault(message_id, []).append(media_id)
        return result
