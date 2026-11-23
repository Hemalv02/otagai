import uuid
from dataclasses import dataclass
from datetime import datetime

from app.database.connection import Database
from app.database.models import CheckInSetting, User
from app.database.models.enums import UserStatus
from app.repositories.check_in_settings import CheckInSettingRepository
from app.repositories.users import UserRepository
from app.services.errors import BadRequestError

DEFAULT_FREQUENCY_DAYS = 3


class InvalidBuddyError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Choose a different person as your check-in buddy.")


@dataclass(frozen=True)
class CheckInSettingsView:
    enabled: bool
    frequency_days: int
    buddy_user_id: uuid.UUID | None
    last_checked_in_at: datetime | None
    updated_at: datetime | None


@dataclass(frozen=True)
class CheckInSettingsUpdate:
    enabled: bool
    frequency_days: int
    buddy_user_id: uuid.UUID | None


def _view(setting: CheckInSetting) -> CheckInSettingsView:
    return CheckInSettingsView(
        enabled=setting.enabled,
        frequency_days=setting.frequency_days,
        buddy_user_id=setting.buddy_user_id,
        last_checked_in_at=setting.last_checked_in_at,
        updated_at=setting.updated_at,
    )


def _defaults() -> CheckInSettingsView:
    return CheckInSettingsView(
        enabled=False,
        frequency_days=DEFAULT_FREQUENCY_DAYS,
        buddy_user_id=None,
        last_checked_in_at=None,
        updated_at=None,
    )


async def get_settings(database: Database, user: User) -> CheckInSettingsView:
    async with database.session() as session:
        setting = await CheckInSettingRepository(session).get(user.id)
        return _view(setting) if setting is not None else _defaults()


async def put_settings(
    database: Database, user: User, data: CheckInSettingsUpdate
) -> CheckInSettingsView:
    async with database.session() as session:
        if data.buddy_user_id is not None:
            if data.buddy_user_id == user.id:
                raise InvalidBuddyError
            buddy = await UserRepository(session).get(data.buddy_user_id)
            if buddy is None or buddy.status != UserStatus.ACTIVE.value:
                raise InvalidBuddyError
        setting = await CheckInSettingRepository(session).upsert(
            user.id,
            {
                "enabled": data.enabled,
                "frequency_days": data.frequency_days,
                "buddy_user_id": data.buddy_user_id,
            },
        )
        return _view(setting)
