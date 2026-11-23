import uuid
from typing import Any

from sqlalchemy import func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AssistantThread, AssistantTurn
from app.repositories.pagination import PageRequest, PageResult, paginate


class AssistantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_owned(
        self, turn_id: uuid.UUID, user_id: uuid.UUID, *, lock: bool = False
    ) -> AssistantTurn | None:
        statement = (
            select(AssistantTurn)
            .join(AssistantThread)
            .where(AssistantTurn.id == turn_id, AssistantThread.user_id == user_id)
        )
        if lock:
            statement = statement.with_for_update(of=AssistantTurn)
        return await self._session.scalar(statement)

    async def create_thread(self, user_id: uuid.UUID, title: str) -> AssistantThread:
        thread = AssistantThread(user_id=user_id, title=title)
        self._session.add(thread)
        await self._session.flush()
        return thread

    async def create_turn(
        self, thread_id: uuid.UUID, values: dict[str, Any]
    ) -> AssistantTurn:
        turn = AssistantTurn(thread_id=thread_id, **values)
        self._session.add(turn)
        await self._session.execute(
            update(AssistantThread)
            .where(AssistantThread.id == thread_id)
            .values(updated_at=func.now())
        )
        await self._session.flush()
        return turn

    async def set_request(
        self, turn: AssistantTurn, request_id: uuid.UUID, posted: dict[str, Any]
    ) -> None:
        turn.request_id = request_id
        turn.draft = posted
        await self._session.flush()

    async def add_listing_request(
        self, turn: AssistantTurn, receipt: dict[str, Any]
    ) -> None:
        turn.context = {
            **turn.context,
            "listing_requests": {
                **turn.context.get("listing_requests", {}),
                receipt["listing_id"]: receipt,
            },
        }
        await self._session.flush()

    async def recent_turns(self, last_turn: AssistantTurn) -> list[AssistantTurn]:
        statement = (
            select(AssistantTurn)
            .where(
                AssistantTurn.thread_id == last_turn.thread_id,
                tuple_(AssistantTurn.created_at, AssistantTurn.id)
                <= (last_turn.created_at, last_turn.id),
            )
            .order_by(AssistantTurn.created_at.desc(), AssistantTurn.id.desc())
            .limit(3)
        )
        return list(await self._session.scalars(statement))

    async def list_threads(
        self, user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[AssistantThread]:
        statement = select(AssistantThread).where(AssistantThread.user_id == user_id)
        return await paginate(
            self._session,
            statement,
            page,
            AssistantThread.updated_at,
            AssistantThread.id,
        )

    async def list_turns(
        self, thread_id: uuid.UUID, user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[AssistantTurn] | None:
        thread = await self._session.scalar(
            select(AssistantThread.id).where(
                AssistantThread.id == thread_id, AssistantThread.user_id == user_id
            )
        )
        if thread is None:
            return None
        statement = select(AssistantTurn).where(AssistantTurn.thread_id == thread_id)
        return await paginate(
            self._session, statement, page, AssistantTurn.created_at, AssistantTurn.id
        )
