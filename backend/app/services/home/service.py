from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.database.connection import Database
from app.database.models import Exchange, HelpRequest, RequestRecipient, User
from app.database.models.enums import ExchangeStatus, RequestStatus
from app.repositories.blocks import BlockRepository
from app.repositories.chat import MessageRepository
from app.repositories.exchanges import ExchangeRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest
from app.repositories.requests import RequestRepository

HOME_LIMIT = 5
DUE_SOON = timedelta(hours=24)


@dataclass(frozen=True)
class UnreadCounts:
    notifications: int
    messages: int


@dataclass(frozen=True)
class HomeView:
    received_requests: list[tuple[HelpRequest, RequestRecipient]]
    active_exchanges: list[Exchange]
    due_soon: list[Exchange]


async def unread_counts(database: Database, user: User) -> UnreadCounts:
    async with database.session() as session:
        notifications = await NotificationRepository(session).unread_count(user.id)
        messages = await MessageRepository(session).total_unread(user.id)
    return UnreadCounts(notifications=notifications, messages=messages)


async def home(database: Database, user: User) -> HomeView:
    now = datetime.now(UTC)
    async with database.session() as session:
        blocked = await BlockRepository(session).blocked_either_way(user.id)
        requests_repo = RequestRepository(session)
        recipients = await requests_repo.list_received(
            user.id,
            blocked,
            direct_only=False,
            page=PageRequest(limit=HOME_LIMIT),
            statuses=(RequestStatus.OPEN.value,),
            expires_after=now,
        )
        received_requests = await requests_repo.get_many(
            [recipient.request_id for recipient in recipients.items]
        )
        received_items = [
            (received_requests[recipient.request_id], recipient)
            for recipient in recipients.items
            if recipient.request_id in received_requests
        ]
        exchange_repo = ExchangeRepository(session)
        open_statuses = (ExchangeStatus.SCHEDULED.value, ExchangeStatus.ACTIVE.value)
        exchanges = await exchange_repo.list_for_user(
            user.id, open_statuses, PageRequest(limit=50)
        )
        due_soon = await exchange_repo.list_for_user(
            user.id, open_statuses, PageRequest(limit=HOME_LIMIT), due_by=now + DUE_SOON
        )
    active = [
        exchange
        for exchange in exchanges.items
        if exchange.status == ExchangeStatus.ACTIVE.value
    ][:HOME_LIMIT]
    return HomeView(
        received_requests=received_items,
        active_exchanges=active,
        due_soon=due_soon.items,
    )
