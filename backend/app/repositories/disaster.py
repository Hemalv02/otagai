import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import DisasterAlert, DisasterCheckIn, User


class DisasterAlertRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, alert_id: uuid.UUID) -> DisasterAlert | None:
        return await self._session.get(DisasterAlert, alert_id)

    async def create(self, values: dict[str, Any]) -> DisasterAlert:
        alert = DisasterAlert(**values)
        self._session.add(alert)
        await self._session.flush()
        await self._session.refresh(alert)
        return alert


class DisasterCheckInRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, alert_id: uuid.UUID, user_id: uuid.UUID
    ) -> DisasterCheckIn | None:
        return await self._session.get(DisasterCheckIn, (alert_id, user_id))

    async def upsert(
        self, alert_id: uuid.UUID, user_id: uuid.UUID, values: dict[str, Any]
    ) -> DisasterCheckIn:
        statement = (
            insert(DisasterCheckIn)
            .values(alert_id=alert_id, user_id=user_id, **values)
            .on_conflict_do_update(
                index_elements=[DisasterCheckIn.alert_id, DisasterCheckIn.user_id],
                set_=values,
            )
        )
        await self._session.execute(statement)
        await self._session.flush()
        return await self._session.get(
            DisasterCheckIn, (alert_id, user_id), populate_existing=True
        )

    async def list_for_alert(
        self, alert_id: uuid.UUID
    ) -> list[tuple[DisasterCheckIn, User]]:
        statement = (
            select(DisasterCheckIn, User)
            .join(User, User.id == DisasterCheckIn.user_id)
            .where(DisasterCheckIn.alert_id == alert_id)
            .order_by(DisasterCheckIn.created_at.asc())
        )
        result = await self._session.execute(statement)
        return [(row[0], row[1]) for row in result.all()]
