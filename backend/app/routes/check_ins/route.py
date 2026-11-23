import uuid
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.services.check_ins.service import (
    CheckInSettingsUpdate,
    CheckInSettingsView,
    get_settings,
    put_settings,
)

router = APIRouter(prefix="/users/me/check-in-settings", tags=["check-ins"])


class CheckInSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    frequency_days: int = Field(default=3, ge=1, le=30)
    buddy_user_id: uuid.UUID | None = None


class CheckInSettingsModel(BaseModel):
    enabled: bool
    frequency_days: int
    buddy_user_id: uuid.UUID | None
    last_checked_in_at: datetime | None
    updated_at: datetime | None


def settings_model(view: CheckInSettingsView) -> CheckInSettingsModel:
    return CheckInSettingsModel(
        enabled=view.enabled,
        frequency_days=view.frequency_days,
        buddy_user_id=view.buddy_user_id,
        last_checked_in_at=view.last_checked_in_at,
        updated_at=view.updated_at,
    )


@router.get("")
async def read_check_in_settings(
    user: CurrentUserDep, database: DatabaseDep
) -> CheckInSettingsModel:
    return settings_model(await get_settings(database, user))


@router.put("")
async def put_check_in_settings(
    body: CheckInSettingsBody, user: CurrentUserDep, database: DatabaseDep
) -> CheckInSettingsModel:
    view = await put_settings(
        database,
        user,
        CheckInSettingsUpdate(
            enabled=body.enabled,
            frequency_days=body.frequency_days,
            buddy_user_id=body.buddy_user_id,
        ),
    )
    return settings_model(view)
