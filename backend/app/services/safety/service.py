import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Report, User
from app.database.models.enums import ReportStatus, ReportTargetType
from app.repositories.blocks import BlockRepository
from app.repositories.circles import CircleRepository, MembershipRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.reports import ReportRepository
from app.repositories.users import UserRepository
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)


class CannotBlockSelfError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("You can't block yourself.")


class UserNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("User not found.")


class ReportNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Report not found.")


class NotCircleLeaderError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("Only a circle leader can do this.")


@dataclass(frozen=True)
class NewReport:
    target_type: str
    target_id: uuid.UUID
    reason: str
    details: str | None
    circle_id: uuid.UUID | None
    submission_id: uuid.UUID | None = None


async def block_user(
    database: Database, user: User, target_user_id: uuid.UUID
) -> tuple[User, bool]:
    if target_user_id == user.id:
        raise CannotBlockSelfError
    async with database.session() as session:
        target = await UserRepository(session).get(target_user_id)
        if target is None:
            raise UserNotFoundError
        created = await BlockRepository(session).create(
            blocker_user_id=user.id, blocked_user_id=target_user_id
        )
        return target, created


async def list_blocks(
    database: Database, user: User, page: PageRequest
) -> PageResult[User]:
    async with database.session() as session:
        return await BlockRepository(session).list_blocked(user.id, page)


async def unblock_user(
    database: Database, user: User, target_user_id: uuid.UUID
) -> None:
    async with database.session() as session:
        await BlockRepository(session).delete(
            blocker_user_id=user.id, blocked_user_id=target_user_id
        )


async def create_report(
    database: Database, user: User, new_report: NewReport
) -> Report:
    async with database.session() as session:
        circle_id = new_report.circle_id
        if (
            circle_id is None
            and new_report.target_type == ReportTargetType.USER.value
            and new_report.target_id != user.id
        ):
            circle_id = await CircleRepository(session).shared_approved_circle_id(
                user.id, new_report.target_id, prefer_eligible_leader=True
            )
        submitted = {
            "reporter_user_id": user.id,
            "target_type": new_report.target_type,
            "target_id": new_report.target_id,
            "reason": new_report.reason,
            "details": new_report.details,
        }
        report = await ReportRepository(session).create_or_get(
            new_report.submission_id or uuid.uuid4(),
            {**submitted, "circle_id": circle_id},
        )
        if any(getattr(report, name) != value for name, value in submitted.items()) or (
            new_report.circle_id is not None
            and report.circle_id != new_report.circle_id
        ):
            raise ConflictError("This submission ID was used for a different report.")
        return report


async def list_my_reports(
    database: Database, user: User, page: PageRequest
) -> PageResult[Report]:
    async with database.session() as session:
        return await ReportRepository(session).list_for_reporter(user.id, page)


async def list_circle_reports(
    database: Database,
    user: User,
    circle_id: uuid.UUID,
    statuses: tuple[str, ...],
    page: PageRequest,
) -> PageResult[Report]:
    async with database.session() as session:
        if not await MembershipRepository(session).is_leader(circle_id, user.id):
            raise NotCircleLeaderError
        return await ReportRepository(session).list_for_circle(
            circle_id, user.id, statuses, page
        )


async def resolve_report(
    database: Database, user: User, report_id: uuid.UUID, *, dismiss: bool
) -> Report:
    now = datetime.now(UTC)
    async with database.session() as session:
        reports = ReportRepository(session)
        report = await reports.get_for_update(report_id)
        if report is None or report.circle_id is None:
            raise ReportNotFoundError
        if (
            report.target_type == ReportTargetType.USER.value
            and report.target_id == user.id
        ):
            raise ReportNotFoundError
        if not await MembershipRepository(session).is_leader(report.circle_id, user.id):
            raise NotCircleLeaderError
        status = (
            ReportStatus.DISMISSED.value if dismiss else ReportStatus.RESOLVED.value
        )
        return await reports.update(
            report,
            {
                "status": status,
                "resolved_by_user_id": user.id,
                "resolved_at": now,
            },
        )
