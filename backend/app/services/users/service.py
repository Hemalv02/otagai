import uuid
from dataclasses import asdict, dataclass

from app.database.connection import Database
from app.database.models import User
from app.database.models.enums import Region, UserKind, UserStatus
from app.repositories.users import DuplicateProfileError, UserRepository
from app.services.errors import ServiceError

REGION_TIMEZONES = {Region.JP: "Asia/Tokyo", Region.BD: "Asia/Dhaka"}


class ProfileNotFoundError(ServiceError):
    pass


class ProfileExistsError(ServiceError):
    pass


class AccountInactiveError(ServiceError):
    pass


@dataclass(frozen=True)
class NewProfile:
    display_name: str
    preferred_language: str
    region: str
    languages: list[str]
    age_band: str | None
    happy_to_help_with: str | None


async def get_active_profile(database: Database, auth_user_id: uuid.UUID) -> User:
    user = await UserRepository(database).get_by_auth_user_id(auth_user_id)
    if user is None:
        raise ProfileNotFoundError("Create your profile first.")
    if user.status != UserStatus.ACTIVE:
        raise AccountInactiveError("This account is not active.")
    return user


async def create_profile(
    database: Database, auth_user_id: uuid.UUID, profile: NewProfile
) -> User:
    languages = list(dict.fromkeys([profile.preferred_language, *profile.languages]))
    values = {
        **asdict(profile),
        "languages": languages,
        "auth_user_id": auth_user_id,
        "kind": UserKind.SELF.value,
        "timezone": REGION_TIMEZONES[Region(profile.region)],
    }
    try:
        return await UserRepository(database).create(values)
    except DuplicateProfileError as error:
        raise ProfileExistsError(
            "A profile already exists for this account."
        ) from error


async def update_profile(
    database: Database, user: User, changes: dict[str, object]
) -> User:
    if "languages" in changes or "preferred_language" in changes:
        preferred = changes.get("preferred_language", user.preferred_language)
        languages = changes.get("languages", user.languages)
        changes["languages"] = list(dict.fromkeys([preferred, *languages]))
    updated = await UserRepository(database).update(user.id, changes)
    if updated is None:
        raise ProfileNotFoundError("Create your profile first.")
    return updated
