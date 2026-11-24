import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import ProxyGrant
from app.repositories.errors import violates


class DuplicateGrantError(Exception):
    pass


class ProxyGrantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, grant_id: uuid.UUID) -> ProxyGrant | None:
        return await self._session.get(ProxyGrant, grant_id)

    async def get_for_update(self, grant_id: uuid.UUID) -> ProxyGrant | None:
        return await self._session.get(
            ProxyGrant, grant_id, with_for_update=True, populate_existing=True
        )

    async def get_active(
        self,
        *,
        member_user_id: uuid.UUID,
        caretaker_user_id: uuid.UUID,
        for_update: bool = False,
    ) -> ProxyGrant | None:
        statement = select(ProxyGrant).where(
            ProxyGrant.member_user_id == member_user_id,
            ProxyGrant.caretaker_user_id == caretaker_user_id,
            ProxyGrant.revoked_at.is_(None),
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    async def create(self, values: dict[str, Any]) -> ProxyGrant:
        grant = ProxyGrant(**values)
        self._session.add(grant)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_proxy_grants_active_pair"):
                raise DuplicateGrantError from error
            raise
        await self._session.refresh(grant)
        return grant

    async def update(self, grant: ProxyGrant, values: dict[str, Any]) -> ProxyGrant:
        for name, value in values.items():
            setattr(grant, name, value)
        await self._session.flush()
        await self._session.refresh(grant)
        return grant

    async def revoke_delegates(self, creator_grant: ProxyGrant) -> None:
        await self._session.execute(
            update(ProxyGrant)
            .where(
                ProxyGrant.member_user_id == creator_grant.member_user_id,
                ProxyGrant.id != creator_grant.id,
                ProxyGrant.revoked_at.is_(None),
            )
            .values(
                revoked_at=creator_grant.revoked_at,
                revoked_by_user_id=creator_grant.revoked_by_user_id,
            )
        )

    async def list_as_caretaker(self, caretaker_user_id: uuid.UUID) -> list[ProxyGrant]:
        statement = (
            select(ProxyGrant)
            .where(
                ProxyGrant.caretaker_user_id == caretaker_user_id,
                ProxyGrant.revoked_at.is_(None),
            )
            .order_by(ProxyGrant.created_at.desc())
        )
        return list(await self._session.scalars(statement))

    async def list_as_member(self, member_user_id: uuid.UUID) -> list[ProxyGrant]:
        statement = (
            select(ProxyGrant)
            .where(
                ProxyGrant.member_user_id == member_user_id,
                ProxyGrant.revoked_at.is_(None),
            )
            .order_by(ProxyGrant.created_at.desc())
        )
        return list(await self._session.scalars(statement))
