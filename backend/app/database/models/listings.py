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
    Language,
    LendMode,
    ListingKind,
    ListingStatus,
    ListingVisibility,
)


class Category(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "categories"
    __table_args__ = (
        check_in("kind", ListingKind),
        CheckConstraint("slug ~ '^[a-z0-9_]{2,64}$'", name="slug_format"),
    )

    slug: Mapped[str] = mapped_column(unique=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), index=True
    )
    kind: Mapped[str]
    names: Mapped[dict[str, Any]]
    icon: Mapped[str | None]
    is_risky: Mapped[bool] = mapped_column(server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class Listing(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "listings"
    __table_args__ = (
        check_in("kind", ListingKind),
        check_in("lend_mode", LendMode),
        check_in("status", ListingStatus),
        check_in("visibility", ListingVisibility),
        check_in("lang", Language),
        CheckConstraint("char_length(title) BETWEEN 1 AND 120", name="title_length"),
        CheckConstraint(
            "description IS NULL OR char_length(description) <= 2000",
            name="description_length",
        ),
        CheckConstraint(
            "max_loan_days IS NULL OR max_loan_days BETWEEN 1 AND 60",
            name="max_loan_days_range",
        ),
        CheckConstraint(
            "kind = 'tool' OR lend_mode = 'help_only'", name="skill_is_help_only"
        ),
        Index("ix_listings_owner_user_id_status", "owner_user_id", "status"),
        Index("ix_listings_category_id_status", "category_id", "status"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str]
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"))
    title: Mapped[str]
    description: Mapped[str | None]
    lang: Mapped[str]
    translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    safety_notes: Mapped[str | None]
    lend_mode: Mapped[str]
    max_loan_days: Mapped[int | None] = mapped_column(SmallInteger)
    availability_note: Mapped[str | None]
    visibility: Mapped[str] = mapped_column(
        server_default=ListingVisibility.ASSOCIATION.value
    )
    status: Mapped[str] = mapped_column(server_default=ListingStatus.ACTIVE.value)
    available_again_at: Mapped[datetime | None]
    ai_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ai_runs.id", ondelete="SET NULL")
    )
    deleted_at: Mapped[datetime | None]


class ListingPart(UUIDPrimaryKey, Base):
    __tablename__ = "listing_parts"
    __table_args__ = (
        CheckConstraint("char_length(label) BETWEEN 1 AND 120", name="label_length"),
        CheckConstraint("quantity >= 1", name="quantity_positive"),
    )

    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str]
    quantity: Mapped[int] = mapped_column(SmallInteger, server_default=text("1"))
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class ListingMedia(Base):
    __tablename__ = "listing_media"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_files.id", ondelete="CASCADE"),
        primary_key=True,
        unique=True,
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
