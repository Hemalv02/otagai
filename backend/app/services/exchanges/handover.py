import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Exchange, HandoverCheck, HandoverItem
from app.database.models.enums import (
    ChecklistItemSource,
    MediaPurpose,
)
from app.repositories.exchanges import (
    ExchangeRepository,
    HandoverCheckExistsError,
    HandoverRepository,
)
from app.repositories.listings import ListingRepository
from app.repositories.media import MediaRepository
from app.services.actors.service import Actor
from app.services.errors import BadRequestError, ConflictError, NotFoundError


class CheckNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Checklist not found.")


class ItemNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Checklist item not found.")


class CheckExistsError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This phase already has a checklist.")


class CheckLockedError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This checklist is locked.")


@dataclass(frozen=True)
class CheckView:
    check: HandoverCheck
    items: list[HandoverItem]


def _is_participant(exchange: Exchange, user_id: uuid.UUID) -> bool:
    return user_id in (exchange.requester_user_id, exchange.helper_user_id)


async def _exchange_for_check(session, actor: Actor, check: HandoverCheck) -> Exchange:
    exchange = await ExchangeRepository(session).get(check.exchange_id)
    if exchange is None or not _is_participant(exchange, actor.subject_id):
        raise CheckNotFoundError
    return exchange


async def _validated_media(
    session, owner_user_id: uuid.UUID, media_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    deduped = list(dict.fromkeys(media_ids))
    if not deduped:
        return []
    owned = await MediaRepository(session).owned_ready_ids(
        deduped, owner_user_id, MediaPurpose.HANDOVER.value
    )
    if set(deduped) != owned:
        raise BadRequestError("Choose handover photos you have uploaded.")
    return deduped


async def create_check(
    database: Database,
    actor: Actor,
    exchange_id: uuid.UUID,
    phase: str,
    media_ids: list[uuid.UUID],
) -> CheckView:
    async with database.session() as session:
        exchange = await ExchangeRepository(session).get(exchange_id)
        if exchange is None or not _is_participant(exchange, actor.subject_id):
            raise CheckNotFoundError
        media = await _validated_media(session, actor.subject_id, media_ids)
        items: list[dict] = []
        if exchange.listing_id is not None:
            parts = await ListingRepository(session).parts_for(exchange.listing_id)
            items = [
                {
                    "label": part.label,
                    "quantity": part.quantity,
                    "source": ChecklistItemSource.LISTING_PART.value,
                }
                for part in parts
            ]
        handover = HandoverRepository(session)
        try:
            check = await handover.create_check(
                {
                    "exchange_id": exchange_id,
                    "phase": phase,
                    "created_by_user_id": actor.user.id,
                },
                items,
            )
        except HandoverCheckExistsError as error:
            raise CheckExistsError from error
        if media:
            await handover.attach_media(check.id, media)
        loaded = await handover.items_for(check.id)
    return CheckView(check=check, items=loaded)


async def list_checks(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> list[CheckView]:
    async with database.session() as session:
        exchange = await ExchangeRepository(session).get(exchange_id)
        if exchange is None or not _is_participant(exchange, actor.subject_id):
            raise CheckNotFoundError
        handover = HandoverRepository(session)
        checks = await handover.list_checks(exchange_id)
        views = [
            CheckView(check=check, items=await handover.items_for(check.id))
            for check in checks
        ]
    return views


async def get_check(database: Database, actor: Actor, check_id: uuid.UUID) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        check = await handover.get_check(check_id)
        if check is None:
            raise CheckNotFoundError
        await _exchange_for_check(session, actor, check)
        items = await handover.items_for(check_id)
    return CheckView(check=check, items=items)


def _is_locked(check: HandoverCheck) -> bool:
    return (
        check.lender_confirmed_at is not None
        and check.borrower_confirmed_at is not None
    )


async def add_item(
    database: Database,
    actor: Actor,
    check_id: uuid.UUID,
    label: str,
    quantity: int,
) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        check = await handover.get_check_for_update(check_id)
        if check is None:
            raise CheckNotFoundError
        await _exchange_for_check(session, actor, check)
        if _is_locked(check):
            raise CheckLockedError
        existing = await handover.items_for(check_id)
        await handover.add_item(
            {
                "check_id": check_id,
                "label": label,
                "quantity": quantity,
                "source": ChecklistItemSource.MANUAL.value,
                "sort_order": len(existing),
            }
        )
        items = await handover.items_for(check_id)
    return CheckView(check=check, items=items)


async def update_item(
    database: Database,
    actor: Actor,
    check_id: uuid.UUID,
    item_id: uuid.UUID,
    *,
    present: bool | None,
    dispute_note: str | None,
    dispute: bool,
) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        check = await handover.get_check_for_update(check_id)
        if check is None:
            raise CheckNotFoundError
        await _exchange_for_check(session, actor, check)
        if _is_locked(check):
            raise CheckLockedError
        item = await handover.get_item(item_id)
        if item is None or item.check_id != check_id:
            raise ItemNotFoundError
        changes: dict = {}
        if present is not None:
            changes["present"] = present
        if dispute:
            changes["disputed_by_user_id"] = actor.subject_id
            changes["dispute_note"] = dispute_note
        if changes:
            await handover.update_item(item, changes)
        items = await handover.items_for(check_id)
    return CheckView(check=check, items=items)


async def delete_item(
    database: Database,
    actor: Actor,
    check_id: uuid.UUID,
    item_id: uuid.UUID,
) -> None:
    async with database.session() as session:
        handover = HandoverRepository(session)
        check = await handover.get_check_for_update(check_id)
        if check is None:
            raise CheckNotFoundError
        await _exchange_for_check(session, actor, check)
        if (
            check.lender_confirmed_at is not None
            or check.borrower_confirmed_at is not None
        ):
            raise CheckLockedError
        item = await handover.get_item(item_id)
        if item is None or item.check_id != check_id:
            return
        await handover.delete_item(item)


async def confirm_check(
    database: Database, actor: Actor, check_id: uuid.UUID
) -> CheckView:
    now = datetime.now(UTC)
    async with database.session() as session:
        handover = HandoverRepository(session)
        check = await handover.get_check_for_update(check_id)
        if check is None:
            raise CheckNotFoundError
        exchange = await _exchange_for_check(session, actor, check)
        is_lender = actor.subject_id == exchange.helper_user_id
        changes: dict = {}
        if is_lender and check.lender_confirmed_at is None:
            changes["lender_confirmed_at"] = now
        if not is_lender and check.borrower_confirmed_at is None:
            changes["borrower_confirmed_at"] = now
        if changes:
            check = await handover.update_check(check, changes)
        items = await handover.items_for(check_id)
    return CheckView(check=check, items=items)
