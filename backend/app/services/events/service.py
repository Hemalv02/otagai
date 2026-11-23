import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import CommunityEvent, User
from app.database.models.enums import EventStatus
from app.repositories.circles import MembershipRepository
from app.repositories.events import (
    DuplicateSignupError,
    EventRepository,
    EventSignupRepository,
)
from app.repositories.pagination import PageRequest, PageResult
from app.services.community.guards import require_member
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)


class EventNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Event not found.")


class NotEventOrganizerError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only the organizer or a leader can change this event.")


class EventCancelledError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This event has been cancelled.")


class EventFullError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This event is full.")


class InvalidEventWindowError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("ends_at must be at or after starts_at.")


@dataclass(frozen=True)
class NewEvent:
    title: str
    description: str | None
    lang: str
    starts_at: datetime
    ends_at: datetime | None
    location_note: str | None
    capacity: int | None


@dataclass(frozen=True)
class EventView:
    event: CommunityEvent
    signup_count: int
    signed_up: bool


async def _load_event(session, event_id: uuid.UUID) -> CommunityEvent:
    event = await EventRepository(session).get(event_id)
    if event is None:
        raise EventNotFoundError
    return event


async def _view(session, event: CommunityEvent, user_id: uuid.UUID) -> EventView:
    signups = EventSignupRepository(session)
    count = await signups.count(event.id)
    mine = await signups.get(event.id, user_id)
    return EventView(event=event, signup_count=count, signed_up=mine is not None)


async def list_events(
    database: Database, user: User, circle_id: uuid.UUID, page: PageRequest
) -> PageResult[CommunityEvent]:
    async with database.session() as session:
        await require_member(session, circle_id, user.id)
        return await EventRepository(session).list_for_circle(circle_id, page)


async def create_event(
    database: Database, user: User, circle_id: uuid.UUID, data: NewEvent
) -> EventView:
    async with database.session() as session:
        await require_member(session, circle_id, user.id)
        event = await EventRepository(session).create(
            {
                "circle_id": circle_id,
                "organizer_user_id": user.id,
                "title": data.title,
                "description": data.description,
                "lang": data.lang,
                "starts_at": data.starts_at,
                "ends_at": data.ends_at,
                "location_note": data.location_note,
                "capacity": data.capacity,
            }
        )
        return await _view(session, event, user.id)


async def get_event(database: Database, user: User, event_id: uuid.UUID) -> EventView:
    async with database.session() as session:
        event = await _load_event(session, event_id)
        await require_member(session, event.circle_id, user.id)
        return await _view(session, event, user.id)


async def _require_organizer(
    session, event: CommunityEvent, user_id: uuid.UUID
) -> None:
    if not await MembershipRepository(session).is_approved_member(
        event.circle_id, user_id
    ):
        raise NotEventOrganizerError
    if event.organizer_user_id == user_id:
        return
    if await MembershipRepository(session).is_coordinator_or_leader(
        event.circle_id, user_id
    ):
        return
    raise NotEventOrganizerError


async def update_event(
    database: Database, user: User, event_id: uuid.UUID, changes: dict
) -> EventView:
    async with database.session() as session:
        event = await _load_event(session, event_id)
        await _require_organizer(session, event, user.id)
        if event.status == EventStatus.CANCELLED.value:
            raise EventCancelledError
        starts_at = changes.get("starts_at", event.starts_at)
        ends_at = changes.get("ends_at", event.ends_at)
        if ends_at is not None and ends_at < starts_at:
            raise InvalidEventWindowError
        if changes:
            event = await EventRepository(session).update(event, changes)
        return await _view(session, event, user.id)


async def cancel_event(
    database: Database, user: User, event_id: uuid.UUID
) -> EventView:
    async with database.session() as session:
        event = await _load_event(session, event_id)
        await _require_organizer(session, event, user.id)
        if event.status != EventStatus.CANCELLED.value:
            event = await EventRepository(session).update(
                event,
                {
                    "status": EventStatus.CANCELLED.value,
                    "cancelled_at": datetime.now(UTC),
                },
            )
        return await _view(session, event, user.id)


async def sign_up(
    database: Database, user: User, event_id: uuid.UUID, note: str | None
) -> EventView:
    async with database.session() as session:
        events = EventRepository(session)
        event = await events.get_for_update(event_id)
        if event is None:
            raise EventNotFoundError
        await require_member(session, event.circle_id, user.id)
        if event.status == EventStatus.CANCELLED.value:
            raise EventCancelledError
        signups = EventSignupRepository(session)
        existing = await signups.get(event_id, user.id)
        if existing is None:
            if event.capacity is not None:
                count = await signups.count(event_id)
                if count >= event.capacity:
                    raise EventFullError
            try:
                await signups.create(
                    {"event_id": event_id, "user_id": user.id, "note": note}
                )
            except DuplicateSignupError:
                pass
        return await _view(session, event, user.id)


async def cancel_signup(database: Database, user: User, event_id: uuid.UUID) -> None:
    async with database.session() as session:
        event = await _load_event(session, event_id)
        await require_member(session, event.circle_id, user.id)
        signups = EventSignupRepository(session)
        existing = await signups.get(event_id, user.id)
        if existing is not None:
            await signups.delete(existing)
