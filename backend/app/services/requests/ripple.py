import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import Database
from app.database.models import Circle, HelpRequest
from app.database.models.enums import NotificationType, RequestStatus, RippleStage
from app.repositories.notifications import NotificationRepository
from app.repositories.request_ripple import RippleRepository
from app.repositories.requests import RecipientRepository, RequestRepository
from app.services.errors import BadRequestError
from app.services.notifications.dispatch import enqueue_ripple_push

RIPPLE_ORDER = tuple(RippleStage)
RIPPLE_INTERVAL = timedelta(hours=6)

StageStatus = Literal["sent", "no_recipients", "scheduled", "pending", "stopped"]
RippleStartStage = Literal[RippleStage.FAMILY, RippleStage.HAN]


@dataclass(frozen=True)
class RippleStageReceipt:
    stage: RippleStage
    status: StageStatus
    recipient_count: int
    delivered_at: datetime | None


@dataclass(frozen=True)
class RippleReceipt:
    request_id: uuid.UUID
    request_status: str
    current_stage: RippleStage
    max_stage: RippleStage
    next_widen_at: datetime | None
    expires_at: datetime
    stages: list[RippleStageReceipt]


def initial_stage(maximum: RippleStage, start: RippleStage | None) -> RippleStage:
    if maximum is RippleStage.DIRECT:
        raise BadRequestError("Set a direct recipient for a direct request.")
    if start is None:
        return RippleStage.HAN if maximum is RippleStage.HAN else RippleStage.FAMILY
    if start not in (RippleStage.FAMILY, RippleStage.HAN) or (
        RIPPLE_ORDER.index(start) > RIPPLE_ORDER.index(maximum)
    ):
        raise BadRequestError("Choose a starting audience within the maximum audience.")
    return start


def next_stage(request: HelpRequest) -> RippleStage | None:
    current = RIPPLE_ORDER.index(request.ripple_stage)
    maximum = RIPPLE_ORDER.index(request.ripple_max_stage)
    return RIPPLE_ORDER[current + 1] if current < maximum else None


def schedule_after(
    request: HelpRequest, now: datetime, expires_at: datetime
) -> datetime | None:
    last_attempt = request.ripple_history.get(request.ripple_stage)
    if not last_attempt or next_stage(request) is None:
        return None
    deadline = max(now, datetime.fromisoformat(last_attempt) + RIPPLE_INTERVAL)
    return deadline if deadline < expires_at else None


def reopen_after_match(
    request: HelpRequest, now: datetime
) -> dict[str, str | datetime | None]:
    if request.expires_at <= now:
        return {"status": RequestStatus.EXPIRED.value, "next_widen_at": None}
    return {
        "status": RequestStatus.OPEN.value,
        "next_widen_at": schedule_after(request, now, request.expires_at),
    }


async def deliver_from(
    session: AsyncSession,
    request: HelpRequest,
    start: RippleStage,
    lineage: list[Circle],
    now: datetime,
) -> HelpRequest:
    audiences = RippleRepository(session)
    recipients = RecipientRepository(session)
    notifications = NotificationRepository(session)
    history = dict(request.ripple_history)
    first = RIPPLE_ORDER.index(start)
    maximum = RIPPLE_ORDER.index(request.ripple_max_stage)
    scheduled = None
    stage = start
    for stage in RIPPLE_ORDER[first : maximum + 1]:
        users = await audiences.recipients(request, stage, lineage)
        history[stage.value] = now.isoformat()
        if not users:
            continue
        await recipients.add_many(request.id, stage.value, users, notified_at=now)
        notification_type = (
            NotificationType.REQUEST_DIRECT
            if stage is RippleStage.DIRECT
            else NotificationType.REQUEST_NEARBY
        )
        created = await notifications.create_many(
            users,
            notification_type.value,
            {"request_id": str(request.id), "ripple_stage": stage.value},
        )
        await enqueue_ripple_push(session, created)
        future = now + RIPPLE_INTERVAL
        if stage.value != request.ripple_max_stage and future < request.expires_at:
            scheduled = future
        break
    return await RequestRepository(session).update(
        request,
        {
            "ripple_stage": stage.value,
            "ripple_history": history,
            "next_widen_at": scheduled,
        },
    )


async def advance_ripple(
    session: AsyncSession, request: HelpRequest, now: datetime
) -> HelpRequest:
    next_audience = next_stage(request)
    requests = RequestRepository(session)
    if request.expires_at <= now:
        return await requests.update(
            request,
            {
                "status": RequestStatus.EXPIRED.value,
                "next_widen_at": None,
            },
        )
    lineage = await RippleRepository(session).home_lineage(
        request.requester_user_id, request.home_circle_id
    )
    if not lineage or next_audience is None:
        return await requests.update(request, {"next_widen_at": None})
    return await deliver_from(session, request, next_audience, lineage, now)


async def process_due_requests(
    database: Database,
    *,
    now: datetime | None = None,
    request_id: uuid.UUID | None = None,
    limit: int = 100,
) -> int:
    due_at = now or datetime.now(UTC)
    count = 0
    for _ in range(limit):
        async with database.session() as session:
            request = await RequestRepository(session).due_for_ripple(
                due_at, request_id
            )
            if request is None:
                break
            await advance_ripple(session, request, due_at)
        count += 1
    return count


async def delivery_receipt(
    session: AsyncSession, request: HelpRequest, now: datetime
) -> RippleReceipt:
    totals = await RecipientRepository(session).delivery_totals(request.id)
    current = RippleStage(request.ripple_stage)
    maximum = RippleStage(request.ripple_max_stage)
    stages = RIPPLE_ORDER[
        min(
            RIPPLE_ORDER.index(stage)
            for stage in {request.ripple_stage, *request.ripple_history, *totals}
        ) : max(RIPPLE_ORDER.index(current), RIPPLE_ORDER.index(maximum)) + 1
    ]
    open_now = request.status == RequestStatus.OPEN.value and now < request.expires_at
    next_at = request.next_widen_at if open_now else None
    next_audience = next_stage(request) if next_at else None
    timeline = []
    for stage in stages:
        status: StageStatus
        count, when = totals.get(stage.value, (0, None))
        if count:
            status = "sent"
        elif stage.value in request.ripple_history or stage is current:
            status = "no_recipients"
        elif stage is next_audience:
            status = "scheduled"
        elif next_audience is not None:
            status = "pending"
        else:
            status = "stopped"
        timeline.append(RippleStageReceipt(stage, status, count, when))
    return RippleReceipt(
        request.id,
        RequestStatus.EXPIRED.value
        if request.status == RequestStatus.OPEN.value and not open_now
        else request.status,
        current,
        maximum,
        next_at,
        request.expires_at,
        timeline,
    )
