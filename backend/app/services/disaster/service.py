import uuid
from dataclasses import dataclass

from app.database.connection import Database
from app.database.models import DisasterAlert, DisasterCheckIn, User
from app.repositories.disaster import (
    DisasterAlertRepository,
    DisasterCheckInRepository,
)
from app.services.community.guards import require_leader, require_member
from app.services.errors import NotFoundError


class AlertNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Disaster alert not found.")


@dataclass(frozen=True)
class NewAlert:
    severity: str
    title: str
    message: str | None


@dataclass(frozen=True)
class CheckInView:
    check_in: DisasterCheckIn
    user: User


async def create_alert(
    database: Database, user: User, circle_id: uuid.UUID, data: NewAlert
) -> DisasterAlert:
    async with database.session() as session:
        await require_leader(session, circle_id, user.id)
        return await DisasterAlertRepository(session).create(
            {
                "circle_id": circle_id,
                "created_by_user_id": user.id,
                "severity": data.severity,
                "title": data.title,
                "message": data.message,
            }
        )


async def _load_alert(session, alert_id: uuid.UUID) -> DisasterAlert:
    alert = await DisasterAlertRepository(session).get(alert_id)
    if alert is None:
        raise AlertNotFoundError
    return alert


async def check_in(
    database: Database,
    user: User,
    alert_id: uuid.UUID,
    status: str,
    note: str | None,
) -> DisasterCheckIn:
    async with database.session() as session:
        alert = await _load_alert(session, alert_id)
        await require_member(session, alert.circle_id, user.id)
        return await DisasterCheckInRepository(session).upsert(
            alert_id, user.id, {"status": status, "note": note}
        )


async def list_check_ins(
    database: Database, user: User, alert_id: uuid.UUID
) -> list[CheckInView]:
    async with database.session() as session:
        alert = await _load_alert(session, alert_id)
        await require_member(session, alert.circle_id, user.id)
        rows = await DisasterCheckInRepository(session).list_for_alert(alert_id)
        return [CheckInView(check_in=row[0], user=row[1]) for row in rows]
