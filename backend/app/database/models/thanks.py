import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, BigInteger, CheckConstraint, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.models.base import (
    Base,
    CreatedAt,
    Timestamps,
    UUIDPrimaryKey,
    check_in,
)
from app.database.models.enums import (
    Currency,
    GiftType,
    Language,
    MoneyStatus,
    PaymentProvider,
    PaymentStatus,
    PointsReason,
)


class Payment(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "payments"
    __table_args__ = (
        check_in("provider", PaymentProvider),
        check_in("status", PaymentStatus),
        check_in("currency", Currency),
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint("payer_user_id <> payee_user_id", name="distinct_people"),
        Index("ix_payments_payer_user_id", "payer_user_id"),
        Index("ix_payments_payee_user_id", "payee_user_id"),
    )

    payer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    payee_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[str]
    provider_payment_id: Mapped[str | None] = mapped_column(unique=True)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(CHAR(3))
    status: Mapped[str] = mapped_column(
        server_default=PaymentStatus.REQUIRES_PAYMENT.value
    )
    idempotency_key: Mapped[str] = mapped_column(unique=True)
    failure_reason: Mapped[str | None]


class PaymentEvent(UUIDPrimaryKey, Base):
    __tablename__ = "payment_events"
    __table_args__ = (
        check_in("provider", PaymentProvider),
        Index(
            "uq_payment_events_provider_event",
            "provider",
            "provider_event_id",
            unique=True,
        ),
    )

    provider: Mapped[str]
    provider_event_id: Mapped[str]
    type: Mapped[str]
    payload: Mapped[dict[str, Any]]
    received_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    processed_at: Mapped[datetime | None]
    error: Mapped[str | None]


class ThankYou(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "thank_yous"
    __table_args__ = (
        check_in("gift_type", GiftType),
        check_in("money_status", MoneyStatus),
        check_in("lang", Language, nullable=True),
        check_in("currency", Currency, nullable=True),
        CheckConstraint("from_user_id <> to_user_id", name="distinct_people"),
        CheckConstraint(
            "note IS NULL OR char_length(note) <= 1000", name="note_length"
        ),
        CheckConstraint(
            "(gift_type = 'money') = (amount_minor IS NOT NULL AND currency IS NOT NULL)",
            name="money_has_amount",
        ),
        CheckConstraint(
            "amount_minor IS NULL OR amount_minor > 0", name="amount_positive"
        ),
        CheckConstraint(
            "(gift_type = 'points') = (points_amount IS NOT NULL)",
            name="points_has_amount",
        ),
        CheckConstraint(
            "points_amount IS NULL OR points_amount > 0", name="points_positive"
        ),
        Index(
            "uq_thank_yous_exchange_id_from_user_id",
            "exchange_id",
            "from_user_id",
            unique=True,
        ),
        Index("ix_thank_yous_to_user_id", "to_user_id"),
    )

    exchange_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exchanges.id"))
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    acted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None]
    lang: Mapped[str | None]
    translations: Mapped[dict[str, Any]] = mapped_column(
        server_default=text("'{}'::jsonb")
    )
    ai_drafted: Mapped[bool] = mapped_column(server_default=text("false"))
    gift_type: Mapped[str]
    points_amount: Mapped[int | None]
    amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str | None] = mapped_column(CHAR(3))
    money_status: Mapped[str] = mapped_column(server_default=MoneyStatus.NONE.value)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), unique=True
    )
    allow_wall_sharing: Mapped[bool] = mapped_column(server_default=text("false"))
    show_on_wall: Mapped[bool] = mapped_column(server_default=text("false"))


class PointsEntry(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "points_ledger"
    __table_args__ = (
        check_in("reason", PointsReason),
        CheckConstraint("delta <> 0", name="delta_nonzero"),
        Index(
            "uq_points_ledger_thank_you_id_user_id",
            "thank_you_id",
            "user_id",
            unique=True,
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[int]
    reason: Mapped[str]
    thank_you_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("thank_yous.id", ondelete="SET NULL")
    )
