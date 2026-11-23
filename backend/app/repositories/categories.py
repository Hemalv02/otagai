import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Category


class CategoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self, kind: str | None) -> list[Category]:
        statement = select(Category)
        if kind is not None:
            statement = statement.where(Category.kind == kind)
        statement = statement.order_by(
            Category.kind, Category.sort_order, Category.slug
        )
        return list(await self._session.scalars(statement))

    async def get(self, category_id: uuid.UUID) -> Category | None:
        return await self._session.get(Category, category_id)

    async def exists_for_kind(self, category_id: uuid.UUID, kind: str) -> bool:
        statement = select(Category.id).where(
            Category.id == category_id, Category.kind == kind
        )
        return await self._session.scalar(statement) is not None
