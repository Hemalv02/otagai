import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Exchange, HandoverCheck, HandoverItem
from app.database.models.enums import (
    ChecklistItemSource,
    ExchangeMode,
    ExchangeStatus,
    HandoverPhase,
    MediaKind,
    MediaPurpose,
    MediaStatus,
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

MAX_CHECK_PHOTOS = 8


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


class CheckDisputeError(ConflictError):
    def __init__(self) -> None:
        super().__init__("The person who flagged this item needs to resolve it.")


@dataclass(frozen=True)
class CheckView:
    check: HandoverCheck
    items: list[HandoverItem]
    media_ids: list[uuid.UUID]
    requires_reconfirmation: bool


def _is_participant(exchange: Exchange, user_id: uuid.UUID) -> bool:
    return user_id in (exchange.requester_user_id, exchange.helper_user_id)


async def _participant_exchange(
    session, actor: Actor, exchange_id: uuid.UUID, *, lock: bool = False
) -> Exchange:
    repo = ExchangeRepository(session)
    exchange = await (
        repo.get_for_update(exchange_id) if lock else repo.get(exchange_id)
    )
    if exchange is None or not _is_participant(exchange, actor.subject_id):
        raise CheckNotFoundError
    return exchange


async def _check_for_update(
    session, actor: Actor, handover: HandoverRepository, check_id: uuid.UUID
) -> tuple[Exchange, HandoverCheck]:
    check = await handover.get_check(check_id)
    if check is None:
        raise CheckNotFoundError
    exchange = await _participant_exchange(session, actor, check.exchange_id, lock=True)
    check = await handover.get_check_for_update(check_id)
    if check is None:
        raise CheckNotFoundError
    return exchange, check


async def _view(
    handover: HandoverRepository, exchange: Exchange, check: HandoverCheck
) -> CheckView:
    items = await handover.items_for(check.id)
    return CheckView(
        check=check,
        items=items,
        media_ids=await handover.media_ids_for(check.id),
        requires_reconfirmation=_scheduled_loan_pickup(exchange, check)
        and not _is_clean(items),
    )


def is_loan_pickup(exchange: Exchange, phase: str) -> bool:
    return (
        exchange.mode == ExchangeMode.LOAN.value and phase == HandoverPhase.PICKUP.value
    )


def _scheduled_loan_pickup(exchange: Exchange, check: HandoverCheck) -> bool:
    return (
        is_loan_pickup(exchange, check.phase)
        and exchange.status == ExchangeStatus.SCHEDULED.value
    )


def _require_scheduled_pickup(exchange: Exchange, phase: str) -> None:
    if (
        is_loan_pickup(exchange, phase)
        and exchange.status != ExchangeStatus.SCHEDULED.value
    ):
        raise CheckLockedError


async def _validated_media(
    session, owner_user_id: uuid.UUID, media_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    deduped = list(dict.fromkeys(media_ids))
    repository = MediaRepository(session)
    for media_id in sorted(deduped):
        media = await repository.get_for_update(media_id)
        if (
            media is None
            or media.owner_user_id != owner_user_id
            or media.purpose != MediaPurpose.HANDOVER.value
            or media.kind != MediaKind.IMAGE.value
            or media.status != MediaStatus.READY.value
        ):
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
        exchange = await _participant_exchange(session, actor, exchange_id, lock=True)
        _require_scheduled_pickup(exchange, phase)
        media = await _validated_media(session, actor.subject_id, media_ids)
        items: list[dict] = []
        if exchange.listing_id is not None:
            listings = ListingRepository(session)
            parts = await listings.parts_for(exchange.listing_id)
            items = [
                {
                    "label": part.label,
                    "quantity": part.quantity,
                    "source": ChecklistItemSource.LISTING_PART.value,
                }
                for part in parts
            ]
            if not items and is_loan_pickup(exchange, phase):
                listing = await listings.get(exchange.listing_id)
                if listing is not None:
                    items = [
                        {
                            "label": listing.title,
                            "source": ChecklistItemSource.LISTING_PART.value,
                        }
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
        return await _view(handover, exchange, check)


async def list_checks(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> list[CheckView]:
    async with database.session() as session:
        exchange = await _participant_exchange(session, actor, exchange_id)
        handover = HandoverRepository(session)
        checks = await handover.list_checks(exchange_id)
        return [await _view(handover, exchange, check) for check in checks]


async def get_check(database: Database, actor: Actor, check_id: uuid.UUID) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        check = await handover.get_check(check_id)
        if check is None:
            raise CheckNotFoundError
        exchange = await _participant_exchange(session, actor, check.exchange_id)
        return await _view(handover, exchange, check)


def _is_locked(check: HandoverCheck) -> bool:
    return (
        check.lender_confirmed_at is not None
        and check.borrower_confirmed_at is not None
    )


def _is_clean(items: list[HandoverItem]) -> bool:
    return bool(items) and all(
        item.present is True and item.disputed_by_user_id is None for item in items
    )


async def require_pickup_check(session, exchange_id: uuid.UUID) -> None:
    handover = HandoverRepository(session)
    check = await handover.check_for_phase(exchange_id, HandoverPhase.PICKUP.value)
    if (
        check is None
        or not _is_locked(check)
        or not _is_clean(await handover.items_for(check.id))
    ):
        raise ConflictError(
            "Both participants must confirm a complete pickup checklist."
        )


async def _require_editable(
    handover: HandoverRepository, exchange: Exchange, check: HandoverCheck
) -> None:
    _require_scheduled_pickup(exchange, check.phase)
    if _is_locked(check) and (
        not is_loan_pickup(exchange, check.phase)
        or _is_clean(await handover.items_for(check.id))
    ):
        raise CheckLockedError


async def _clear_pickup_confirmations(
    handover: HandoverRepository, exchange: Exchange, check: HandoverCheck
) -> None:
    if is_loan_pickup(exchange, check.phase) and (
        check.lender_confirmed_at is not None or check.borrower_confirmed_at is not None
    ):
        await handover.update_check(
            check, {"lender_confirmed_at": None, "borrower_confirmed_at": None}
        )


async def attach_check_media(
    database: Database, actor: Actor, check_id: uuid.UUID, media_ids: list[uuid.UUID]
) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        exchange, check = await _check_for_update(session, actor, handover, check_id)
        media = await _validated_media(session, actor.subject_id, media_ids)
        existing = set(await handover.media_ids_for(check_id))
        added = [media_id for media_id in media if media_id not in existing]
        if added:
            await _require_editable(handover, exchange, check)
            if len(existing) + len(added) > MAX_CHECK_PHOTOS:
                raise BadRequestError("A checklist can have up to eight photos.")
            await handover.attach_media(check_id, added)
            await _clear_pickup_confirmations(handover, exchange, check)
        return await _view(handover, exchange, check)


async def add_item(
    database: Database,
    actor: Actor,
    check_id: uuid.UUID,
    label: str,
    quantity: int,
) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        exchange, check = await _check_for_update(session, actor, handover, check_id)
        await _require_editable(handover, exchange, check)
        existing = await handover.items_for(check_id)
        await handover.add_item(
            {
                "check_id": check_id,
                "label": label,
                "quantity": quantity,
                "source": ChecklistItemSource.MANUAL.value,
                "sort_order": max((item.sort_order for item in existing), default=-1)
                + 1,
            }
        )
        await _clear_pickup_confirmations(handover, exchange, check)
        return await _view(handover, exchange, check)


async def update_item(
    database: Database,
    actor: Actor,
    check_id: uuid.UUID,
    item_id: uuid.UUID,
    changes: dict,
) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        exchange, check = await _check_for_update(session, actor, handover, check_id)
        await _require_editable(handover, exchange, check)
        item = await handover.get_item(item_id)
        if item is None or item.check_id != check_id:
            raise ItemNotFoundError
        updates = {
            key: value for key, value in changes.items() if getattr(item, key) != value
        }
        if "dispute_note" in updates:
            if item.disputed_by_user_id not in (None, actor.subject_id):
                raise CheckDisputeError
            updates["disputed_by_user_id"] = (
                actor.subject_id if updates["dispute_note"] is not None else None
            )
        if updates:
            if (
                "label" in updates or "quantity" in updates
            ) and "present" not in changes:
                updates["present"] = None
            await handover.update_item(item, updates)
            await _clear_pickup_confirmations(handover, exchange, check)
        return await _view(handover, exchange, check)


async def delete_item(
    database: Database,
    actor: Actor,
    check_id: uuid.UUID,
    item_id: uuid.UUID,
) -> None:
    async with database.session() as session:
        handover = HandoverRepository(session)
        exchange, check = await _check_for_update(session, actor, handover, check_id)
        await _require_editable(handover, exchange, check)
        if not is_loan_pickup(exchange, check.phase) and (
            check.lender_confirmed_at is not None
            or check.borrower_confirmed_at is not None
        ):
            raise CheckLockedError
        item = await handover.get_item(item_id)
        if item is None or item.check_id != check_id:
            return
        if (
            is_loan_pickup(exchange, check.phase)
            and item.disputed_by_user_id is not None
        ):
            raise CheckDisputeError
        await handover.delete_item(item)
        await _clear_pickup_confirmations(handover, exchange, check)


async def confirm_check(
    database: Database, actor: Actor, check_id: uuid.UUID
) -> CheckView:
    async with database.session() as session:
        handover = HandoverRepository(session)
        exchange, check = await _check_for_update(session, actor, handover, check_id)
        key = (
            "lender_confirmed_at"
            if actor.subject_id == exchange.helper_user_id
            else "borrower_confirmed_at"
        )
        if _scheduled_loan_pickup(exchange, check) and not _is_clean(
            await handover.items_for(check.id)
        ):
            raise ConflictError(
                "Mark each item present and resolve any issues before confirming."
            )
        if getattr(check, key) is None:
            _require_scheduled_pickup(exchange, check.phase)
            check = await handover.update_check(check, {key: datetime.now(UTC)})
        return await _view(handover, exchange, check)
