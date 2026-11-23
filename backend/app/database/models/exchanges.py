import uuid
from datetime import datetime

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
    ChecklistItemSource,
    DecisionStatus,
    ExchangeMode,
    ExchangeStatus,
    HandoverPhase,
)


class Exchange(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "exchanges"
    __table_args__ = (
        check_in("mode", ExchangeMode),
        check_in("status", ExchangeStatus),
        CheckConstraint("requester_user_id <> helper_user_id", name="distinct_people"),
        CheckConstraint("mode = 'loan' OR due_at IS NULL", name="due_only_for_loan"),
        CheckConstraint(
            "meet_place_note IS NULL OR char_length(meet_place_note) <= 200",
            name="meet_place_length",
        ),
        Index(
            "uq_exchanges_live_request",
            "request_id",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
        ),
        Index("ix_exchanges_requester_user_id_status", "requester_user_id", "status"),
        Index("ix_exchanges_helper_user_id_status", "helper_user_id", "status"),
        Index(
            "ix_exchanges_active_due_at",
            "due_at",
            postgresql_where=text("status = 'active' AND due_at IS NOT NULL"),
        ),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("help_requests.id"))
    response_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("request_responses.id"), unique=True
    )
    requester_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    helper_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="SET NULL")
    )
    mode: Mapped[str]
    status: Mapped[str] = mapped_column(server_default=ExchangeStatus.SCHEDULED.value)
    scheduled_at: Mapped[datetime | None]
    meet_place_note: Mapped[str | None]
    due_at: Mapped[datetime | None]
    handed_over_at: Mapped[datetime | None]
    returned_at: Mapped[datetime | None]
    requester_confirmed_at: Mapped[datetime | None]
    helper_confirmed_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]
    cancelled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id")
    )
    cancelled_at: Mapped[datetime | None]
    cancel_reason: Mapped[str | None]


class LoanExtension(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "loan_extensions"
    __table_args__ = (
        check_in("status", DecisionStatus),
        CheckConstraint(
            "message IS NULL OR char_length(message) <= 1000", name="message_length"
        ),
        Index(
            "uq_loan_extensions_one_pending",
            "exchange_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    exchange_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exchanges.id", ondelete="CASCADE"), index=True
    )
    requested_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    new_due_at: Mapped[datetime]
    message: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default=DecisionStatus.PENDING.value)
    decided_at: Mapped[datetime | None]


class HandoverCheck(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "handover_checks"
    __table_args__ = (
        check_in("phase", HandoverPhase),
        CheckConstraint(
            "lender_confirmed_by_user_id <> borrower_confirmed_by_user_id",
            name="distinct_pickup_signers",
        ),
        Index(
            "uq_handover_checks_exchange_id_phase",
            "exchange_id",
            "phase",
            unique=True,
        ),
    )

    exchange_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exchanges.id", ondelete="CASCADE")
    )
    phase: Mapped[str]
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    lender_confirmed_at: Mapped[datetime | None]
    borrower_confirmed_at: Mapped[datetime | None]
    lender_confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id")
    )
    borrower_confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id")
    )
    ai_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ai_runs.id", ondelete="SET NULL")
    )


class HandoverItem(UUIDPrimaryKey, Base):
    __tablename__ = "handover_items"
    __table_args__ = (
        check_in("source", ChecklistItemSource),
        CheckConstraint("char_length(label) BETWEEN 1 AND 120", name="label_length"),
        CheckConstraint("quantity >= 1", name="quantity_positive"),
    )

    check_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("handover_checks.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str]
    quantity: Mapped[int] = mapped_column(SmallInteger, server_default=text("1"))
    source: Mapped[str]
    present: Mapped[bool | None]
    disputed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id")
    )
    dispute_note: Mapped[str | None]
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class HandoverMedia(Base):
    __tablename__ = "handover_media"

    check_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("handover_checks.id", ondelete="CASCADE"), primary_key=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_files.id", ondelete="CASCADE"), primary_key=True
    )
    item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("handover_items.id", ondelete="SET NULL")
    )
