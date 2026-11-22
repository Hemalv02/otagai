import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import (
    MediaKind,
    MediaPurpose,
    MediaStatus,
    MediaVariantName,
    StoredMimeType,
)


class MediaFile(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "media_files"
    __table_args__ = (
        check_in("kind", MediaKind),
        check_in("purpose", MediaPurpose),
        check_in("status", MediaStatus),
        CheckConstraint(
            "byte_size IS NULL OR byte_size > 0", name="byte_size_positive"
        ),
        CheckConstraint(
            "sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'", name="sha256_format"
        ),
        CheckConstraint(
            "(kind = 'audio') = (purpose = 'voice')", name="audio_only_for_voice"
        ),
        Index(
            "ix_media_files_delete_after",
            "delete_after",
            postgresql_where=text("delete_after IS NOT NULL AND deleted_at IS NULL"),
        ),
        Index("ix_media_files_sha256", "sha256"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str]
    purpose: Mapped[str]
    status: Mapped[str] = mapped_column(server_default=MediaStatus.PROCESSING.value)
    reject_reason: Mapped[str | None]
    byte_size: Mapped[int | None] = mapped_column(BigInteger)
    width: Mapped[int | None]
    height: Mapped[int | None]
    duration_ms: Mapped[int | None]
    sha256: Mapped[str | None]
    blurhash: Mapped[str | None]
    captured_at: Mapped[datetime | None]
    delete_after: Mapped[datetime | None]
    deleted_at: Mapped[datetime | None]


class MediaVariant(CreatedAt, Base):
    __tablename__ = "media_variants"
    __table_args__ = (
        check_in("variant", MediaVariantName),
        check_in("mime_type", StoredMimeType),
        CheckConstraint("byte_size > 0", name="byte_size_positive"),
        CheckConstraint(
            r"s3_key ~ '^media/[0-9a-f-]{36}/[a-z]+\.[a-z0-9]+$'",
            name="s3_key_format",
        ),
    )

    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_files.id", ondelete="CASCADE"), primary_key=True
    )
    variant: Mapped[str] = mapped_column(primary_key=True)
    s3_key: Mapped[str] = mapped_column(unique=True)
    mime_type: Mapped[str]
    width: Mapped[int | None]
    height: Mapped[int | None]
    byte_size: Mapped[int] = mapped_column(BigInteger)
