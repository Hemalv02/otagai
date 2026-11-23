import uuid
from datetime import UTC, datetime, timedelta

from app.database.connection import Database
from app.database.models import Exchange, LoanExtension
from app.database.models.enums import (
    DecisionStatus,
    ExchangeMode,
    ExchangeStatus,
    ListingStatus,
    NotificationType,
    RequestStatus,
)
from app.repositories.exchanges import (
    ExchangeRepository,
    ExtensionPendingError,
    ExtensionRepository,
)
from app.repositories.listings import ListingRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.pair_stats import PairStatsRepository
from app.repositories.requests import RequestRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import BadRequestError, ConflictError, NotFoundError

AVAILABLE_AGAIN_DELAY = timedelta(hours=1)


class ExchangeNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Exchange not found.")


class ExtensionNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Extension not found.")


class ExchangeStateError(ConflictError):
    pass


class NotLoanError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Only a loan has a due date.")


def _is_participant(exchange: Exchange, user_id: uuid.UUID) -> bool:
    return user_id in (exchange.requester_user_id, exchange.helper_user_id)


async def _load_participant_exchange(
    session, actor: Actor, exchange_id: uuid.UUID, *, for_update: bool
) -> Exchange:
    repository = ExchangeRepository(session)
    exchange = (
        await repository.get_for_update(exchange_id)
        if for_update
        else await repository.get(exchange_id)
    )
    if exchange is None or not _is_participant(exchange, actor.subject_id):
        raise ExchangeNotFoundError
    return exchange


async def list_my_exchanges(
    database: Database, actor: Actor, statuses: tuple[str, ...], page: PageRequest
) -> PageResult[Exchange]:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    async with database.session() as session:
        return await ExchangeRepository(session).list_for_user(
            actor.subject_id, statuses, page
        )


async def get_exchange(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> Exchange:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    async with database.session() as session:
        return await _load_participant_exchange(
            session, actor, exchange_id, for_update=False
        )


async def update_exchange(
    database: Database, actor: Actor, exchange_id: uuid.UUID, changes: dict
) -> Exchange:
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.status not in (
            ExchangeStatus.SCHEDULED.value,
            ExchangeStatus.ACTIVE.value,
        ):
            raise ExchangeStateError("This exchange can no longer be changed.")
        if "due_at" in changes and exchange.mode != ExchangeMode.LOAN.value:
            raise NotLoanError
        if not changes:
            return exchange
        return await ExchangeRepository(session).update(exchange, changes)


async def hand_over(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> Exchange:
    now = datetime.now(UTC)
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.status == ExchangeStatus.ACTIVE.value:
            return exchange
        if exchange.status != ExchangeStatus.SCHEDULED.value:
            raise ExchangeStateError("This exchange can't be handed over now.")
        repository = ExchangeRepository(session)
        updated = await repository.update(
            exchange,
            {"status": ExchangeStatus.ACTIVE.value, "handed_over_at": now},
        )
        requests = RequestRepository(session)
        request = await requests.get_for_update(exchange.request_id)
        if request is not None:
            await requests.update(request, {"status": RequestStatus.IN_PROGRESS.value})
        if exchange.listing_id is not None:
            listing = await ListingRepository(session).get_for_update(
                exchange.listing_id
            )
            if listing is not None and listing.status == ListingStatus.ACTIVE.value:
                await ListingRepository(session).update(
                    listing, {"status": ListingStatus.LENT_OUT.value}
                )
        return updated


async def mark_returned(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> Exchange:
    now = datetime.now(UTC)
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.status == ExchangeStatus.RETURNED.value:
            return exchange
        if exchange.status != ExchangeStatus.ACTIVE.value:
            raise ExchangeStateError("This exchange isn't active.")
        return await ExchangeRepository(session).update(
            exchange,
            {"status": ExchangeStatus.RETURNED.value, "returned_at": now},
        )


async def confirm_exchange(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> Exchange:
    now = datetime.now(UTC)
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.status in (
            ExchangeStatus.CANCELLED.value,
            ExchangeStatus.DISPUTED.value,
        ):
            raise ExchangeStateError("This exchange can't be confirmed.")
        if exchange.status == ExchangeStatus.COMPLETED.value:
            return exchange
        if exchange.status not in (
            ExchangeStatus.ACTIVE.value,
            ExchangeStatus.RETURNED.value,
        ):
            raise ExchangeStateError("Hand the item over before confirming.")
        is_requester = actor.subject_id == exchange.requester_user_id
        changes: dict = {}
        if is_requester and exchange.requester_confirmed_at is None:
            changes["requester_confirmed_at"] = now
        if not is_requester and exchange.helper_confirmed_at is None:
            changes["helper_confirmed_at"] = now
        requester_done = exchange.requester_confirmed_at is not None or is_requester
        helper_done = exchange.helper_confirmed_at is not None or not is_requester
        if requester_done and helper_done:
            changes["status"] = ExchangeStatus.COMPLETED.value
            changes["completed_at"] = now
        repository = ExchangeRepository(session)
        updated = await repository.update(exchange, changes) if changes else exchange
        if changes.get("status") == ExchangeStatus.COMPLETED.value:
            await _complete_exchange(session, updated, now)
        return updated


async def _complete_exchange(session, exchange: Exchange, now: datetime) -> None:
    await PairStatsRepository(session).record_exchange(
        exchange.helper_user_id, exchange.requester_user_id, now
    )
    requests = RequestRepository(session)
    request = await requests.get_for_update(exchange.request_id)
    if request is not None:
        await requests.update(request, {"status": RequestStatus.DONE.value})
    if exchange.listing_id is not None:
        listing = await ListingRepository(session).get_for_update(exchange.listing_id)
        if listing is not None and listing.status == ListingStatus.LENT_OUT.value:
            await ListingRepository(session).update(
                listing,
                {
                    "status": ListingStatus.ACTIVE.value,
                    "available_again_at": now + AVAILABLE_AGAIN_DELAY,
                },
            )
    for user_id in (exchange.requester_user_id, exchange.helper_user_id):
        await NotificationRepository(session).create(
            user_id,
            NotificationType.THANK_YOU.value,
            {"exchange_id": str(exchange.id)},
        )


async def cancel_exchange(
    database: Database, actor: Actor, exchange_id: uuid.UUID
) -> Exchange:
    now = datetime.now(UTC)
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.status == ExchangeStatus.CANCELLED.value:
            return exchange
        if exchange.status != ExchangeStatus.SCHEDULED.value:
            raise ExchangeStateError("You can't cancel after the handover.")
        updated = await ExchangeRepository(session).update(
            exchange,
            {
                "status": ExchangeStatus.CANCELLED.value,
                "cancelled_by_user_id": actor.user.id,
                "cancelled_at": now,
            },
        )
        request = await RequestRepository(session).get_for_update(exchange.request_id)
        if request is not None and request.status == RequestStatus.MATCHED.value:
            await RequestRepository(session).update(
                request, {"status": RequestStatus.OPEN.value}
            )
        return updated


async def dispute_exchange(
    database: Database, actor: Actor, exchange_id: uuid.UUID, reason: str | None
) -> Exchange:
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.status == ExchangeStatus.DISPUTED.value:
            return exchange
        if exchange.status not in (
            ExchangeStatus.ACTIVE.value,
            ExchangeStatus.RETURNED.value,
        ):
            raise ExchangeStateError("Only an ongoing exchange can be disputed.")
        other = (
            exchange.helper_user_id
            if actor.subject_id == exchange.requester_user_id
            else exchange.requester_user_id
        )
        updated = await ExchangeRepository(session).update(
            exchange,
            {"status": ExchangeStatus.DISPUTED.value, "cancel_reason": reason},
        )
        await NotificationRepository(session).create(
            other,
            NotificationType.REMINDER.value,
            {"exchange_id": str(exchange_id), "disputed": True},
        )
        return updated


async def request_extension(
    database: Database,
    actor: Actor,
    exchange_id: uuid.UUID,
    new_due_at: datetime,
    message: str | None,
) -> LoanExtension:
    now = datetime.now(UTC)
    async with database.session() as session:
        exchange = await _load_participant_exchange(
            session, actor, exchange_id, for_update=True
        )
        if exchange.mode != ExchangeMode.LOAN.value:
            raise NotLoanError
        if exchange.status != ExchangeStatus.ACTIVE.value:
            raise ExchangeStateError("Only an active loan can be extended.")
        if new_due_at <= now:
            raise BadRequestError("Choose a future due date.")
        try:
            extension = await ExtensionRepository(session).create(
                {
                    "exchange_id": exchange_id,
                    "requested_by_user_id": actor.subject_id,
                    "acted_by_user_id": actor.user.id,
                    "new_due_at": new_due_at,
                    "message": message,
                }
            )
        except ExtensionPendingError as error:
            raise ExchangeStateError(
                "An extension request is already pending."
            ) from error
        other = (
            exchange.helper_user_id
            if actor.subject_id == exchange.requester_user_id
            else exchange.requester_user_id
        )
        await NotificationRepository(session).create(
            other,
            NotificationType.EXTENSION.value,
            {"exchange_id": str(exchange_id), "extension_id": str(extension.id)},
        )
        return extension


async def list_extensions(
    database: Database, actor: Actor, exchange_id: uuid.UUID, page: PageRequest
) -> PageResult[LoanExtension]:
    async with database.session() as session:
        await _load_participant_exchange(session, actor, exchange_id, for_update=False)
        return await ExtensionRepository(session).list_for_exchange(exchange_id, page)


async def decide_extension(
    database: Database,
    actor: Actor,
    extension_id: uuid.UUID,
    *,
    accept: bool,
) -> LoanExtension:
    now = datetime.now(UTC)
    async with database.session() as session:
        extensions = ExtensionRepository(session)
        extension = await extensions.get_for_update(extension_id)
        if extension is None:
            raise ExtensionNotFoundError
        exchange = await _load_participant_exchange(
            session, actor, extension.exchange_id, for_update=True
        )
        lender_id = exchange.helper_user_id
        if actor.subject_id != lender_id:
            raise ExchangeStateError("Only the lender can decide this extension.")
        if extension.status != DecisionStatus.PENDING.value:
            if (extension.status == DecisionStatus.ACCEPTED.value and accept) or (
                extension.status == DecisionStatus.DECLINED.value and not accept
            ):
                return extension
            raise ExchangeStateError("This extension was already decided.")
        status = (
            DecisionStatus.ACCEPTED.value if accept else DecisionStatus.DECLINED.value
        )
        updated = await extensions.update(
            extension, {"status": status, "decided_at": now}
        )
        if accept:
            await ExchangeRepository(session).update(
                exchange, {"due_at": extension.new_due_at}
            )
        await NotificationRepository(session).create(
            extension.requested_by_user_id,
            NotificationType.EXTENSION.value,
            {
                "exchange_id": str(exchange.id),
                "extension_id": str(extension.id),
                "accepted": accept,
            },
        )
        return updated
