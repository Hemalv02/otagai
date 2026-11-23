import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import (
    CardType,
    ConversationKind,
    ConversationStatus,
    Language,
    MessageKind,
    ParticipantRole,
    TranslationStatus,
)


class Conversation(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        check_in("kind", ConversationKind),
        check_in("status", ConversationStatus),
        CheckConstraint(
            "(kind = 'request' AND request_id IS NOT NULL AND response_id IS NOT NULL"
            " AND listing_id IS NULL AND direct_key IS NULL)"
            " OR (kind = 'listing' AND listing_id IS NOT NULL AND request_id IS NULL"
            " AND response_id IS NULL AND direct_key IS NULL)"
            " OR (kind = 'direct' AND direct_key IS NOT NULL AND request_id IS NULL"
            " AND response_id IS NULL AND listing_id IS NULL)",
            name="kind_columns",
        ),
        Index(
            "uq_conversations_listing_starter",
            "listing_id",
            "started_by_user_id",
            unique=True,
            postgresql_where=text("kind = 'listing'"),
        ),
        Index("ix_conversations_request_id", "request_id"),
    )

    kind: Mapped[str]
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("help_requests.id", ondelete="CASCADE")
    )
    response_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("request_responses.id", ondelete="CASCADE"), unique=True
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE")
    )
    direct_key: Mapped[str | None] = mapped_column(unique=True)
    started_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(server_default=ConversationStatus.OPEN.value)
    last_message_at: Mapped[datetime | None]


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    __table_args__ = (
        check_in("role", ParticipantRole),
        Index("ix_conversation_participants_user_id", "user_id"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str]
    joined_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    left_at: Mapped[datetime | None]
    last_read_at: Mapped[datetime | None]
    muted_until: Mapped[datetime | None]
    archived_at: Mapped[datetime | None]


class Message(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "messages"
    __table_args__ = (
        check_in("kind", MessageKind),
        check_in("lang", Language, nullable=True),
        check_in("translation_status", TranslationStatus),
        check_in("card_type", CardType, nullable=True),
        CheckConstraint(
            "body IS NULL OR char_length(body) <= 4000", name="body_length"
        ),
        CheckConstraint(
            "(kind = 'system') = (sender_user_id IS NULL)", name="system_has_no_sender"
        ),
        CheckConstraint(
            "(kind = 'card') = (card_type IS NOT NULL AND card_ref_id IS NOT NULL)",
            name="card_has_ref",
        ),
        CheckConstraint(
            "kind NOT IN ('text', 'system') OR body IS NOT NULL", name="text_has_body"
        ),
        Index(
            "uq_messages_client_message",
            "conversation_id",
            "sender_user_id",
            "client_message_id",
            unique=True,
        ),
        Index(
            "ix_messages_conversation_created", "conversation_id", "created_at", "id"
        ),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    client_message_id: Mapped[uuid.UUID | None]
    kind: Mapped[str]
    body: Mapped[str | None]
    lang: Mapped[str | None]
    translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    translation_status: Mapped[str] = mapped_column(
        server_default=TranslationStatus.NONE.value
    )
    ai_assisted: Mapped[bool] = mapped_column(server_default=text("false"))
    card_type: Mapped[str | None]
    card_ref_id: Mapped[uuid.UUID | None]
    reply_to_message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL")
    )
    edited_at: Mapped[datetime | None]
    deleted_at: Mapped[datetime | None]


class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_files.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
