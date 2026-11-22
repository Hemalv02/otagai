import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database.connection import Database
from app.database.models import User


class DuplicateProfileError(Exception):
    pass


class UserRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_by_auth_user_id(self, auth_user_id: uuid.UUID) -> User | None:
        async with self._database.session() as session:
            result = await session.execute(
                select(User).where(User.auth_user_id == auth_user_id)
            )
            return result.scalar_one_or_none()

    async def create(self, values: dict[str, Any]) -> User:
        user = User(**values)
        try:
            async with self._database.session() as session:
                session.add(user)
                await session.flush()
                await session.refresh(user)
        except IntegrityError as error:
            if "uq_users_auth_user_id" in str(error.orig):
                raise DuplicateProfileError from error
            raise
        return user

    async def update(self, user_id: uuid.UUID, values: dict[str, Any]) -> User | None:
        async with self._database.session() as session:
            user = await session.get(User, user_id, with_for_update=True)
            if user is None:
                return None
            for name, value in values.items():
                setattr(user, name, value)
            await session.flush()
            await session.refresh(user)
            return user
