import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.database.models import Report, User
from app.database.models.enums import ReportReason, ReportStatus, ReportTargetType
from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.routes.pagination import Page, PageQuery
from app.services.safety.service import (
    NewReport,
    block_user,
    create_report,
    list_blocks,
    list_circle_reports,
    list_my_reports,
    resolve_report,
    unblock_user,
)

blocks_router = APIRouter(prefix="/users/me/blocks", tags=["safety"])
reports_router = APIRouter(prefix="/reports", tags=["safety"])
my_reports_router = APIRouter(prefix="/users/me/reports", tags=["safety"])
circle_reports_router = APIRouter(prefix="/circles", tags=["safety"])

ReportDetails = Annotated[str, StringConstraints(max_length=2000)]


class BlockBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID


class BlockedUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class CreateReportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: ReportTargetType
    target_id: uuid.UUID
    reason: ReportReason
    details: ReportDetails | None = None
    circle_id: uuid.UUID | None = None
    submission_id: uuid.UUID | None = None


class ReportModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    reason: str
    details: str | None
    status: str
    circle_id: uuid.UUID | None
    created_at: datetime


def report_model(report: Report) -> ReportModel:
    return ReportModel.model_validate(report)


def blocked_user(user: User) -> BlockedUser:
    return BlockedUser.model_validate(user)


def _parse_report_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    values = [part.strip() for part in raw.split(",") if part.strip()]
    allowed = {item.value for item in ReportStatus}
    for value in values:
        if value not in allowed:
            raise ValueError("Unknown report status.")
    return tuple(dict.fromkeys(values))


class CircleReportsQuery(PageQuery):
    status: str | None = Field(default=None, max_length=120)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        _parse_report_statuses(value)
        return value

    def statuses(self) -> tuple[str, ...]:
        return _parse_report_statuses(self.status)


@blocks_router.post("", status_code=status.HTTP_201_CREATED)
async def block(
    body: BlockBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> BlockedUser:
    target, created = await block_user(database, user, body.user_id)
    if not created:
        response.status_code = status.HTTP_200_OK
    return blocked_user(target)


@blocks_router.get("")
async def my_blocks(
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[BlockedUser]:
    result = await list_blocks(database, user, query.page())
    return Page.build(result, BlockedUser)


@blocks_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(
    user_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> None:
    await unblock_user(database, user, user_id)


@reports_router.post("", status_code=status.HTTP_201_CREATED)
async def report(
    body: CreateReportBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    response: Response,
) -> ReportModel:
    created = await create_report(
        database,
        user,
        NewReport(
            target_type=body.target_type.value,
            target_id=body.target_id,
            reason=body.reason.value,
            details=body.details,
            circle_id=body.circle_id,
            submission_id=body.submission_id,
        ),
    )
    response.headers["Location"] = f"/reports/{created.id}"
    return report_model(created)


@reports_router.post("/{report_id}/resolve")
async def resolve(
    report_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> ReportModel:
    return report_model(await resolve_report(database, user, report_id, dismiss=False))


@reports_router.post("/{report_id}/dismiss")
async def dismiss(
    report_id: uuid.UUID, user: CurrentUserDep, database: DatabaseDep
) -> ReportModel:
    return report_model(await resolve_report(database, user, report_id, dismiss=True))


@my_reports_router.get("")
async def my_reports(
    query: Annotated[PageQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[ReportModel]:
    result = await list_my_reports(database, user, query.page())
    return Page.build(result, ReportModel)


@circle_reports_router.get("/{circle_id}/reports")
async def circle_reports(
    circle_id: uuid.UUID,
    query: Annotated[CircleReportsQuery, Query()],
    user: CurrentUserDep,
    database: DatabaseDep,
) -> Page[ReportModel]:
    result = await list_circle_reports(
        database, user, circle_id, query.statuses(), query.page()
    )
    return Page.build(result, ReportModel)
