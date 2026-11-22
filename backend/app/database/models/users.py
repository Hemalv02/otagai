import uuid
from datetime import datetime, time

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import (
    AgeBand,
    Language,
    Platform,
    Region,
    UserKind,
    UserStatus,
)


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"
    __table_args__ = (
        check_in("kind", UserKind),
        check_in("status", UserStatus),
        check_in("region", Region),
        check_in("preferred_language", Language),
        check_in("intro_lang", Language, nullable=True),
        check_in("age_band", AgeBand, nullable=True),
        CheckConstraint(
            "(kind = 'self') = (auth_user_id IS NOT NULL)", name="self_has_auth"
        ),
        CheckConstraint(
            "char_length(display_name) BETWEEN 1 AND 80", name="display_name_length"
        ),
        CheckConstraint(
            "text_scale_percent BETWEEN 80 AND 200", name="text_scale_range"
        ),
    )

    auth_user_id: Mapped[uuid.UUID | None] = mapped_column(unique=True)
    kind: Mapped[str]
    display_name: Mapped[str]
    avatar_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_files.id", ondelete="SET NULL", use_alter=True)
    )
    preferred_language: Mapped[str]
    languages: Mapped[list[str]] = mapped_column(server_default=text("'{}'"))
    region: Mapped[str]
    timezone: Mapped[str] = mapped_column(server_default="Asia/Tokyo")
    age_band: Mapped[str | None]
    intro: Mapped[str | None]
    intro_lang: Mapped[str | None]
    happy_to_help_with: Mapped[str | None]
    accepts_money_orei: Mapped[bool] = mapped_column(server_default=text("true"))
    simple_mode: Mapped[bool] = mapped_column(server_default=text("false"))
    text_scale_percent: Mapped[int] = mapped_column(
        SmallInteger, server_default=text("100")
    )
    push_enabled: Mapped[bool] = mapped_column(server_default=text("true"))
    quiet_hours_start: Mapped[time | None]
    quiet_hours_end: Mapped[time | None]
    status: Mapped[str] = mapped_column(server_default=UserStatus.ACTIVE.value)
    last_active_at: Mapped[datetime | None]
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    deleted_at: Mapped[datetime | None]


class PushToken(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "push_tokens"
    __table_args__ = (check_in("platform", Platform),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expo_token: Mapped[str] = mapped_column(unique=True)
    platform: Mapped[str]
    last_seen_at: Mapped[datetime | None]
    disabled_at: Mapped[datetime | None]
