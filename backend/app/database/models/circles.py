import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import (
    CircleStatus,
    CircleUnitType,
    JoinMethod,
    MembershipRole,
    MembershipStatus,
    Region,
)


class Circle(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "circles"
    __table_args__ = (
        check_in("region", Region),
        check_in("unit_type", CircleUnitType),
        check_in("status", CircleStatus),
        CheckConstraint("char_length(name) BETWEEN 1 AND 120", name="name_length"),
        CheckConstraint(
            "approx_lat IS NULL OR approx_lat BETWEEN -90 AND 90", name="lat_range"
        ),
        CheckConstraint(
            "approx_lng IS NULL OR approx_lng BETWEEN -180 AND 180", name="lng_range"
        ),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="not_own_parent"),
        Index("ix_circles_region_status", "region", "status"),
    )

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("circles.id"), index=True
    )
    region: Mapped[str]
    unit_type: Mapped[str]
    name: Mapped[str]
    name_translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    approx_lat: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    approx_lng: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    open_to_nearby: Mapped[bool] = mapped_column(server_default=text("true"))
    status: Mapped[str] = mapped_column(server_default=CircleStatus.ACTIVE.value)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class CircleInvite(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "circle_invites"
    __table_args__ = (
        CheckConstraint("char_length(code) BETWEEN 8 AND 32", name="code_length"),
        CheckConstraint("max_uses IS NULL OR max_uses > 0", name="max_uses_positive"),
        CheckConstraint(
            "use_count >= 0 AND (max_uses IS NULL OR use_count <= max_uses)",
            name="use_count_range",
        ),
    )

    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(unique=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime | None]
    max_uses: Mapped[int | None]
    use_count: Mapped[int] = mapped_column(server_default=text("0"))
    auto_approve: Mapped[bool] = mapped_column(server_default=text("false"))
    revoked_at: Mapped[datetime | None]


class CircleMembership(Timestamps, Base):
    __tablename__ = "circle_memberships"
    __table_args__ = (
        check_in("role", MembershipRole),
        check_in("status", MembershipStatus),
        check_in("joined_via", JoinMethod),
        Index("ix_circle_memberships_user_id_status", "user_id", "status"),
        Index(
            "ix_circle_memberships_approved",
            "circle_id",
            postgresql_where=text("status = 'approved'"),
        ),
    )

    circle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("circles.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(server_default=MembershipRole.MEMBER.value)
    status: Mapped[str] = mapped_column(server_default=MembershipStatus.PENDING.value)
    joined_via: Mapped[str]
    invite_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("circle_invites.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None]
