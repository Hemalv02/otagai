import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base, CreatedAt, UUIDPrimaryKey, check_in
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
