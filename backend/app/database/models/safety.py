import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import (
    NotificationType,
    ReportReason,
    ReportStatus,
    ReportTargetType,
)


class Notification(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        check_in("type", NotificationType),
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
        Index(
            "ix_notifications_unread",
            "user_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str]
    payload: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'::jsonb"))
    read_at: Mapped[datetime | None]
    pushed_at: Mapped[datetime | None]


class Block(CreatedAt, Base):
    __tablename__ = "blocks"
    __table_args__ = (
        CheckConstraint("blocker_user_id <> blocked_user_id", name="not_self"),
        Index("ix_blocks_blocked_user_id", "blocked_user_id"),
    )

    blocker_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    blocked_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )


class Report(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "reports"
    __table_args__ = (
        check_in("target_type", ReportTargetType),
        check_in("reason", ReportReason),
        check_in("status", ReportStatus),
        CheckConstraint(
            "details IS NULL OR char_length(details) <= 2000", name="details_length"
        ),
        Index("ix_reports_circle_id_status", "circle_id", "status"),
        Index("ix_reports_target", "target_type", "target_id"),
    )

    reporter_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    target_type: Mapped[str]
    target_id: Mapped[uuid.UUID]
    circle_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("circles.id", ondelete="SET NULL")
    )
    reason: Mapped[str]
    details: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default=ReportStatus.OPEN.value)
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id")
    )
    resolved_at: Mapped[datetime | None]
