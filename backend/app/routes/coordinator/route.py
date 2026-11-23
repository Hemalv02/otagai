import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict

from app.database.models.enums import RequestStatus
from app.routes.dependencies import ActorDep, CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.routes.relationships.route import UserSummary
from app.routes.requests.route import RequestSummary
from app.services.coordinator.service import (
    list_circle_requests,
    list_helpers,
    list_unmet_needs,
    map_pins,
)

circle_router = APIRouter(prefix="/circles", tags=["coordinator"])
map_router = APIRouter(prefix="/map-pins", tags=["coordinator"])


def _parse_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    values = [part.strip() for part in raw.split(",") if part.strip()]
    allowed = {item.value for item in RequestStatus}
    for value in values:
        if value not in allowed:
            raise ValueError("Unknown request status.")
    return tuple(dict.fromkeys(values))


class HelperModel(BaseModel):
    user: UserSummary
    active_listings: int


class HelperList(BaseModel):
    items: list[HelperModel]


class MapPinModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    circle_id: uuid.UUID
    name: str
    approx_lat: float
    approx_lng: float
    open_requests: int
    active_listings: int


class MapPinList(BaseModel):
    items: list[MapPinModel]


@circle_router.get("/{circle_id}/requests")
async def coordinator_requests(
    circle_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
    status_filter: Annotated[str | None, Query(alias="status", max_length=120)] = None,
) -> Page[RequestSummary]:
    result = await list_circle_requests(
        database, user, circle_id, _parse_statuses(status_filter), query.page()
    )
    return Page.build(result, RequestSummary)


@circle_router.get("/{circle_id}/unmet-needs")
async def coordinator_unmet_needs(
    circle_id: uuid.UUID,
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[RequestSummary]:
    result = await list_unmet_needs(database, user, circle_id, query.page())
    return Page.build(result, RequestSummary)


@circle_router.get("/{circle_id}/helpers")
async def coordinator_helpers(
    circle_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> HelperList:
    helpers = await list_helpers(database, user, circle_id)
    return HelperList(
        items=[
            HelperModel(
                user=UserSummary.model_validate(helper.user),
                active_listings=helper.active_listings,
            )
            for helper in helpers
        ]
    )


@map_router.get("")
async def read_map_pins(
    actor: ActorDep,
    database: DatabaseDep,
    bbox: Annotated[str, Query(max_length=100)],
) -> MapPinList:
    box = _parse_bbox(bbox)
    pins = await map_pins(database, actor, box)
    return MapPinList(
        items=[
            MapPinModel(
                circle_id=pin.circle.id,
                name=pin.circle.name,
                approx_lat=float(pin.circle.approx_lat),
                approx_lng=float(pin.circle.approx_lng),
                open_requests=pin.open_requests,
                active_listings=pin.active_listings,
            )
            for pin in pins
        ]
    )


def _bbox_error() -> HTTPException:
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Use bbox=min_lng,min_lat,max_lng,max_lat.",
    )


def _parse_bbox(raw: str) -> tuple[float, float, float, float]:
    parts = raw.split(",")
    if len(parts) != 4:
        raise _bbox_error()
    try:
        min_lng, min_lat, max_lng, max_lat = (float(part) for part in parts)
    except ValueError as error:
        raise _bbox_error() from error
    if not (
        -180 <= min_lng <= 180
        and -180 <= max_lng <= 180
        and -90 <= min_lat <= 90
        and -90 <= max_lat <= 90
        and min_lng <= max_lng
        and min_lat <= max_lat
    ):
        raise _bbox_error()
    return (min_lng, min_lat, max_lng, max_lat)
