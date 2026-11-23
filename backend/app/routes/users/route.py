import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.database.models import User
from app.database.models.enums import AgeBand, Language, Region
from app.routes.dependencies import AuthClaimsDep, CurrentUserDep, DatabaseDep
from app.services.users.service import (
    NewProfile,
    ProfileExistsError,
    ProfileNotFoundError,
    create_profile,
    update_profile,
)

router = APIRouter(prefix="/users", tags=["users"])

DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
HelpText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]


class CreateProfileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName
    preferred_language: Language
    region: Region
    languages: list[Language] = Field(default_factory=list, max_length=3)
    age_band: AgeBand | None = None
    happy_to_help_with: HelpText | None = None


class UpdateProfileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: DisplayName | None = None
    preferred_language: Language | None = None
    languages: list[Language] | None = Field(default=None, max_length=3)
    age_band: AgeBand | None = None
    happy_to_help_with: HelpText | None = None
    accepts_money_orei: bool | None = None
    simple_mode: bool | None = None
    text_scale_percent: int | None = Field(default=None, ge=80, le=200)
    push_enabled: bool | None = None


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    display_name: str
    preferred_language: str
    languages: list[str]
    region: str
    timezone: str
    age_band: str | None
    intro: str | None
    happy_to_help_with: str | None
    accepts_money_orei: bool
    simple_mode: bool
    text_scale_percent: int
    push_enabled: bool
    status: str
    created_at: datetime


def profile(user: User) -> UserProfile:
    return UserProfile.model_validate(user)


@router.get("/me")
async def read_me(user: CurrentUserDep) -> UserProfile:
    return profile(user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_me(
    body: CreateProfileBody, claims: AuthClaimsDep, database: DatabaseDep
) -> UserProfile:
    new_profile = NewProfile(
        display_name=body.display_name,
        preferred_language=body.preferred_language.value,
        region=body.region.value,
        languages=[language.value for language in body.languages],
        age_band=body.age_band.value if body.age_band else None,
        happy_to_help_with=body.happy_to_help_with,
    )
    try:
        user = await create_profile(database, claims.auth_user_id, new_profile)
    except ProfileExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error
    return profile(user)


@router.patch("/me")
async def update_me(
    body: UpdateProfileBody, user: CurrentUserDep, database: DatabaseDep
) -> UserProfile:
    changes = body.model_dump(mode="json", exclude_unset=True)
    for required in ("display_name", "preferred_language", "languages"):
        if required in changes and changes[required] is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"{required} cannot be empty."
            )
    if not changes:
        return profile(user)
    try:
        updated = await update_profile(database, user, changes)
    except ProfileNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error
    return profile(updated)
