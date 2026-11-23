import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.database.models.enums import Language
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.events.service import (
    EventView,
    NewEvent,
    cancel_event,
    cancel_signup,
    create_event,
    get_event,
    list_events,
    sign_up,
    update_event,
)

circle_router = APIRouter(prefix="/circles", tags=["events"])
router = APIRouter(prefix="/events", tags=["events"])

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
Description = Annotated[str, StringConstraints(max_length=2000)]
LocationNote = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
SignupNote = Annotated[str, StringConstraints(max_length=500)]


class CreateEventBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description | None = None
    lang: Language
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None = None
    location_note: LocationNote | None = None
    capacity: int | None = Field(default=None, ge=1, le=10000)

    @model_validator(mode="after")
    def check_window(self) -> "CreateEventBody":
        if self.ends_at is not None and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be at or after starts_at.")
        return self


class UpdateEventBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    description: Description | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    location_note: LocationNote | None = None
    capacity: int | None = Field(default=None, ge=1, le=10000)


class SignupBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: SignupNote | None = None


class EventModel(BaseModel):
    id: uuid.UUID
    circle_id: uuid.UUID
    organizer_user_id: uuid.UUID
    title: str
    description: str | None
    lang: str
    starts_at: datetime
    ends_at: datetime | None
    location_note: str | None
    capacity: int | None
    status: str
    cancelled_at: datetime | None
    signup_count: int
    signed_up: bool
    created_at: datetime


def event_model(view: EventView) -> EventModel:
    event = view.event
    return EventModel(
        id=event.id,
        circle_id=event.circle_id,
        organizer_user_id=event.organizer_user_id,
        title=event.title,
        description=event.description,
        lang=event.lang,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        location_note=event.location_note,
        capacity=event.capacity,
        status=event.status,
        cancelled_at=event.cancelled_at,
        signup_count=view.signup_count,
        signed_up=view.signed_up,
        created_at=event.created_at,
    )


class EventSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    circle_id: uuid.UUID
    organizer_user_id: uuid.UUID
    title: str
    lang: str
    starts_at: datetime
    ends_at: datetime | None
    location_note: str | None
    capacity: int | None
    status: str
    created_at: datetime


@circle_router.get("/{circle_id}/events")
async def read_circle_events(
    circle_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[EventSummary]:
    result = await list_events(database, user, circle_id, query.page())
    return Page.build(result, EventSummary)


@circle_router.post("/{circle_id}/events", status_code=status.HTTP_201_CREATED)
async def post_circle_event(
    circle_id: uuid.UUID,
    body: CreateEventBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> EventModel:
    view = await create_event(
        database,
        user,
        circle_id,
        NewEvent(
            title=body.title,
            description=body.description,
            lang=body.lang.value,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            location_note=body.location_note,
            capacity=body.capacity,
        ),
    )
    response.headers["Location"] = f"/events/{view.event.id}"
    return event_model(view)


@router.get("/{event_id}")
async def read_event(
    event_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> EventModel:
    return event_model(await get_event(database, user, event_id))


@router.patch("/{event_id}")
async def edit_event(
    event_id: uuid.UUID,
    body: UpdateEventBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> EventModel:
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "title cannot be empty."
        )
    if "starts_at" in changes and changes["starts_at"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "starts_at cannot be empty."
        )
    starts_at = changes.get("starts_at")
    ends_at = changes.get("ends_at")
    if starts_at is not None and ends_at is not None and ends_at < starts_at:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ends_at must be at or after starts_at.",
        )
    return event_model(await update_event(database, user, event_id, changes))


@router.post("/{event_id}/cancel")
async def cancel(
    event_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> EventModel:
    return event_model(await cancel_event(database, user, event_id))


@router.post("/{event_id}/signups", status_code=status.HTTP_201_CREATED)
async def create_signup(
    event_id: uuid.UUID,
    body: SignupBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> EventModel:
    return event_model(await sign_up(database, user, event_id, body.note))


@router.delete("/{event_id}/signups/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_signup(
    event_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> None:
    await cancel_signup(database, user, event_id)
