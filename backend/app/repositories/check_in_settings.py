import uuid
from typing import Any

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import CheckInSetting


class CheckInSettingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID) -> CheckInSetting | None:
        return await self._session.get(CheckInSetting, user_id)

    async def upsert(
        self, user_id: uuid.UUID, values: dict[str, Any]
    ) -> CheckInSetting:
        statement = (
            insert(CheckInSetting)
            .values(user_id=user_id, **values)
            .on_conflict_do_update(
                index_elements=[CheckInSetting.user_id],
                set_={**values, "updated_at": func.now()},
            )
        )
        await self._session.execute(statement)
        await self._session.flush()
        return await self._session.get(CheckInSetting, user_id, populate_existing=True)
