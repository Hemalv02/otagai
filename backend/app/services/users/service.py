import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import PushToken, User
from app.database.models.enums import MediaPurpose, Region, UserKind, UserStatus
from app.repositories.exchanges import ExchangeRepository
from app.repositories.listings import ListingRepository
from app.repositories.media import MediaRepository
from app.repositories.push_tokens import PushTokenRepository
from app.repositories.requests import RequestRepository, ResponseRepository
from app.repositories.users import DuplicateProfileError, UserRepository
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)

REGION_TIMEZONES = {Region.JP: "Asia/Tokyo", Region.BD: "Asia/Dhaka"}


class ProfileNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Create your profile first.")


class ProfileExistsError(ConflictError):
    def __init__(self) -> None:
        super().__init__("A profile already exists for this account.")


class AccountInactiveError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("This account is not active.")


class InvalidAvatarError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Choose an avatar image you have uploaded.")


@dataclass(frozen=True)
class NewProfile:
    display_name: str
    preferred_language: str
    region: str
    languages: list[str]
    age_band: str | None
    happy_to_help_with: str | None


def ordered_languages(preferred: str, languages: list[str]) -> list[str]:
    return list(dict.fromkeys([preferred, *languages]))


async def get_active_profile(database: Database, auth_user_id: uuid.UUID) -> User:
    async with database.session() as session:
        user = await UserRepository(session).get_by_auth_user_id(auth_user_id)
    if user is None:
        raise ProfileNotFoundError
    if user.status != UserStatus.ACTIVE:
        raise AccountInactiveError
    return user


async def create_profile(
    database: Database, auth_user_id: uuid.UUID, profile: NewProfile
) -> User:
    values = {
        **asdict(profile),
        "languages": ordered_languages(profile.preferred_language, profile.languages),
        "auth_user_id": auth_user_id,
        "kind": UserKind.SELF.value,
        "timezone": REGION_TIMEZONES[Region(profile.region)],
    }
    try:
        async with database.session() as session:
            return await UserRepository(session).create(values)
    except DuplicateProfileError as error:
        raise ProfileExistsError from error


async def update_profile(
    database: Database, user: User, changes: dict[str, object]
) -> User:
    async with database.session() as session:
        repository = UserRepository(session)
        current = await repository.get_for_update(user.id)
        if current is None:
            raise ProfileNotFoundError
        if current.status != UserStatus.ACTIVE:
            raise AccountInactiveError
        if changes.get("avatar_media_id") is not None:
            avatar = await MediaRepository(session).owned_ready(
                uuid.UUID(str(changes["avatar_media_id"])),
                current.id,
                MediaPurpose.AVATAR.value,
            )
            if avatar is None:
                raise InvalidAvatarError
            changes["avatar_media_id"] = avatar.id
        if "languages" in changes or "preferred_language" in changes:
            preferred = str(
                changes.get("preferred_language", current.preferred_language)
            )
            languages = changes.get("languages", current.languages)
            changes["languages"] = ordered_languages(preferred, list(languages))
        if changes.get("intro") is not None and current.intro_lang is None:
            changes["intro_lang"] = str(
                changes.get("preferred_language", current.preferred_language)
            )
        return await repository.update(current, changes)


async def delete_account(database: Database, auth_user_id: uuid.UUID) -> None:
    now = datetime.now(UTC)
    async with database.session() as session:
        repository = UserRepository(session)
        current = await repository.get_by_auth_user_id(auth_user_id, for_update=True)
        if current is None:
            raise ProfileNotFoundError
        if current.status == UserStatus.DELETED:
            return
        if current.status != UserStatus.ACTIVE:
            raise AccountInactiveError
        # These writes serialize deletion with the acceptance of an existing offer.
        # A conflict below rolls back both writes.
        await RequestRepository(session).cancel_open_for_user(current.id, now)
        await ResponseRepository(session).withdraw_pending_for_user(current.id, now)
        if await ExchangeRepository(session).has_unresolved_for_user(current.id):
            raise ConflictError(
                "Finish or resolve your exchanges before deleting your account."
            )
        await ListingRepository(session).pause_active_for_owner(current.id)
        await repository.update(
            current,
            {
                "status": UserStatus.DELETED.value,
                "deleted_at": now,
                "display_name": "Former neighbour",
                "intro": None,
                "intro_lang": None,
                "happy_to_help_with": None,
                "avatar_media_id": None,
                "push_enabled": False,
            },
        )


@dataclass(frozen=True)
class NewPushToken:
    expo_token: str
    platform: str


async def register_push_token(
    database: Database, user: User, token: NewPushToken
) -> tuple[PushToken, bool]:
    values = {
        "user_id": user.id,
        "expo_token": token.expo_token,
        "platform": token.platform,
        "last_seen_at": datetime.now(UTC),
    }
    async with database.session() as session:
        return await PushTokenRepository(session).upsert(values)


async def remove_push_token(
    database: Database, user: User, token_id: uuid.UUID
) -> None:
    async with database.session() as session:
        repository = PushTokenRepository(session)
        token = await repository.get_owned(token_id, user.id)
        if token is not None:
            await repository.delete(token)
