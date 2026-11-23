import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base, Timestamps, UUIDPrimaryKey, check_in
from app.database.models.enums import (
    AskInputMode,
    AskStatus,
    Language,
    Region,
    RequestKind,
    RequestStatus,
    RequestTone,
    ResponseKind,
    ResponseStatus,
    RippleStage,
)


class HelpRequest(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "help_requests"
    __table_args__ = (
        check_in("region", Region),
        check_in("kind", RequestKind),
        check_in("tone", RequestTone),
        check_in("lang", Language),
        check_in("ripple_stage", RippleStage),
        check_in("ripple_max_stage", RippleStage),
        check_in("status", RequestStatus),
        CheckConstraint(
            "char_length(raw_text) BETWEEN 1 AND 2000", name="raw_text_length"
        ),
        CheckConstraint(
            "char_length(polite_text) BETWEEN 1 AND 2000", name="polite_text_length"
        ),
        CheckConstraint(
            "needed_until IS NULL OR needed_from IS NULL OR needed_until >= needed_from",
            name="needed_window",
        ),
        CheckConstraint(
            "direct_to_user_id IS NULL OR direct_to_user_id <> requester_user_id",
            name="not_direct_to_self",
        ),
        CheckConstraint(
            "(direct_to_user_id IS NOT NULL) = (ripple_max_stage = 'direct')",
            name="direct_stage",
        ),
        Index(
            "ix_help_requests_requester_user_id_status", "requester_user_id", "status"
        ),
        Index("ix_help_requests_home_circle_id_status", "home_circle_id", "status"),
        Index(
            "ix_help_requests_open_widen",
            "next_widen_at",
            postgresql_where=text("status = 'open'"),
        ),
        Index(
            "ix_help_requests_open_expires",
            "expires_at",
            postgresql_where=text("status = 'open'"),
        ),
        Index(
            "ix_help_requests_direct_to_user_id",
            "direct_to_user_id",
            postgresql_where=text("direct_to_user_id IS NOT NULL"),
        ),
    )

    requester_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    region: Mapped[str]
    kind: Mapped[str]
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="SET NULL")
    )
    direct_to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    raw_text: Mapped[str]
    polite_text: Mapped[str]
    tone: Mapped[str]
    lang: Mapped[str]
    translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    needed_from: Mapped[datetime | None]
    needed_until: Mapped[datetime | None]
    home_circle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("circles.id"))
    ripple_stage: Mapped[str]
    ripple_max_stage: Mapped[str]
    ripple_history: Mapped[dict[str, str]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb")
    )
    next_widen_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(server_default=RequestStatus.OPEN.value)
    expires_at: Mapped[datetime]
    cancelled_at: Mapped[datetime | None]
    cancel_reason: Mapped[str | None]


class AskSession(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "ask_sessions"
    __table_args__ = (
        check_in("input_mode", AskInputMode),
        check_in("status", AskStatus),
        CheckConstraint(
            "input_text IS NULL OR char_length(input_text) <= 2000",
            name="input_text_length",
        ),
        Index("ix_ask_sessions_subject_user_id", "subject_user_id"),
    )

    subject_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    input_mode: Mapped[str]
    input_text: Mapped[str | None]
    transcript: Mapped[str | None]
    input_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_files.id", ondelete="SET NULL")
    )
    clarifying_question: Mapped[str | None]
    clarifying_answer: Mapped[str | None]
    identified: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    status: Mapped[str] = mapped_column(server_default=AskStatus.CLARIFYING.value)
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("help_requests.id", ondelete="SET NULL")
    )


class RequestMedia(Base):
    __tablename__ = "request_media"

    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("help_requests.id", ondelete="CASCADE"), primary_key=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_files.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class RequestRecipient(Base):
    __tablename__ = "request_recipients"
    __table_args__ = (
        check_in("stage", RippleStage),
        Index("ix_request_recipients_user_id_notified_at", "user_id", "notified_at"),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("help_requests.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    stage: Mapped[str]
    notified_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    seen_at: Mapped[datetime | None]
    hidden_at: Mapped[datetime | None]
    match_score: Mapped[float | None]
    match_reasons: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )


class RequestResponse(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "request_responses"
    __table_args__ = (
        check_in("kind", ResponseKind),
        check_in("status", ResponseStatus),
        check_in("lang", Language, nullable=True),
        CheckConstraint(
            "message IS NULL OR char_length(message) <= 2000", name="message_length"
        ),
        CheckConstraint(
            "proposed_end IS NULL OR proposed_start IS NULL "
            "OR proposed_end >= proposed_start",
            name="proposed_window",
        ),
        CheckConstraint(
            "kind <> 'counter_time' OR proposed_start IS NOT NULL",
            name="counter_has_time",
        ),
        Index(
            "uq_request_responses_live_responder",
            "request_id",
            "responder_user_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'accepted')"),
        ),
        Index(
            "uq_request_responses_one_accepted",
            "request_id",
            unique=True,
            postgresql_where=text("status = 'accepted'"),
        ),
        Index("ix_request_responses_responder_user_id", "responder_user_id"),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("help_requests.id", ondelete="CASCADE")
    )
    responder_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str]
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="SET NULL")
    )
    brings_tool: Mapped[bool] = mapped_column(server_default=text("false"))
    proposed_start: Mapped[datetime | None]
    proposed_end: Mapped[datetime | None]
    message: Mapped[str | None]
    lang: Mapped[str | None]
    translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(server_default=ResponseStatus.PENDING.value)
    decided_at: Mapped[datetime | None]
