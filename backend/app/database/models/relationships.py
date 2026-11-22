import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import Base, Timestamps, UUIDPrimaryKey, check_in
from app.database.models.enums import (
    CaretakerRole,
    ConsentMethod,
    FamilyRelation,
    LinkStatus,
)


class FamilyLink(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "family_links"
    __table_args__ = (
        check_in("relation", FamilyRelation),
        check_in("status", LinkStatus),
        CheckConstraint("user_id <> relative_user_id", name="not_self"),
        Index(
            "uq_family_links_pair",
            func.least(text("user_id"), text("relative_user_id")),
            func.greatest(text("user_id"), text("relative_user_id")),
            unique=True,
        ),
        Index("ix_family_links_relative_user_id", "relative_user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    relative_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    relation: Mapped[str]
    status: Mapped[str] = mapped_column(server_default=LinkStatus.PENDING.value)
    decided_at: Mapped[datetime | None]


class ProxyGrant(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "proxy_grants"
    __table_args__ = (
        check_in("caretaker_role", CaretakerRole),
        check_in("consent_method", ConsentMethod),
        CheckConstraint("member_user_id <> caretaker_user_id", name="not_self"),
        Index(
            "uq_proxy_grants_active_pair",
            "member_user_id",
            "caretaker_user_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
        Index(
            "ix_proxy_grants_active_caretaker",
            "caretaker_user_id",
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    member_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    caretaker_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    caretaker_role: Mapped[str]
    can_post_requests: Mapped[bool] = mapped_column(server_default=text("true"))
    can_chat: Mapped[bool] = mapped_column(server_default=text("true"))
    can_thank_and_pay: Mapped[bool] = mapped_column(server_default=text("false"))
    can_view_activity: Mapped[bool] = mapped_column(server_default=text("true"))
    can_manage_listings: Mapped[bool] = mapped_column(server_default=text("false"))
    consent_method: Mapped[str]
    consent_witness_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id")
    )
    consented_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    revoked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class PairStats(Base):
    __tablename__ = "pair_stats"
    __table_args__ = (
        CheckConstraint("user_low_id < user_high_id", name="ordered_pair"),
        CheckConstraint(
            "low_helped_high >= 0 AND high_helped_low >= 0", name="counts_positive"
        ),
        Index("ix_pair_stats_user_high_id", "user_high_id"),
    )

    user_low_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    user_high_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    low_helped_high: Mapped[int] = mapped_column(server_default=text("0"))
    high_helped_low: Mapped[int] = mapped_column(server_default=text("0"))
    first_met_at: Mapped[datetime | None]
    last_exchange_at: Mapped[datetime | None]
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
