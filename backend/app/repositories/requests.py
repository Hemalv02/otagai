import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Circle,
    CircleMembership,
    HelpRequest,
    RequestMedia,
    RequestRecipient,
    RequestResponse,
)
from app.database.models.enums import (
    CircleStatus,
    MembershipStatus,
    RequestStatus,
    ResponseStatus,
    RippleStage,
)
from app.repositories.blocks import blocked_user_ids
from app.repositories.errors import violates
from app.repositories.pagination import PageRequest, PageResult, paginate


class LiveResponseExistsError(Exception):
    pass


class ResponseAlreadyAcceptedError(Exception):
    pass


@dataclass(frozen=True)
class RequestFilters:
    statuses: tuple[str, ...] = ()


class RequestRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, request_id: uuid.UUID) -> HelpRequest | None:
        return await self._session.get(HelpRequest, request_id)

    async def get_for_update(self, request_id: uuid.UUID) -> HelpRequest | None:
        return await self._session.get(
            HelpRequest, request_id, with_for_update=True, populate_existing=True
        )

    async def due_for_ripple(
        self, now: datetime, request_id: uuid.UUID | None = None
    ) -> HelpRequest | None:
        statement = select(HelpRequest).where(
            HelpRequest.status == RequestStatus.OPEN.value,
            or_(HelpRequest.expires_at <= now, HelpRequest.next_widen_at <= now),
        )
        if request_id is not None:
            statement = statement.where(HelpRequest.id == request_id)
        return await self._session.scalar(
            statement.order_by(
                func.least(HelpRequest.expires_at, HelpRequest.next_widen_at),
                HelpRequest.id,
            )
            .limit(1)
            .with_for_update(skip_locked=True)
        )

    async def create(
        self, values: dict[str, Any], media_ids: list[uuid.UUID]
    ) -> HelpRequest:
        request = HelpRequest(**values)
        self._session.add(request)
        await self._session.flush()
        for index, media_id in enumerate(media_ids):
            self._session.add(
                RequestMedia(request_id=request.id, media_id=media_id, sort_order=index)
            )
        await self._session.flush()
        await self._session.refresh(request)
        return request

    async def update(self, request: HelpRequest, values: dict[str, Any]) -> HelpRequest:
        for name, value in values.items():
            setattr(request, name, value)
        await self._session.flush()
        await self._session.refresh(request)
        return request

    async def cancel_open_for_user(
        self, requester_user_id: uuid.UUID, now: datetime
    ) -> None:
        await self._session.execute(
            update(HelpRequest)
            .where(
                HelpRequest.requester_user_id == requester_user_id,
                HelpRequest.status.in_(
                    (RequestStatus.OPEN.value, RequestStatus.MATCHED.value)
                ),
            )
            .values(
                status=RequestStatus.CANCELLED.value,
                cancelled_at=now,
                next_widen_at=None,
            )
        )

    async def list_for_requester(
        self, requester_user_id: uuid.UUID, statuses: tuple[str, ...], page: PageRequest
    ) -> PageResult[HelpRequest]:
        statement = select(HelpRequest).where(
            HelpRequest.requester_user_id == requester_user_id
        )
        if statuses:
            statement = statement.where(HelpRequest.status.in_(statuses))
        return await paginate(
            self._session, statement, page, HelpRequest.created_at, HelpRequest.id
        )

    async def list_for_user_visible(
        self,
        viewer_user_id: uuid.UUID,
        owner_user_id: uuid.UUID,
        statuses: tuple[str, ...],
        page: PageRequest,
        *,
        include_all: bool,
    ) -> PageResult[HelpRequest]:
        statement = select(HelpRequest).where(
            HelpRequest.requester_user_id == owner_user_id,
            HelpRequest.direct_to_user_id.is_(None),
        )
        if not include_all:
            statement = statement.join(
                RequestRecipient, RequestRecipient.request_id == HelpRequest.id
            ).where(
                HelpRequest.status == RequestStatus.OPEN.value,
                RequestRecipient.user_id == viewer_user_id,
                RequestRecipient.hidden_at.is_(None),
            )
        if statuses:
            statement = statement.where(HelpRequest.status.in_(statuses))
        return await paginate(
            self._session, statement, page, HelpRequest.created_at, HelpRequest.id
        )

    async def list_received(
        self,
        user_id: uuid.UUID,
        exclude_owner_ids: list[uuid.UUID],
        *,
        direct_only: bool,
        page: PageRequest,
        statuses: tuple[str, ...] = (),
    ) -> PageResult[RequestRecipient]:
        statement = (
            select(RequestRecipient)
            .join(HelpRequest, RequestRecipient.request_id == HelpRequest.id)
            .where(
                RequestRecipient.user_id == user_id,
                RequestRecipient.hidden_at.is_(None),
            )
        )
        if direct_only:
            statement = statement.where(HelpRequest.direct_to_user_id == user_id)
        if statuses:
            statement = statement.where(HelpRequest.status.in_(statuses))
        if exclude_owner_ids:
            statement = statement.where(
                HelpRequest.requester_user_id.not_in(exclude_owner_ids)
            )
        return await paginate(
            self._session,
            statement,
            page,
            RequestRecipient.notified_at,
            RequestRecipient.request_id,
        )

    async def get_many(
        self, request_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, HelpRequest]:
        if not request_ids:
            return {}
        result = await self._session.scalars(
            select(HelpRequest).where(HelpRequest.id.in_(request_ids))
        )
        return {request.id: request for request in result}

    def _visible_in_circle(
        self,
        circle_id: uuid.UUID,
        viewer_id: uuid.UUID,
        acting_user_id: uuid.UUID | None = None,
    ):
        approved_viewer = (
            select(CircleMembership.user_id)
            .join(Circle, Circle.id == CircleMembership.circle_id)
            .where(
                CircleMembership.circle_id == circle_id,
                CircleMembership.user_id == viewer_id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
                Circle.status == CircleStatus.ACTIVE.value,
            )
            .exists()
        )
        delivered_to_viewer = (
            select(RequestRecipient.user_id)
            .where(
                RequestRecipient.request_id == HelpRequest.id,
                RequestRecipient.user_id == viewer_id,
                RequestRecipient.hidden_at.is_(None),
            )
            .exists()
        )
        legacy_circle_delivery = (
            select(RequestRecipient.user_id)
            .where(
                RequestRecipient.request_id == HelpRequest.id,
                RequestRecipient.stage == RippleStage.HAN.value,
            )
            .exists()
        )
        visibility = and_(
            approved_viewer,
            HelpRequest.home_circle_id == circle_id,
            HelpRequest.direct_to_user_id.is_(None),
            HelpRequest.ripple_max_stage.in_(
                (
                    RippleStage.HAN.value,
                    RippleStage.ASSOCIATION.value,
                    RippleStage.NEARBY.value,
                )
            ),
            or_(
                HelpRequest.ripple_history.has_key(RippleStage.HAN.value),
                legacy_circle_delivery,
            ),
            or_(HelpRequest.requester_user_id == viewer_id, delivered_to_viewer),
            HelpRequest.requester_user_id.not_in(blocked_user_ids(viewer_id)),
        )
        if acting_user_id is not None and acting_user_id != viewer_id:
            visibility = and_(
                visibility,
                HelpRequest.requester_user_id.not_in(blocked_user_ids(acting_user_id)),
            )
        return visibility

    async def list_for_circle(
        self,
        circle_id: uuid.UUID,
        viewer_id: uuid.UUID,
        statuses: tuple[str, ...],
        page: PageRequest,
    ) -> PageResult[HelpRequest]:
        statement = select(HelpRequest).where(
            self._visible_in_circle(circle_id, viewer_id)
        )
        if statuses:
            statement = statement.where(HelpRequest.status.in_(statuses))
        return await paginate(
            self._session, statement, page, HelpRequest.created_at, HelpRequest.id
        )

    async def list_unmet(
        self, circle_id: uuid.UUID, viewer_id: uuid.UUID, page: PageRequest
    ) -> PageResult[HelpRequest]:
        has_response = (
            select(RequestResponse.id)
            .where(
                RequestResponse.request_id == HelpRequest.id,
                RequestResponse.status.in_(
                    (ResponseStatus.PENDING.value, ResponseStatus.ACCEPTED.value)
                ),
            )
            .exists()
        )
        statement = select(HelpRequest).where(
            self._visible_in_circle(circle_id, viewer_id),
            HelpRequest.status == RequestStatus.OPEN.value,
            HelpRequest.expires_at > func.now(),
            ~has_response,
        )
        return await paginate(
            self._session, statement, page, HelpRequest.created_at, HelpRequest.id
        )

    async def count_open_for_circle(
        self,
        circle_id: uuid.UUID,
        viewer_id: uuid.UUID,
        acting_user_id: uuid.UUID,
    ) -> int:
        statement = select(func.count(HelpRequest.id)).where(
            self._visible_in_circle(circle_id, viewer_id, acting_user_id),
            HelpRequest.status == RequestStatus.OPEN.value,
            HelpRequest.expires_at > func.now(),
        )
        return await self._session.scalar(statement) or 0


class RecipientRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add_many(
        self,
        request_id: uuid.UUID,
        stage: str,
        user_ids: list[uuid.UUID],
        *,
        notified_at: datetime,
    ) -> None:
        for user_id in user_ids:
            self._session.add(
                RequestRecipient(
                    request_id=request_id,
                    user_id=user_id,
                    stage=stage,
                    notified_at=notified_at,
                )
            )
        await self._session.flush()

    async def delivery_totals(
        self, request_id: uuid.UUID
    ) -> dict[str, tuple[int, datetime]]:
        rows = await self._session.execute(
            select(
                RequestRecipient.stage,
                func.count(),
                func.min(RequestRecipient.notified_at),
            )
            .where(RequestRecipient.request_id == request_id)
            .group_by(RequestRecipient.stage)
        )
        return {stage: (count, notified_at) for stage, count, notified_at in rows}

    async def get(
        self, request_id: uuid.UUID, user_id: uuid.UUID
    ) -> RequestRecipient | None:
        return await self._session.get(RequestRecipient, (request_id, user_id))

    async def is_recipient(self, request_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return await self.get(request_id, user_id) is not None

    async def update(
        self, recipient: RequestRecipient, values: dict[str, Any]
    ) -> RequestRecipient:
        for name, value in values.items():
            setattr(recipient, name, value)
        await self._session.flush()
        await self._session.refresh(recipient)
        return recipient

    async def recipient_ids(self, request_id: uuid.UUID) -> list[uuid.UUID]:
        statement = select(RequestRecipient.user_id).where(
            RequestRecipient.request_id == request_id
        )
        return list(await self._session.scalars(statement))


class ResponseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, response_id: uuid.UUID) -> RequestResponse | None:
        return await self._session.get(RequestResponse, response_id)

    async def get_for_update(self, response_id: uuid.UUID) -> RequestResponse | None:
        return await self._session.get(
            RequestResponse,
            response_id,
            with_for_update=True,
            populate_existing=True,
        )

    async def create(self, values: dict[str, Any]) -> RequestResponse:
        response = RequestResponse(**values)
        self._session.add(response)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_request_responses_live_responder"):
                raise LiveResponseExistsError from error
            if violates(error, "uq_request_responses_one_accepted"):
                raise ResponseAlreadyAcceptedError from error
            raise
        await self._session.refresh(response)
        return response

    async def update(
        self, response: RequestResponse, values: dict[str, Any]
    ) -> RequestResponse:
        for name, value in values.items():
            setattr(response, name, value)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_request_responses_one_accepted"):
                raise ResponseAlreadyAcceptedError from error
            raise
        await self._session.refresh(response)
        return response

    async def withdraw_pending_for_user(
        self, responder_user_id: uuid.UUID, now: datetime
    ) -> None:
        await self._session.execute(
            update(RequestResponse)
            .where(
                RequestResponse.responder_user_id == responder_user_id,
                RequestResponse.status == ResponseStatus.PENDING.value,
            )
            .values(status=ResponseStatus.WITHDRAWN.value, decided_at=now)
        )

    async def list_for_request(
        self, request_id: uuid.UUID, page: PageRequest
    ) -> PageResult[RequestResponse]:
        statement = select(RequestResponse).where(
            RequestResponse.request_id == request_id
        )
        return await paginate(
            self._session,
            statement,
            page,
            RequestResponse.created_at,
            RequestResponse.id,
        )

    async def live_response_for(
        self, request_id: uuid.UUID, responder_user_id: uuid.UUID
    ) -> RequestResponse | None:
        statement = select(RequestResponse).where(
            RequestResponse.request_id == request_id,
            RequestResponse.responder_user_id == responder_user_id,
            RequestResponse.status.in_(
                (ResponseStatus.PENDING.value, ResponseStatus.ACCEPTED.value)
            ),
        )
        return await self._session.scalar(statement)

    async def supersede_others(
        self, request_id: uuid.UUID, keep_response_id: uuid.UUID
    ) -> None:
        statement = (
            select(RequestResponse)
            .where(
                RequestResponse.request_id == request_id,
                RequestResponse.id != keep_response_id,
                RequestResponse.status == ResponseStatus.PENDING.value,
            )
            .with_for_update()
        )
        for response in await self._session.scalars(statement):
            response.status = ResponseStatus.SUPERSEDED.value
            response.decided_at = datetime.now(tz=response.created_at.tzinfo)
        await self._session.flush()

    async def my_status_for_requests(
        self, user_id: uuid.UUID, request_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        if not request_ids:
            return {}
        statement = select(RequestResponse.request_id, RequestResponse.status).where(
            RequestResponse.responder_user_id == user_id,
            RequestResponse.request_id.in_(request_ids),
            RequestResponse.status.in_(
                (
                    ResponseStatus.PENDING.value,
                    ResponseStatus.ACCEPTED.value,
                )
            ),
        )
        return {row[0]: row[1] for row in await self._session.execute(statement)}

    async def count_live(self, request_id: uuid.UUID) -> int:
        statement = select(func.count()).where(
            RequestResponse.request_id == request_id,
            RequestResponse.status.in_(
                (ResponseStatus.PENDING.value, ResponseStatus.ACCEPTED.value)
            ),
        )
        return await self._session.scalar(statement) or 0
