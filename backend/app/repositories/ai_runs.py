import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AiRun


class AiRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, values: dict[str, Any]) -> AiRun:
        run = AiRun(**values)
        self._session.add(run)
        await self._session.flush()
        await self._session.refresh(run)
        return run

    async def get(self, run_id: uuid.UUID) -> AiRun | None:
        return await self._session.get(AiRun, run_id)

    async def delete_created_before(self, cutoff: datetime) -> int:
        result = await self._session.execute(
            delete(AiRun).where(AiRun.created_at < cutoff)
        )
        return result.rowcount or 0
