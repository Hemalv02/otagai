import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import Database
from app.database.models import HelpRequest, Listing, RequestRecipient, RequestResponse
from app.database.models.enums import (
    ConversationKind,
    ExchangeMode,
    ExchangeStatus,
    MediaPurpose,
    MessageKind,
    NotificationType,
    ParticipantRole,
    RequestKind,
    RequestStatus,
    ResponseKind,
    ResponseStatus,
    RippleStage,
    TranslationStatus,
    UserStatus,
)
from app.repositories.blocks import BlockRepository
from app.repositories.chat import ConversationRepository, MessageRepository
from app.repositories.circles import CircleRepository
from app.repositories.errors import violates
from app.repositories.exchanges import ExchangeRepository
from app.repositories.listings import ListingRepository
from app.repositories.media import MediaRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.request_ripple import RippleRepository
from app.repositories.requests import (
    OPEN_LISTING_INDEX,
    LiveResponseExistsError,
    RecipientRepository,
    RequestRepository,
    ResponseAlreadyAcceptedError,
    ResponseRepository,
)
from app.repositories.users import UserRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.services.listings.service import (
    requestable_listing,
    visible_listing,
)
from app.services.requests.ripple import (
    RippleReceipt,
    advance_ripple,
    deliver_from,
    delivery_receipt,
    initial_stage,
    next_stage,
    reopen_after_match_safely,
    schedule_after,
)

DEFAULT_EXPIRY = timedelta(days=7)
MAX_MEDIA = 6


class RequestNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Request not found.")


class RequestNotOpenError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This request is no longer open.")


class NoCircleError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Join a circle before asking for help.")


class RecipientUnreachableError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("You can't send a request to this person.")


class NotRequesterError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only the requester can do this.")


class ResponseNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Response not found.")


class LiveResponseError(ConflictError):
    def __init__(self) -> None:
        super().__init__("You already have a response on this request.")


class ResponseNotPendingError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This response can no longer be changed.")


class AlreadyAcceptedError(ConflictError):
    def __init__(self) -> None:
        super().__init__("Another helper has already been chosen.")


class OpenListingRequestExistsError(ConflictError):
    def __init__(self, request_id: uuid.UUID) -> None:
        super().__init__("You already have an open request for this listing.")
        self.details = {"code": "open_request_exists", "request_id": str(request_id)}


@dataclass(frozen=True)
class NewRequest:
    kind: str
    raw_text: str
    polite_text: str | None
    tone: str
    lang: str
    category_id: uuid.UUID | None
    listing_id: uuid.UUID | None
    direct_to_user_id: uuid.UUID | None
    needed_from: datetime | None
    needed_until: datetime | None
    ripple_max_stage: str
    home_circle_id: uuid.UUID | None
    ripple_start_stage: RippleStage | None = None
    media_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass(frozen=True)
class RequestDetail:
    request: HelpRequest
    my_role: str
    can_manage: bool
    can_chat: bool
    can_thank: bool
    my_response_status: str | None
    my_response_id: uuid.UUID | None
    exchange_id: uuid.UUID | None
    listing: Listing | None = None


@dataclass(frozen=True)
class ReceivedView:
    request: HelpRequest
    recipient: RequestRecipient
    my_response_status: str | None


async def _visible_recipient(
    session: AsyncSession, request: HelpRequest, viewer: uuid.UUID
) -> RequestRecipient:
    recipient = await RecipientRepository(session).get(request.id, viewer)
    if recipient is None or await BlockRepository(session).is_blocked_either_way(
        viewer, request.requester_user_id
    ):
        raise RequestNotFoundError
    return recipient


async def create_request(
    database: Database, actor: Actor, new_request: NewRequest
) -> HelpRequest:
    async with database.session() as session:
        return await create_request_in_session(session, actor, new_request)


async def create_request_in_session(
    session: AsyncSession, actor: Actor, new_request: NewRequest
) -> HelpRequest:
    await actor.require_for_write(session, ProxyScope.POST_REQUESTS)
    requester_id = actor.subject_id
    now = datetime.now(UTC)
    if new_request.needed_until is not None and new_request.needed_until <= now:
        raise BadRequestError("Choose an end time in the future.")
    audiences = RippleRepository(session)
    home_choices = (
        [new_request.home_circle_id]
        if new_request.home_circle_id is not None
        else await CircleRepository(session).approved_circle_ids(requester_id)
    )
    lineage = []
    for home_id in home_choices:
        lineage = await audiences.home_lineage(requester_id, home_id)
        if lineage:
            break
    if not lineage:
        raise NoCircleError

    media_ids = await _validated_media(session, requester_id, new_request.media_ids)
    target_id = new_request.direct_to_user_id
    category_id = new_request.category_id
    if new_request.listing_id is not None and target_id is None:
        listing = await ListingRepository(session).get(new_request.listing_id)
        if listing is None:
            raise RecipientUnreachableError
        target_id = listing.owner_user_id
    if target_id is not None:
        if not await audiences.can_send_direct(requester_id, target_id):
            raise RecipientUnreachableError
        if new_request.listing_id is not None:
            listing = await requestable_listing(
                session,
                requester_id,
                new_request.listing_id,
                target_id,
                new_request.kind,
            )
            category_id = listing.category_id
        ripple_max = ripple_stage = RippleStage.DIRECT
    else:
        ripple_max = RippleStage(new_request.ripple_max_stage)
        ripple_stage = initial_stage(ripple_max, new_request.ripple_start_stage)

    values = {
        "requester_user_id": requester_id,
        "acted_by_user_id": actor.user.id,
        "region": lineage[0].region,
        "kind": new_request.kind,
        "category_id": category_id,
        "listing_id": new_request.listing_id,
        "direct_to_user_id": target_id,
        "raw_text": new_request.raw_text,
        "polite_text": new_request.polite_text or new_request.raw_text,
        "tone": new_request.tone,
        "lang": new_request.lang,
        "needed_from": new_request.needed_from,
        "needed_until": new_request.needed_until,
        "home_circle_id": lineage[0].id,
        "ripple_stage": ripple_stage.value,
        "ripple_max_stage": ripple_max.value,
        "status": RequestStatus.OPEN.value,
        "expires_at": new_request.needed_until or now + DEFAULT_EXPIRY,
    }
    requests = RequestRepository(session)
    if new_request.listing_id is None:
        request = await requests.create(values, media_ids)
    else:
        request = None
        for attempt in range(2):
            try:
                async with session.begin_nested():
                    request = await requests.create(values, media_ids)
                break
            except IntegrityError as error:
                if not violates(error, OPEN_LISTING_INDEX):
                    raise
                existing = await requests.get_open_for_listing(
                    requester_id, new_request.listing_id, lock=True
                )
                if existing is None:
                    if attempt == 1:
                        raise
                    continue
                if existing.expires_at > now:
                    if (
                        any(
                            getattr(existing, field) != values[field]
                            for field in (
                                "kind",
                                "raw_text",
                                "polite_text",
                                "tone",
                                "lang",
                                "needed_from",
                                "needed_until",
                            )
                        )
                        or (
                            new_request.home_circle_id is not None
                            and existing.home_circle_id != new_request.home_circle_id
                        )
                        or await requests.media_ids(existing.id) != media_ids
                    ):
                        raise OpenListingRequestExistsError(existing.id) from error
                    return existing
                if attempt == 1:
                    raise
                await requests.update(
                    existing,
                    {"status": RequestStatus.EXPIRED.value, "next_widen_at": None},
                )
        if request is None:
            raise RuntimeError("Listing request was not created.")

    return await deliver_from(session, request, ripple_stage, lineage, now)


async def _validated_media(
    session, owner_user_id: uuid.UUID, media_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    deduped = list(dict.fromkeys(media_ids))
    if not deduped:
        return []
    if len(deduped) > MAX_MEDIA:
        raise BadRequestError("Too many photos on this request.")
    owned = await MediaRepository(session).owned_ready_ids(
        deduped, owner_user_id, MediaPurpose.REQUEST.value
    )
    if set(deduped) != owned:
        raise BadRequestError("Choose request photos you have uploaded.")
    return deduped


async def list_my_requests(
    database: Database, actor: Actor, statuses: tuple[str, ...], page: PageRequest
) -> PageResult[HelpRequest]:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    async with database.session() as session:
        return await RequestRepository(session).list_for_requester(
            actor.subject_id, statuses, page
        )


async def get_request(
    database: Database, actor: Actor, request_id: uuid.UUID
) -> RequestDetail:
    viewer = actor.subject_id
    async with database.session() as session:
        request = await RequestRepository(session).get(request_id)
        if request is None:
            raise RequestNotFoundError
        owns_request = request.requester_user_id == viewer
        can_view_activity = actor.grant is None or actor.grant.can_view_activity
        live = None
        if not owns_request:
            await _visible_recipient(session, request, viewer)
            if can_view_activity:
                live = await ResponseRepository(session).live_response_for(
                    request_id, viewer
                )
        exchange = None
        if (
            can_view_activity
            and request.status
            in (
                RequestStatus.MATCHED.value,
                RequestStatus.IN_PROGRESS.value,
                RequestStatus.DONE.value,
            )
            and (
                owns_request or (live and live.status == ResponseStatus.ACCEPTED.value)
            )
        ):
            exchange = await ExchangeRepository(session).active_for_request(
                request_id, lock=False
            )
        listing = (
            await visible_listing(session, actor, request.listing_id)
            if request.listing_id
            else None
        )
        return RequestDetail(
            request=request,
            listing=listing,
            my_role="requester" if owns_request else "recipient",
            can_manage=owns_request
            and (actor.grant is None or actor.grant.can_post_requests),
            can_chat=actor.grant is None or actor.grant.can_chat,
            can_thank=actor.grant is None or actor.grant.can_thank_and_pay,
            my_response_status=live.status if live else None,
            my_response_id=live.id if live else None,
            exchange_id=exchange.id
            if exchange
            and viewer in (exchange.requester_user_id, exchange.helper_user_id)
            else None,
        )


async def _load_own_request_for_update(
    session: AsyncSession, actor: Actor, request_id: uuid.UUID
) -> HelpRequest:
    request = await RequestRepository(session).get_for_update(request_id)
    if request is None:
        raise RequestNotFoundError
    if request.requester_user_id != actor.subject_id:
        raise RequestNotFoundError
    return request


async def update_request(
    database: Database, actor: Actor, request_id: uuid.UUID, changes: dict
) -> HelpRequest:
    async with database.session() as session:
        await actor.require_for_write(session, ProxyScope.POST_REQUESTS)
        request = await _load_own_request_for_update(session, actor, request_id)
        now = datetime.now(UTC)
        if request.status != RequestStatus.OPEN.value or request.expires_at <= now:
            raise RequestNotOpenError
        if not changes:
            return request
        start = changes.get("needed_from", request.needed_from)
        end = changes.get("needed_until", request.needed_until)
        if end is not None and (end <= now or (start is not None and end < start)):
            raise BadRequestError("Choose a future end time after the start time.")
        if "needed_until" in changes:
            expires_at = end or now + DEFAULT_EXPIRY
            changes = {
                **changes,
                "expires_at": expires_at,
                "next_widen_at": schedule_after(request, now, expires_at),
            }
        if (
            changes.get("raw_text", request.raw_text) != request.raw_text
            or changes.get("polite_text", request.polite_text) != request.polite_text
        ):
            changes = {**changes, "translations": {}}
        return await RequestRepository(session).update(request, changes)


async def cancel_request(
    database: Database, actor: Actor, request_id: uuid.UUID
) -> HelpRequest:
    now = datetime.now(UTC)
    async with database.session() as session:
        await actor.require_for_write(session, ProxyScope.POST_REQUESTS)
        request = await _load_own_request_for_update(session, actor, request_id)
        if request.status in (
            RequestStatus.CANCELLED.value,
            RequestStatus.DONE.value,
            RequestStatus.EXPIRED.value,
        ):
            if request.status == RequestStatus.CANCELLED.value:
                return request
            raise RequestNotOpenError
        responses = ResponseRepository(session)
        exchange_repo = ExchangeRepository(session)
        exchange = await exchange_repo.active_for_request(request_id)
        if exchange is not None and exchange.status in (
            ExchangeStatus.ACTIVE.value,
            ExchangeStatus.RETURNED.value,
            ExchangeStatus.COMPLETED.value,
        ):
            raise ConflictError("This exchange has already started.")
        notify = await responses.list_for_request(request_id, PageRequest(limit=50))
        await responses.supersede_others(request_id, uuid.uuid4())
        if exchange is not None and exchange.status == ExchangeStatus.SCHEDULED.value:
            await exchange_repo.update(
                exchange,
                {
                    "status": ExchangeStatus.CANCELLED.value,
                    "cancelled_by_user_id": actor.user.id,
                    "cancelled_at": now,
                },
            )
        updated = await RequestRepository(session).update(
            request,
            {
                "status": RequestStatus.CANCELLED.value,
                "cancelled_at": now,
                "next_widen_at": None,
            },
        )
        targets = [
            response.responder_user_id
            for response in notify.items
            if response.status
            in (ResponseStatus.PENDING.value, ResponseStatus.ACCEPTED.value)
        ]
        if targets:
            await NotificationRepository(session).create_many(
                targets,
                NotificationType.RESPONSE_SUPERSEDED.value,
                {"request_id": str(request_id)},
            )
        return updated


async def widen_request(
    database: Database,
    actor: Actor,
    request_id: uuid.UUID,
    *,
    expected_stage: RippleStage | None = None,
) -> HelpRequest:
    async with database.session() as session:
        await actor.require_for_write(session, ProxyScope.POST_REQUESTS)
        request = await _load_own_request_for_update(session, actor, request_id)
        now = datetime.now(UTC)
        if request.status == RequestStatus.EXPIRED.value or (
            request.status == RequestStatus.OPEN.value and request.expires_at <= now
        ):
            requests = RequestRepository(session)
            if request.listing_id is not None:
                if request.direct_to_user_id is not None:
                    await requestable_listing(
                        session,
                        request.requester_user_id,
                        request.listing_id,
                        request.direct_to_user_id,
                        request.kind,
                    )
                sibling = await requests.get_open_for_listing(
                    request.requester_user_id, request.listing_id, lock=True
                )
                if sibling is not None and sibling.id != request.id:
                    if sibling.expires_at > now:
                        raise OpenListingRequestExistsError(sibling.id)
                    await requests.update(
                        sibling,
                        {"status": RequestStatus.EXPIRED.value, "next_widen_at": None},
                    )
            try:
                async with session.begin_nested():
                    return await requests.update(
                        request,
                        {
                            "status": RequestStatus.OPEN.value,
                            "expires_at": now + DEFAULT_EXPIRY,
                            "next_widen_at": schedule_after(
                                request, now, now + DEFAULT_EXPIRY
                            ),
                        },
                    )
            except IntegrityError as error:
                if not violates(error, OPEN_LISTING_INDEX):
                    raise
                existing = await requests.get_open_for_listing(
                    request.requester_user_id, request.listing_id
                )
                if existing is None:
                    raise
                raise OpenListingRequestExistsError(existing.id) from error
        if request.status != RequestStatus.OPEN.value:
            raise RequestNotOpenError
        if request.direct_to_user_id is not None:
            raise RequestNotOpenError
        if next_stage(request) is None or (
            expected_stage is not None and request.ripple_stage != expected_stage.value
        ):
            return request
        if expected_stage is None and (
            request.next_widen_at is None or request.next_widen_at > now
        ):
            return request
        return await advance_ripple(session, request, now)


async def get_receipt(
    database: Database, actor: Actor, request_id: uuid.UUID
) -> RippleReceipt:
    actor.require(ProxyScope.VIEW_ACTIVITY)
    async with database.session() as session:
        request = await _load_own_request_for_update(session, actor, request_id)
        return await delivery_receipt(session, request, datetime.now(UTC))


async def list_responses(
    database: Database, actor: Actor, request_id: uuid.UUID, page: PageRequest
) -> PageResult[RequestResponse]:
    async with database.session() as session:
        request = await RequestRepository(session).get(request_id)
        if request is None or request.requester_user_id != actor.subject_id:
            raise RequestNotFoundError
        return await ResponseRepository(session).list_for_request(request_id, page)


async def list_received(
    database: Database, actor: Actor, *, direct_only: bool, page: PageRequest
) -> PageResult[ReceivedView]:
    async with database.session() as session:
        repository = RequestRepository(session)
        blocked = await BlockRepository(session).blocked_either_way(actor.subject_id)
        result = await repository.list_received(
            actor.subject_id, blocked, direct_only=direct_only, page=page
        )
        request_ids = [recipient.request_id for recipient in result.items]
        requests = await repository.get_many(request_ids)
        statuses = await ResponseRepository(session).my_status_for_requests(
            actor.subject_id, request_ids
        )
    items = [
        ReceivedView(
            request=requests[recipient.request_id],
            recipient=recipient,
            my_response_status=statuses.get(recipient.request_id),
        )
        for recipient in result.items
        if recipient.request_id in requests
    ]
    return PageResult(items=items, next_cursor=result.next_cursor)


async def mark_received(
    database: Database,
    actor: Actor,
    request_id: uuid.UUID,
    *,
    seen: bool,
    hidden: bool | None,
) -> ReceivedView:
    now = datetime.now(UTC)
    async with database.session() as session:
        recipients = RecipientRepository(session)
        request = await RequestRepository(session).get(request_id)
        if request is None:
            raise RequestNotFoundError
        recipient = await _visible_recipient(session, request, actor.subject_id)
        changes: dict = {}
        if seen and recipient.seen_at is None:
            changes["seen_at"] = now
        if hidden is True:
            changes["hidden_at"] = now
        elif hidden is False:
            changes["hidden_at"] = None
        if changes:
            recipient = await recipients.update(recipient, changes)
        live = await ResponseRepository(session).live_response_for(
            request_id, actor.subject_id
        )
    return ReceivedView(
        request=request,
        recipient=recipient,
        my_response_status=live.status if live else None,
    )


async def create_response(
    database: Database, actor: Actor, request_id: uuid.UUID, new_response: dict
) -> RequestResponse:
    async with database.session() as session:
        request = await RequestRepository(session).get_for_update(request_id)
        if request is None:
            raise RequestNotFoundError
        await _visible_recipient(session, request, actor.subject_id)
        if (
            request.status != RequestStatus.OPEN.value
            or request.expires_at <= datetime.now(UTC)
        ):
            raise RequestNotOpenError
        values = {
            "request_id": request_id,
            "responder_user_id": actor.subject_id,
            "acted_by_user_id": actor.user.id,
            **new_response,
        }
        try:
            response = await ResponseRepository(session).create(values)
        except LiveResponseExistsError as error:
            raise LiveResponseError from error
        await NotificationRepository(session).create(
            request.requester_user_id,
            NotificationType.RESPONSE_RECEIVED.value,
            {"request_id": str(request_id), "response_id": str(response.id)},
        )
        return response


async def update_response(
    database: Database,
    actor: Actor,
    request_id: uuid.UUID,
    response_id: uuid.UUID,
    changes: dict,
) -> RequestResponse:
    async with database.session() as session:
        response = await ResponseRepository(session).get_for_update(response_id)
        if (
            response is None
            or response.request_id != request_id
            or response.responder_user_id != actor.subject_id
        ):
            raise ResponseNotFoundError
        if response.status != ResponseStatus.PENDING.value:
            raise ResponseNotPendingError
        if not changes:
            return response
        return await ResponseRepository(session).update(response, changes)


async def withdraw_response(
    database: Database,
    actor: Actor,
    request_id: uuid.UUID,
    response_id: uuid.UUID,
) -> RequestResponse:
    now = datetime.now(UTC)
    async with database.session() as session:
        response_repo = ResponseRepository(session)
        response = await response_repo.get_for_update(response_id)
        if (
            response is None
            or response.request_id != request_id
            or response.responder_user_id != actor.subject_id
        ):
            raise ResponseNotFoundError
        if response.status == ResponseStatus.WITHDRAWN.value:
            return response
        if response.status not in (
            ResponseStatus.PENDING.value,
            ResponseStatus.ACCEPTED.value,
        ):
            raise ResponseNotPendingError
        was_accepted = response.status == ResponseStatus.ACCEPTED.value
        updated = await response_repo.update(
            response,
            {"status": ResponseStatus.WITHDRAWN.value, "decided_at": now},
        )
        if was_accepted:
            request = await RequestRepository(session).get_for_update(request_id)
            exchange = await ExchangeRepository(session).active_for_request(request_id)
            if exchange is not None and exchange.status in (
                ExchangeStatus.SCHEDULED.value,
                ExchangeStatus.ACTIVE.value,
            ):
                await ExchangeRepository(session).update(
                    exchange,
                    {
                        "status": ExchangeStatus.CANCELLED.value,
                        "cancelled_by_user_id": actor.user.id,
                        "cancelled_at": now,
                    },
                )
            if request is not None and request.status == RequestStatus.MATCHED.value:
                await reopen_after_match_safely(session, request, datetime.now(UTC))
                await NotificationRepository(session).create(
                    request.requester_user_id,
                    NotificationType.RESPONSE_SUPERSEDED.value,
                    {"request_id": str(request_id), "response_id": str(response_id)},
                )
        return updated


async def accept_response(
    database: Database,
    actor: Actor,
    request_id: uuid.UUID,
    response_id: uuid.UUID,
) -> RequestResponse:
    async with database.session() as session:
        await actor.require_for_write(session, ProxyScope.POST_REQUESTS)
        request = await _load_own_request_for_update(session, actor, request_id)
        now = datetime.now(UTC)
        if request.status not in (
            RequestStatus.OPEN.value,
            RequestStatus.MATCHED.value,
        ) or (request.status == RequestStatus.OPEN.value and request.expires_at <= now):
            raise RequestNotOpenError
        response_repo = ResponseRepository(session)
        response = await response_repo.get_for_update(response_id)
        if response is None or response.request_id != request_id:
            raise ResponseNotFoundError
        if response.status == ResponseStatus.ACCEPTED.value:
            return response
        if response.status != ResponseStatus.PENDING.value:
            raise ResponseNotPendingError
        if response.kind == ResponseKind.QUESTION.value:
            raise ConflictError("Choose a help offer or a suggested time to match.")
        if response.proposed_start is not None and response.proposed_start <= now:
            raise ConflictError("This proposed time has passed.")
        helper = await UserRepository(session).get(response.responder_user_id)
        if (
            helper is None
            or helper.status != UserStatus.ACTIVE.value
            or await BlockRepository(session).is_blocked_either_way(
                request.requester_user_id, response.responder_user_id
            )
        ):
            raise ConflictError("This helper is no longer available.")
        try:
            accepted = await response_repo.update(
                response,
                {"status": ResponseStatus.ACCEPTED.value, "decided_at": now},
            )
        except ResponseAlreadyAcceptedError as error:
            raise AlreadyAcceptedError from error
        await response_repo.supersede_others(request_id, response_id)

        listing_id = response.listing_id or request.listing_id
        mode = (
            ExchangeMode.LOAN.value
            if request.kind != RequestKind.HELP.value
            else ExchangeMode.HELP.value
        )
        exchange = await ExchangeRepository(session).create(
            {
                "request_id": request_id,
                "response_id": response_id,
                "requester_user_id": request.requester_user_id,
                "helper_user_id": response.responder_user_id,
                "listing_id": listing_id,
                "mode": mode,
                "status": ExchangeStatus.SCHEDULED.value,
                "scheduled_at": response.proposed_start,
            }
        )
        conversation = await ConversationRepository(session).create(
            {
                "kind": ConversationKind.REQUEST.value,
                "request_id": request_id,
                "response_id": response_id,
                "started_by_user_id": request.requester_user_id,
            },
            [
                {
                    "user_id": request.requester_user_id,
                    "role": ParticipantRole.REQUESTER.value,
                },
                {
                    "user_id": response.responder_user_id,
                    "role": ParticipantRole.RESPONDER.value,
                },
            ],
        )
        await MessageRepository(session).create(
            {
                "conversation_id": conversation.id,
                "sender_user_id": None,
                "acted_by_user_id": None,
                "kind": MessageKind.SYSTEM.value,
                "body": "You've been matched. Say hello to arrange the details.",
                "translation_status": TranslationStatus.NONE.value,
            },
            [],
        )
        await ConversationRepository(session).touch_last_message(conversation.id, now)
        await RequestRepository(session).update(
            request, {"status": RequestStatus.MATCHED.value, "next_widen_at": None}
        )
        await NotificationRepository(session).create(
            response.responder_user_id,
            NotificationType.RESPONSE_ACCEPTED.value,
            {
                "request_id": str(request_id),
                "response_id": str(response_id),
                "exchange_id": str(exchange.id),
            },
        )
        return accepted
