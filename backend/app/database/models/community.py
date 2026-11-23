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
    AlertSeverity,
    CheckInStatus,
    EventStatus,
    Language,
)


class Notice(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "notices"
    __table_args__ = (
        check_in("lang", Language),
        CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title_length"),
        CheckConstraint(
            "body IS NULL OR char_length(body) <= 5000", name="body_length"
        ),
        Index("ix_notices_circle_id_created_at", "circle_id", "created_at"),
    )

    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE")
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str]
    body: Mapped[str | None]
    lang: Mapped[str]
    translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    pinned: Mapped[bool] = mapped_column(server_default=text("false"))
    deleted_at: Mapped[datetime | None]


class CommunityEvent(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "community_events"
    __table_args__ = (
        check_in("status", EventStatus),
        check_in("lang", Language),
        CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title_length"),
        CheckConstraint("ends_at IS NULL OR ends_at >= starts_at", name="event_window"),
        CheckConstraint("capacity IS NULL OR capacity > 0", name="capacity_positive"),
        Index("ix_community_events_circle_id_starts_at", "circle_id", "starts_at"),
    )

    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE")
    )
    organizer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str]
    description: Mapped[str | None]
    lang: Mapped[str]
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime | None]
    location_note: Mapped[str | None]
    capacity: Mapped[int | None] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(server_default=EventStatus.SCHEDULED.value)
    cancelled_at: Mapped[datetime | None]


class EventSignup(CreatedAt, Base):
    __tablename__ = "event_signups"
    __table_args__ = (
        CheckConstraint("note IS NULL OR char_length(note) <= 500", name="note_length"),
        Index("ix_event_signups_user_id", "user_id"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("community_events.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    note: Mapped[str | None]


class DisasterAlert(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "disaster_alerts"
    __table_args__ = (
        check_in("severity", AlertSeverity),
        CheckConstraint("char_length(title) BETWEEN 1 AND 200", name="title_length"),
        CheckConstraint(
            "message IS NULL OR char_length(message) <= 2000", name="message_length"
        ),
        Index("ix_disaster_alerts_circle_id_created_at", "circle_id", "created_at"),
    )

    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE")
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    severity: Mapped[str]
    title: Mapped[str]
    message: Mapped[str | None]
    resolved_at: Mapped[datetime | None]


class DisasterCheckIn(CreatedAt, Base):
    __tablename__ = "disaster_check_ins"
    __table_args__ = (
        check_in("status", CheckInStatus),
        CheckConstraint(
            "note IS NULL OR char_length(note) <= 1000", name="note_length"
        ),
    )

    alert_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("disaster_alerts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    status: Mapped[str]
    note: Mapped[str | None]


class CheckInSetting(Base):
    __tablename__ = "check_in_settings"
    __table_args__ = (
        CheckConstraint("frequency_days BETWEEN 1 AND 30", name="frequency_range"),
        CheckConstraint(
            "buddy_user_id IS NULL OR buddy_user_id <> user_id", name="buddy_not_self"
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(server_default=text("false"))
    frequency_days: Mapped[int] = mapped_column(SmallInteger, server_default=text("3"))
    buddy_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    last_checked_in_at: Mapped[datetime | None]
    updated_at: Mapped[datetime] = mapped_column(
        server_default=text("now()"), onupdate=text("now()")
    )
