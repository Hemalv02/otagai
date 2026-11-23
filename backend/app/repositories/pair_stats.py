import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import PairStats


def ordered_pair(user_a: uuid.UUID, user_b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (user_a, user_b) if str(user_a) < str(user_b) else (user_b, user_a)


class PairStatsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_a: uuid.UUID, user_b: uuid.UUID) -> PairStats | None:
        low, high = ordered_pair(user_a, user_b)
        return await self._session.get(PairStats, (low, high))

    async def record_exchange(
        self, helper_user_id: uuid.UUID, requester_user_id: uuid.UUID, when: datetime
    ) -> PairStats:
        low, high = ordered_pair(helper_user_id, requester_user_id)
        helper_is_low = helper_user_id == low
        statement = (
            insert(PairStats)
            .values(
                user_low_id=low,
                user_high_id=high,
                low_helped_high=1 if helper_is_low else 0,
                high_helped_low=0 if helper_is_low else 1,
                first_met_at=when,
                last_exchange_at=when,
            )
            .on_conflict_do_update(
                index_elements=[PairStats.user_low_id, PairStats.user_high_id],
                set_={
                    "low_helped_high": PairStats.low_helped_high
                    + (1 if helper_is_low else 0),
                    "high_helped_low": PairStats.high_helped_low
                    + (0 if helper_is_low else 1),
                    "last_exchange_at": when,
                },
            )
        )
        await self._session.execute(statement)
        await self._session.flush()
        return await self._session.get(PairStats, (low, high), populate_existing=True)

    async def neighbours(self, user_id: uuid.UUID) -> list[PairStats]:
        statement = (
            select(PairStats)
            .where(
                (PairStats.user_low_id == user_id) | (PairStats.user_high_id == user_id)
            )
            .order_by(PairStats.last_exchange_at.desc().nullslast())
        )
        return list(await self._session.scalars(statement))
