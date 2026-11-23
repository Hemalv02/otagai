import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Exchange,
    HandoverCheck,
    HandoverItem,
    HandoverMedia,
    LoanExtension,
)
from app.database.models.enums import ExchangeStatus
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class ExtensionPendingError(Exception):
    pass


class HandoverCheckExistsError(Exception):
    pass


class ExchangeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, exchange_id: uuid.UUID) -> Exchange | None:
        return await self._session.get(Exchange, exchange_id)

    async def get_for_update(self, exchange_id: uuid.UUID) -> Exchange | None:
        return await self._session.get(
            Exchange, exchange_id, with_for_update=True, populate_existing=True
        )

    async def create(self, values: dict[str, Any]) -> Exchange:
        exchange = Exchange(**values)
        self._session.add(exchange)
        await self._session.flush()
        await self._session.refresh(exchange)
        return exchange

    async def update(self, exchange: Exchange, values: dict[str, Any]) -> Exchange:
        for name, value in values.items():
            setattr(exchange, name, value)
        await self._session.flush()
        await self._session.refresh(exchange)
        return exchange

    async def list_for_user(
        self, user_id: uuid.UUID, statuses: tuple[str, ...], page: PageRequest
    ) -> PageResult[Exchange]:
        statement = select(Exchange).where(
            (Exchange.requester_user_id == user_id)
            | (Exchange.helper_user_id == user_id)
        )
        if statuses:
            statement = statement.where(Exchange.status.in_(statuses))
        return await paginate(
            self._session, statement, page, Exchange.created_at, Exchange.id
        )

    async def active_for_request(self, request_id: uuid.UUID) -> Exchange | None:
        statement = (
            select(Exchange)
            .where(
                Exchange.request_id == request_id,
                Exchange.status != ExchangeStatus.CANCELLED.value,
            )
            .with_for_update()
        )
        return await self._session.scalar(statement)


class ExtensionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, extension_id: uuid.UUID) -> LoanExtension | None:
        return await self._session.get(LoanExtension, extension_id)

    async def get_for_update(self, extension_id: uuid.UUID) -> LoanExtension | None:
        return await self._session.get(
            LoanExtension,
            extension_id,
            with_for_update=True,
            populate_existing=True,
        )

    async def create(self, values: dict[str, Any]) -> LoanExtension:
        extension = LoanExtension(**values)
        self._session.add(extension)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_loan_extensions_one_pending"):
                raise ExtensionPendingError from error
            raise
        await self._session.refresh(extension)
        return extension

    async def update(
        self, extension: LoanExtension, values: dict[str, Any]
    ) -> LoanExtension:
        for name, value in values.items():
            setattr(extension, name, value)
        await self._session.flush()
        await self._session.refresh(extension)
        return extension

    async def list_for_exchange(
        self, exchange_id: uuid.UUID, page: PageRequest
    ) -> PageResult[LoanExtension]:
        statement = select(LoanExtension).where(
            LoanExtension.exchange_id == exchange_id
        )
        return await paginate(
            self._session, statement, page, LoanExtension.created_at, LoanExtension.id
        )


class HandoverRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_check(self, check_id: uuid.UUID) -> HandoverCheck | None:
        return await self._session.get(HandoverCheck, check_id)

    async def get_check_for_update(self, check_id: uuid.UUID) -> HandoverCheck | None:
        return await self._session.get(
            HandoverCheck, check_id, with_for_update=True, populate_existing=True
        )

    async def create_check(
        self, values: dict[str, Any], items: list[dict[str, Any]]
    ) -> HandoverCheck:
        check = HandoverCheck(**values)
        self._session.add(check)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_handover_checks_exchange_id_phase"):
                raise HandoverCheckExistsError from error
            raise
        for index, item in enumerate(items):
            self._session.add(
                HandoverItem(
                    check_id=check.id,
                    label=item["label"],
                    quantity=item.get("quantity", 1),
                    source=item["source"],
                    sort_order=index,
                )
            )
        await self._session.flush()
        await self._session.refresh(check)
        return check

    async def update_check(
        self, check: HandoverCheck, values: dict[str, Any]
    ) -> HandoverCheck:
        for name, value in values.items():
            setattr(check, name, value)
        await self._session.flush()
        await self._session.refresh(check)
        return check

    async def list_checks(self, exchange_id: uuid.UUID) -> list[HandoverCheck]:
        statement = (
            select(HandoverCheck)
            .where(HandoverCheck.exchange_id == exchange_id)
            .order_by(HandoverCheck.created_at)
        )
        return list(await self._session.scalars(statement))

    async def items_for(self, check_id: uuid.UUID) -> list[HandoverItem]:
        statement = (
            select(HandoverItem)
            .where(HandoverItem.check_id == check_id)
            .order_by(HandoverItem.sort_order, HandoverItem.id)
        )
        return list(await self._session.scalars(statement))

    async def get_item(self, item_id: uuid.UUID) -> HandoverItem | None:
        return await self._session.get(HandoverItem, item_id)

    async def add_item(self, values: dict[str, Any]) -> HandoverItem:
        item = HandoverItem(**values)
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def update_item(
        self, item: HandoverItem, values: dict[str, Any]
    ) -> HandoverItem:
        for name, value in values.items():
            setattr(item, name, value)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete_item(self, item: HandoverItem) -> None:
        await self._session.delete(item)
        await self._session.flush()

    async def attach_media(
        self, check_id: uuid.UUID, media_ids: list[uuid.UUID]
    ) -> None:
        for media_id in media_ids:
            self._session.add(HandoverMedia(check_id=check_id, media_id=media_id))
        await self._session.flush()
