import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints

from app.database.models import DisasterAlert
from app.database.models.enums import AlertSeverity, CheckInStatus
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.services.disaster.service import (
    CheckInView,
    NewAlert,
    check_in,
    create_alert,
    list_check_ins,
)

circle_router = APIRouter(prefix="/circles", tags=["disaster"])
router = APIRouter(prefix="/disaster-alerts", tags=["disaster"])

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
Message = Annotated[str, StringConstraints(max_length=2000)]
CheckInNote = Annotated[str, StringConstraints(max_length=1000)]


class CreateAlertBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    severity: AlertSeverity
    title: Title
    message: Message | None = None


class CheckInBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: CheckInStatus
    note: CheckInNote | None = None


class AlertModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    circle_id: uuid.UUID
    created_by_user_id: uuid.UUID
    severity: str
    title: str
    message: str | None
    resolved_at: datetime | None
    created_at: datetime


class CheckInUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class CheckInModel(BaseModel):
    user: CheckInUser
    status: str
    note: str | None
    created_at: datetime


class CheckInList(BaseModel):
    items: list[CheckInModel]


def alert_model(alert: DisasterAlert) -> AlertModel:
    return AlertModel.model_validate(alert)


def check_in_model(view: CheckInView) -> CheckInModel:
    return CheckInModel(
        user=CheckInUser.model_validate(view.user),
        status=view.check_in.status,
        note=view.check_in.note,
        created_at=view.check_in.created_at,
    )


@circle_router.post("/{circle_id}/disaster-alerts", status_code=status.HTTP_201_CREATED)
async def post_disaster_alert(
    circle_id: uuid.UUID,
    body: CreateAlertBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> AlertModel:
    alert = await create_alert(
        database,
        user,
        circle_id,
        NewAlert(severity=body.severity.value, title=body.title, message=body.message),
    )
    response.headers["Location"] = f"/disaster-alerts/{alert.id}"
    return alert_model(alert)


@router.post("/{alert_id}/check-ins", status_code=status.HTTP_201_CREATED)
async def post_check_in(
    alert_id: uuid.UUID,
    body: CheckInBody,
    user: CurrentUserDep,
    database: DatabaseDep,
) -> CheckInModel:
    record = await check_in(database, user, alert_id, body.status.value, body.note)
    return CheckInModel(
        user=CheckInUser.model_validate(user),
        status=record.status,
        note=record.note,
        created_at=record.created_at,
    )


@router.get("/{alert_id}/check-ins")
async def read_check_ins(
    alert_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> CheckInList:
    views = await list_check_ins(database, user, alert_id)
    return CheckInList(items=[check_in_model(view) for view in views])
