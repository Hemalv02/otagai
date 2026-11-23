import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import User
from app.repositories.errors import violates


class DuplicateProfileError(Exception):
    pass


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_for_update(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(
            User, user_id, with_for_update=True, populate_existing=True
        )

    async def get_by_auth_user_id(self, auth_user_id: uuid.UUID) -> User | None:
        return await self._session.scalar(
            select(User).where(User.auth_user_id == auth_user_id)
        )

    async def create(self, values: dict[str, Any]) -> User:
        user = User(**values)
        self._session.add(user)
        try:
            await self._session.flush()
        except IntegrityError as error:
            if violates(error, "uq_users_auth_user_id"):
                raise DuplicateProfileError from error
            raise
        await self._session.refresh(user)
        return user

    async def update(self, user: User, values: dict[str, Any]) -> User:
        for name, value in values.items():
            setattr(user, name, value)
        await self._session.flush()
        await self._session.refresh(user)
        return user
