import uuid

from sqlalchemy import CompoundSelect, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Block, User
from app.repositories.pagination import PageRequest, PageResult, paginate


def blocked_user_ids(user_id: uuid.UUID) -> CompoundSelect[tuple[uuid.UUID]]:
    outgoing = select(Block.blocked_user_id).where(Block.blocker_user_id == user_id)
    incoming = select(Block.blocker_user_id).where(Block.blocked_user_id == user_id)
    return outgoing.union(incoming)


class BlockRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def is_blocked_either_way(
        self, user_id: uuid.UUID, other_id: uuid.UUID
    ) -> bool:
        if user_id == other_id:
            return False
        statement = select(Block).where(
            or_(
                (Block.blocker_user_id == user_id)
                & (Block.blocked_user_id == other_id),
                (Block.blocker_user_id == other_id)
                & (Block.blocked_user_id == user_id),
            )
        )
        return await self._session.scalar(statement.limit(1)) is not None

    async def blocked_either_way(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self._session.scalars(blocked_user_ids(user_id))
        return list(result)

    async def create(
        self, *, blocker_user_id: uuid.UUID, blocked_user_id: uuid.UUID
    ) -> bool:
        statement = (
            insert(Block)
            .values(blocker_user_id=blocker_user_id, blocked_user_id=blocked_user_id)
            .on_conflict_do_nothing(
                index_elements=[Block.blocker_user_id, Block.blocked_user_id]
            )
            .returning(Block.blocker_user_id)
        )
        created = await self._session.scalar(statement)
        return created is not None

    async def delete(
        self, *, blocker_user_id: uuid.UUID, blocked_user_id: uuid.UUID
    ) -> None:
        block = await self._session.get(Block, (blocker_user_id, blocked_user_id))
        if block is not None:
            await self._session.delete(block)
            await self._session.flush()

    async def list_blocked(
        self, blocker_user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[User]:
        statement = (
            select(User)
            .join(Block, Block.blocked_user_id == User.id)
            .where(Block.blocker_user_id == blocker_user_id)
        )
        return await paginate(self._session, statement, page, User.created_at, User.id)
