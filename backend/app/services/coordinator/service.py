import uuid
from dataclasses import dataclass

from app.database.connection import Database
from app.database.models import Circle, HelpRequest, User
from app.repositories.circles import CircleRepository, MembershipRepository
from app.repositories.listings import ListingRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.requests import RequestRepository
from app.repositories.users import UserRepository
from app.services.actors.service import Actor
from app.services.errors import NotFoundError, PermissionDeniedError


class CircleNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Circle not found.")


class NotCoordinatorError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only a coordinator or leader can see this.")


@dataclass(frozen=True)
class HelperSummary:
    user: User
    active_listings: int


@dataclass(frozen=True)
class MapPin:
    circle: Circle
    open_requests: int
    active_listings: int


async def _require_coordinator(
    session, circle_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    circle = await CircleRepository(session).get(circle_id)
    if circle is None:
        raise CircleNotFoundError
    if not await MembershipRepository(session).is_coordinator_or_leader(
        circle_id, user_id
    ):
        raise NotCoordinatorError


async def list_circle_requests(
    database: Database,
    user: User,
    circle_id: uuid.UUID,
    statuses: tuple[str, ...],
    page: PageRequest,
) -> PageResult[HelpRequest]:
    async with database.session() as session:
        await _require_coordinator(session, circle_id, user.id)
        return await RequestRepository(session).list_for_circle(
            circle_id, statuses, page
        )


async def list_unmet_needs(
    database: Database, user: User, circle_id: uuid.UUID, page: PageRequest
) -> PageResult[HelpRequest]:
    async with database.session() as session:
        await _require_coordinator(session, circle_id, user.id)
        return await RequestRepository(session).list_unmet(circle_id, page)


async def list_helpers(
    database: Database, user: User, circle_id: uuid.UUID
) -> list[HelperSummary]:
    async with database.session() as session:
        await _require_coordinator(session, circle_id, user.id)
        member_ids = await MembershipRepository(session).approved_member_ids(circle_id)
        counts = await ListingRepository(session).count_active_for_owners(member_ids)
        users = UserRepository(session)
        summaries = []
        for member_id in member_ids:
            if member_id == user.id:
                continue
            member = await users.get(member_id)
            if member is not None:
                summaries.append(
                    HelperSummary(user=member, active_listings=counts.get(member_id, 0))
                )
    summaries.sort(key=lambda item: item.active_listings, reverse=True)
    return summaries


async def map_pins(
    database: Database, actor: Actor, bbox: tuple[float, float, float, float]
) -> list[MapPin]:
    min_lng, min_lat, max_lng, max_lat = bbox
    async with database.session() as session:
        circles_repo = CircleRepository(session)
        memberships_repo = MembershipRepository(session)
        circle_ids = await circles_repo.approved_circle_ids(actor.subject_id)
        circles = await circles_repo.get_many(circle_ids)
        requests_repo = RequestRepository(session)
        pins = []
        for circle in circles.values():
            if circle.approx_lat is None or circle.approx_lng is None:
                continue
            lat = float(circle.approx_lat)
            lng = float(circle.approx_lng)
            if not (min_lat <= lat <= max_lat and min_lng <= lng <= max_lng):
                continue
            open_requests = await requests_repo.list_for_circle(
                circle.id, ("open",), PageRequest(limit=50)
            )
            member_ids = await memberships_repo.approved_member_ids(circle.id)
            listing_counts = await ListingRepository(session).count_active_for_owners(
                member_ids
            )
            pins.append(
                MapPin(
                    circle=circle,
                    open_requests=len(open_requests.items),
                    active_listings=sum(listing_counts.values()),
                )
            )
    return pins
