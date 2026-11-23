import uuid
from dataclasses import dataclass
from enum import StrEnum

from app.database.connection import Database
from app.database.models import ProxyGrant, User
from app.database.models.enums import UserStatus
from app.repositories.proxy_grants import ProxyGrantRepository
from app.repositories.users import UserRepository
from app.services.errors import PermissionDeniedError


class ProxyScope(StrEnum):
    POST_REQUESTS = "can_post_requests"
    CHAT = "can_chat"
    THANK_AND_PAY = "can_thank_and_pay"
    VIEW_ACTIVITY = "can_view_activity"
    MANAGE_LISTINGS = "can_manage_listings"


SCOPE_MESSAGES = {
    ProxyScope.POST_REQUESTS: "You can't post requests for this person.",
    ProxyScope.CHAT: "You can't chat for this person.",
    ProxyScope.THANK_AND_PAY: "You can't send thank-yous or payments for this person.",
    ProxyScope.VIEW_ACTIVITY: "You can't see this person's activity.",
    ProxyScope.MANAGE_LISTINGS: "You can't manage this person's listings.",
}


class ProxyNotAllowedError(PermissionDeniedError):
    def __init__(self) -> None:
        super().__init__("You can't act for this person.")


class ProxyScopeError(PermissionDeniedError):
    pass


@dataclass(frozen=True)
class Actor:
    user: User
    subject: User
    grant: ProxyGrant | None

    @property
    def subject_id(self) -> uuid.UUID:
        return self.subject.id

    @property
    def is_proxy(self) -> bool:
        return self.grant is not None

    def require(self, scope: ProxyScope) -> None:
        if self.grant is not None and not getattr(self.grant, scope.value):
            raise ProxyScopeError(SCOPE_MESSAGES[scope])


async def resolve_actor(
    database: Database, user: User, acting_for: uuid.UUID | None
) -> Actor:
    if acting_for is None or acting_for == user.id:
        return Actor(user=user, subject=user, grant=None)
    async with database.session() as session:
        grant = await ProxyGrantRepository(session).get_active(
            member_user_id=acting_for, caretaker_user_id=user.id
        )
        subject = await UserRepository(session).get(acting_for) if grant else None
    if grant is None or subject is None or subject.status != UserStatus.ACTIVE:
        raise ProxyNotAllowedError
    return Actor(user=user, subject=subject, grant=grant)
