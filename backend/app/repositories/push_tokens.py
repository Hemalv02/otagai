import uuid
from typing import Any

from sqlalchemy import literal_column
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import PushToken


class PushTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_owned(
        self, token_id: uuid.UUID, user_id: uuid.UUID
    ) -> PushToken | None:
        token = await self._session.get(PushToken, token_id)
        if token is None or token.user_id != user_id:
            return None
        return token

    async def upsert(self, values: dict[str, Any]) -> tuple[PushToken, bool]:
        statement = (
            insert(PushToken)
            .values(**values)
            .on_conflict_do_update(
                index_elements=[PushToken.expo_token],
                set_={
                    "user_id": values["user_id"],
                    "platform": values["platform"],
                    "last_seen_at": values.get("last_seen_at"),
                    "disabled_at": None,
                },
            )
            .returning(PushToken.id, literal_column("xmax = 0"))
        )
        token_id, inserted = (await self._session.execute(statement)).one()
        await self._session.flush()
        token = await self._session.get(PushToken, token_id, populate_existing=True)
        return token, bool(inserted)

    async def delete(self, token: PushToken) -> None:
        await self._session.delete(token)
        await self._session.flush()
