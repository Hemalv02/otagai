import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import FamilyLink
from app.repositories.errors import violates


class DuplicateFamilyLinkError(Exception):
    pass


class FamilyLinkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, link_id: uuid.UUID) -> FamilyLink | None:
        return await self._session.get(FamilyLink, link_id)

    async def get_for_update(self, link_id: uuid.UUID) -> FamilyLink | None:
        return await self._session.get(
            FamilyLink, link_id, with_for_update=True, populate_existing=True
        )

    async def create(self, values: dict[str, Any]) -> FamilyLink:
        link = FamilyLink(**values)
        self._session.add(link)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_family_links_pair"):
                raise DuplicateFamilyLinkError from error
            raise
        await self._session.refresh(link)
        return link

    async def update(self, link: FamilyLink, values: dict[str, Any]) -> FamilyLink:
        for name, value in values.items():
            setattr(link, name, value)
        await self._session.flush()
        await self._session.refresh(link)
        return link

    async def exists_between(self, user_a: uuid.UUID, user_b: uuid.UUID) -> bool:
        low, high = (user_a, user_b) if str(user_a) < str(user_b) else (user_b, user_a)
        statement = select(FamilyLink.id).where(
            func.least(FamilyLink.user_id, FamilyLink.relative_user_id) == low,
            func.greatest(FamilyLink.user_id, FamilyLink.relative_user_id) == high,
        )
        return await self._session.scalar(statement) is not None

    async def list_for_user(self, user_id: uuid.UUID) -> list[FamilyLink]:
        statement = (
            select(FamilyLink)
            .where(
                or_(
                    FamilyLink.user_id == user_id,
                    FamilyLink.relative_user_id == user_id,
                )
            )
            .order_by(FamilyLink.created_at.desc())
        )
        return list(await self._session.scalars(statement))
