import uuid
from datetime import datetime, time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.database.models import PushToken, User
from app.database.models.enums import AgeBand, Language, Platform, Region
from app.routes.dependencies import AuthClaimsDep, CurrentUserDep, DatabaseDep
from app.services.users.service import (
    NewProfile,
    NewPushToken,
    create_profile,
    delete_account,
    register_push_token,
    remove_push_token,
    update_profile,
)

router = APIRouter(prefix="/users", tags=["users"])

DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
HelpText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]
IntroText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
]
ExpoToken = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$",
    ),
]


class CreateProfileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName
    preferred_language: Language
    region: Region
    languages: list[Language] = Field(default_factory=list, max_length=3)
    age_band: AgeBand | None = None
    happy_to_help_with: HelpText | None = None
    intro: IntroText | None = None
    profile_details_visible: bool = False


class UpdateProfileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    avatar_media_id: uuid.UUID | None = None
    preferred_language: Language | None = None
    languages: list[Language] | None = Field(default=None, max_length=3)
    age_band: AgeBand | None = None
    intro: IntroText | None = None
    happy_to_help_with: HelpText | None = None
    hobbies: HelpText | None = None
    profile_details_visible: bool | None = None
    accepts_money_orei: bool | None = None
    simple_mode: bool | None = None
    text_scale_percent: int | None = Field(default=None, ge=80, le=200)
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    push_enabled: bool | None = None


class RegisterPushTokenBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expo_token: ExpoToken
    platform: Platform


class PushTokenView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    platform: str
    created_at: datetime


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    display_name: str
    avatar_media_id: uuid.UUID | None
    preferred_language: str
    languages: list[str]
    region: str
    timezone: str
    age_band: str | None
    intro: str | None
    happy_to_help_with: str | None
    hobbies: str | None
    profile_details_visible: bool
    accepts_money_orei: bool
    simple_mode: bool
    text_scale_percent: int
    quiet_hours_start: time | None
    quiet_hours_end: time | None
    push_enabled: bool
    status: str
    created_at: datetime


def profile(user: User) -> UserProfile:
    return UserProfile.model_validate(user)


def push_token_view(token: PushToken) -> PushTokenView:
    return PushTokenView.model_validate(token)


@router.get("/me")
async def read_me(user: CurrentUserDep) -> UserProfile:
    return profile(user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_me(
    body: CreateProfileBody,
    claims: AuthClaimsDep,
    database: DatabaseDep,
    response: Response,
) -> UserProfile:
    new_profile = NewProfile(
        display_name=body.display_name,
        preferred_language=body.preferred_language.value,
        region=body.region.value,
        languages=[language.value for language in body.languages],
        age_band=body.age_band.value if body.age_band else None,
        happy_to_help_with=body.happy_to_help_with,
        intro=body.intro,
        profile_details_visible=body.profile_details_visible,
    )
    user = await create_profile(database, claims.auth_user_id, new_profile)
    response.headers["Location"] = "/users/me"
    return profile(user)


@router.patch("/me")
async def update_me(
    body: UpdateProfileBody, user: CurrentUserDep, database: DatabaseDep
) -> UserProfile:
    changes = body.model_dump(mode="json", exclude_unset=True)
    for field in ("quiet_hours_start", "quiet_hours_end"):
        if field in changes:
            changes[field] = getattr(body, field)
    for required in (
        "display_name",
        "preferred_language",
        "languages",
        "profile_details_visible",
        "text_scale_percent",
    ):
        if required in changes and changes[required] is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"{required} cannot be empty."
            )
    if not changes:
        return profile(user)
    return profile(await update_profile(database, user, changes))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(claims: AuthClaimsDep, database: DatabaseDep) -> None:
    await delete_account(database, claims.auth_user_id)


@router.post("/me/push-tokens", status_code=status.HTTP_201_CREATED)
async def register_my_push_token(
    body: RegisterPushTokenBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> PushTokenView:
    token, created = await register_push_token(
        database,
        user,
        NewPushToken(expo_token=body.expo_token, platform=body.platform.value),
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return push_token_view(token)


@router.delete("/me/push-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_my_push_token(
    token_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> None:
    await remove_push_token(database, user, token_id)
