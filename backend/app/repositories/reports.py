import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Report
from app.database.models.enums import ReportTargetType
from app.repositories.pagination import PageRequest, PageResult, paginate


class ReportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, report_id: uuid.UUID) -> Report | None:
        return await self._session.get(Report, report_id)

    async def get_for_update(self, report_id: uuid.UUID) -> Report | None:
        return await self._session.get(
            Report, report_id, with_for_update=True, populate_existing=True
        )

    async def create_or_get(
        self, report_id: uuid.UUID, values: dict[str, Any]
    ) -> Report:
        statement = (
            insert(Report)
            .values(id=report_id, **values)
            .on_conflict_do_nothing(index_elements=[Report.id])
            .returning(Report)
        )
        report = await self._session.scalar(statement)
        if report is not None:
            return report
        result = await self._session.scalars(
            select(Report).where(Report.id == report_id)
        )
        return result.one()

    async def update(self, report: Report, values: dict[str, Any]) -> Report:
        for name, value in values.items():
            setattr(report, name, value)
        await self._session.flush()
        await self._session.refresh(report)
        return report

    async def list_for_reporter(
        self, reporter_user_id: uuid.UUID, page: PageRequest
    ) -> PageResult[Report]:
        statement = select(Report).where(Report.reporter_user_id == reporter_user_id)
        return await paginate(
            self._session, statement, page, Report.created_at, Report.id
        )

    async def list_for_circle(
        self,
        circle_id: uuid.UUID,
        moderator_id: uuid.UUID,
        statuses: tuple[str, ...],
        page: PageRequest,
    ) -> PageResult[Report]:
        statement = select(Report).where(
            Report.circle_id == circle_id,
            or_(
                Report.target_type != ReportTargetType.USER.value,
                Report.target_id != moderator_id,
            ),
        )
        if statuses:
            statement = statement.where(Report.status.in_(statuses))
        return await paginate(
            self._session, statement, page, Report.created_at, Report.id
        )
