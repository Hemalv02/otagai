import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AskSession


class AskSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, session_id: uuid.UUID) -> AskSession | None:
        return await self._session.get(AskSession, session_id)

    async def get_for_update(self, session_id: uuid.UUID) -> AskSession | None:
        return await self._session.get(
            AskSession, session_id, with_for_update=True, populate_existing=True
        )

    async def create(self, values: dict[str, Any]) -> AskSession:
        ask = AskSession(**values)
        self._session.add(ask)
        await self._session.flush()
        await self._session.refresh(ask)
        return ask

    async def update(self, ask: AskSession, values: dict[str, Any]) -> AskSession:
        for name, value in values.items():
            setattr(ask, name, value)
        await self._session.flush()
        await self._session.refresh(ask)
        return ask
