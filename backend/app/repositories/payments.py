import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Payment, PaymentEvent
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class DuplicateIdempotencyError(Exception):
    pass


class PaymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, payment_id: uuid.UUID) -> Payment | None:
        return await self._session.get(Payment, payment_id)

    async def get_for_update(self, payment_id: uuid.UUID) -> Payment | None:
        return await self._session.get(
            Payment, payment_id, with_for_update=True, populate_existing=True
        )

    async def get_by_idempotency_key(self, key: str) -> Payment | None:
        return await self._session.scalar(
            select(Payment).where(Payment.idempotency_key == key)
        )

    async def get_by_provider_id(
        self, provider: str, provider_payment_id: str
    ) -> Payment | None:
        return await self._session.scalar(
            select(Payment).where(
                Payment.provider == provider,
                Payment.provider_payment_id == provider_payment_id,
            )
        )

    async def create(self, values: dict[str, Any]) -> Payment:
        payment = Payment(**values)
        self._session.add(payment)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_payments_idempotency_key"):
                raise DuplicateIdempotencyError from error
            raise
        await self._session.refresh(payment)
        return payment

    async def update(self, payment: Payment, values: dict[str, Any]) -> Payment:
        for name, value in values.items():
            setattr(payment, name, value)
        await self._session.flush()
        await self._session.refresh(payment)
        return payment

    async def list_for_user(
        self, user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[Payment]:
        statement = select(Payment).where(
            (Payment.payer_user_id == user_id) | (Payment.payee_user_id == user_id)
        )
        return await paginate(
            self._session, statement, page, Payment.created_at, Payment.id
        )


class PaymentEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(
        self,
        provider: str,
        provider_event_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> bool:
        statement = (
            insert(PaymentEvent)
            .values(
                provider=provider,
                provider_event_id=provider_event_id,
                type=event_type,
                payload=payload,
            )
            .on_conflict_do_nothing(
                index_elements=[
                    PaymentEvent.provider,
                    PaymentEvent.provider_event_id,
                ]
            )
            .returning(PaymentEvent.id)
        )
        created = await self._session.scalar(statement)
        return created is not None
