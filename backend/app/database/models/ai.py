import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import AiFeature, AiRunStatus


class AiRun(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "ai_runs"
    __table_args__ = (
        check_in("feature", AiFeature),
        check_in("status", AiRunStatus),
        CheckConstraint(
            "latency_ms IS NULL OR latency_ms >= 0", name="latency_positive"
        ),
        Index("ix_ai_runs_feature_created_at", "feature", "created_at"),
        Index("ix_ai_runs_user_id", "user_id"),
        Index("ix_ai_runs_created_at", "created_at"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    feature: Mapped[str]
    model: Mapped[str]
    input: Mapped[dict[str, Any]]
    output: Mapped[dict[str, Any] | None]
    status: Mapped[str]
    error: Mapped[str | None]
    latency_ms: Mapped[int | None]
    input_tokens: Mapped[int | None]
    output_tokens: Mapped[int | None]


class AssistantThread(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "assistant_threads"
    __table_args__ = (
        Index("ix_assistant_threads_user_id_updated_at", "user_id", "updated_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    title: Mapped[str]


class AssistantTurn(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "assistant_turns"
    __table_args__ = (
        Index("ix_assistant_turns_thread_id_created_at", "thread_id", "created_at"),
    )

    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assistant_threads.id", ondelete="CASCADE")
    )
    text: Mapped[str | None]
    reply: Mapped[str]
    image_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_files.id", ondelete="SET NULL")
    )
    context: Mapped[dict[str, Any]]
    draft: Mapped[dict[str, Any] | None]
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("help_requests.id", ondelete="SET NULL")
    )
