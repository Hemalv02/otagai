import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import Database
from app.database.models import FamilyLink, PairStats, ProxyGrant, User
from app.database.models.enums import (
    LinkStatus,
    NotificationType,
    UserKind,
    UserStatus,
)
from app.repositories.blocks import BlockRepository
from app.repositories.family_links import (
    DuplicateFamilyLinkError,
    FamilyLinkRepository,
)
from app.repositories.notifications import NotificationRepository
from app.repositories.pair_stats import PairStatsRepository
from app.repositories.proxy_grants import DuplicateGrantError, ProxyGrantRepository
from app.repositories.users import UserRepository
from app.services.culture_packs import culture_pack_for
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.services.users.service import ordered_languages


class UserNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("User not found.")


class LinkNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Family link not found.")


class GrantNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Proxy grant not found.")


class NotAllowedError(PermissionDeniedError):
    def __init__(self, message: str = "You can't do this.") -> None:
        super().__init__(message)


class LinkExistsError(ConflictError):
    def __init__(self) -> None:
        super().__init__("A family link already exists with this person.")


class GrantExistsError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This person already has an active grant.")


@dataclass(frozen=True)
class NeighbourView:
    other: User
    pair: PairStats


@dataclass(frozen=True)
class LinkView:
    link: FamilyLink
    other: User | None


@dataclass(frozen=True)
class NewManagedUser:
    display_name: str
    preferred_language: str
    region: str
    languages: list[str]
    age_band: str | None


@dataclass(frozen=True)
class GrantScopes:
    can_post_requests: bool
    can_chat: bool
    can_thank_and_pay: bool
    can_view_activity: bool
    can_manage_listings: bool


@dataclass(frozen=True)
class NewGrant:
    member_user_id: uuid.UUID
    caretaker_user_id: uuid.UUID
    caretaker_role: str
    scopes: GrantScopes
    consent_method: str
    consent_witness_user_id: uuid.UUID | None


async def get_managed_profile_for_creator(
    session: AsyncSession,
    caller_id: uuid.UUID,
    member_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> User | None:
    member = await UserRepository(session).get(member_id)
    if (
        member is None
        or member.kind != UserKind.MANAGED.value
        or member.status != UserStatus.ACTIVE.value
        or member.created_by_user_id != caller_id
    ):
        return None
    grant = await ProxyGrantRepository(session).get_active(
        member_user_id=member_id, caretaker_user_id=caller_id, for_update=for_update
    )
    return member if grant is not None else None


async def _authority_over(
    session: AsyncSession,
    caller_id: uuid.UUID,
    member_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> bool:
    if caller_id == member_id:
        return True
    return (
        await get_managed_profile_for_creator(
            session, caller_id, member_id, for_update=for_update
        )
        is not None
    )


async def list_neighbours(database: Database, user: User) -> list[NeighbourView]:
    async with database.session() as session:
        pairs = await PairStatsRepository(session).neighbours(user.id)
        blocked = set(await BlockRepository(session).blocked_either_way(user.id))
        users = UserRepository(session)
        views = []
        for pair in pairs:
            other_id = (
                pair.user_high_id if pair.user_low_id == user.id else pair.user_low_id
            )
            if other_id in blocked:
                continue
            other = await users.get(other_id)
            if other is not None and other.status != UserStatus.DELETED.value:
                views.append(NeighbourView(other=other, pair=pair))
    return views


async def create_managed_user(
    database: Database,
    caretaker: User,
    profile: NewManagedUser,
    grant: NewGrant,
) -> tuple[User, ProxyGrant]:
    now = datetime.now(UTC)
    async with database.session() as session:
        managed = await UserRepository(session).create(
            {
                "kind": UserKind.MANAGED.value,
                "display_name": profile.display_name,
                "preferred_language": profile.preferred_language,
                "languages": ordered_languages(
                    profile.preferred_language, profile.languages
                ),
                "region": profile.region,
                "timezone": culture_pack_for(profile.region).timezone,
                "age_band": profile.age_band,
                "created_by_user_id": caretaker.id,
            }
        )
        try:
            created_grant = await ProxyGrantRepository(session).create(
                {
                    "member_user_id": managed.id,
                    "caretaker_user_id": caretaker.id,
                    "caretaker_role": grant.caretaker_role,
                    "can_post_requests": grant.scopes.can_post_requests,
                    "can_chat": grant.scopes.can_chat,
                    "can_thank_and_pay": grant.scopes.can_thank_and_pay,
                    "can_view_activity": grant.scopes.can_view_activity,
                    "can_manage_listings": grant.scopes.can_manage_listings,
                    "consent_method": grant.consent_method,
                    "consent_witness_user_id": grant.consent_witness_user_id,
                    "consented_at": now,
                }
            )
        except DuplicateGrantError as error:
            raise GrantExistsError from error
    return managed, created_grant


async def update_managed_user(
    database: Database, caretaker: User, user_id: uuid.UUID, changes: dict
) -> User:
    async with database.session() as session:
        users = UserRepository(session)
        if not await _authority_over(session, caretaker.id, user_id, for_update=True):
            raise UserNotFoundError
        managed = await users.get_for_update(user_id)
        if (
            managed is None
            or managed.kind != UserKind.MANAGED.value
            or managed.status != UserStatus.ACTIVE.value
        ):
            raise UserNotFoundError
        if "languages" in changes or "preferred_language" in changes:
            preferred = str(
                changes.get("preferred_language", managed.preferred_language)
            )
            languages = changes.get("languages", managed.languages)
            changes["languages"] = ordered_languages(preferred, list(languages))
        if not changes:
            return managed
        return await users.update(managed, changes)


async def list_family_links(database: Database, user: User) -> list[LinkView]:
    async with database.session() as session:
        links = await FamilyLinkRepository(session).list_for_user(user.id)
        users = UserRepository(session)
        views = []
        for link in links:
            other_id = (
                link.relative_user_id if link.user_id == user.id else link.user_id
            )
            views.append(LinkView(link=link, other=await users.get(other_id)))
    return views


async def create_family_link(
    database: Database,
    user: User,
    relative_user_id: uuid.UUID,
    relation: str,
) -> FamilyLink:
    if relative_user_id == user.id:
        raise BadRequestError("You can't link to yourself.")
    async with database.session() as session:
        relative = await UserRepository(session).get(relative_user_id)
        if relative is None or relative.status == UserStatus.DELETED.value:
            raise UserNotFoundError
        links = FamilyLinkRepository(session)
        if await links.exists_between(user.id, relative_user_id):
            raise LinkExistsError
        try:
            link = await links.create(
                {
                    "user_id": user.id,
                    "relative_user_id": relative_user_id,
                    "relation": relation,
                    "status": LinkStatus.PENDING.value,
                }
            )
        except DuplicateFamilyLinkError as error:
            raise LinkExistsError from error
        await NotificationRepository(session).create(
            relative_user_id,
            NotificationType.PROXY_GRANTED.value,
            {"family_link_id": str(link.id)},
        )
        return link


async def accept_family_link(
    database: Database, user: User, link_id: uuid.UUID
) -> FamilyLink:
    now = datetime.now(UTC)
    async with database.session() as session:
        links = FamilyLinkRepository(session)
        link = await links.get_for_update(link_id)
        if link is None or link.relative_user_id != user.id:
            raise LinkNotFoundError
        if link.status == LinkStatus.ACCEPTED.value:
            return link
        if link.status != LinkStatus.PENDING.value:
            raise ConflictError("This link can no longer be accepted.")
        return await links.update(
            link, {"status": LinkStatus.ACCEPTED.value, "decided_at": now}
        )


async def revoke_family_link(
    database: Database, user: User, link_id: uuid.UUID
) -> FamilyLink:
    now = datetime.now(UTC)
    async with database.session() as session:
        links = FamilyLinkRepository(session)
        link = await links.get_for_update(link_id)
        if link is None or user.id not in (
            link.user_id,
            link.relative_user_id,
        ):
            raise LinkNotFoundError
        if link.status == LinkStatus.REVOKED.value:
            return link
        return await links.update(
            link, {"status": LinkStatus.REVOKED.value, "decided_at": now}
        )


async def list_proxy_grants(
    database: Database, user: User, *, as_caretaker: bool
) -> list[tuple[ProxyGrant, User | None, bool]]:
    async with database.session() as session:
        repository = ProxyGrantRepository(session)
        grants = (
            await repository.list_as_caretaker(user.id)
            if as_caretaker
            else await repository.list_as_member(user.id)
        )
        users = UserRepository(session)
        pairs = []
        for grant in grants:
            other_id = grant.member_user_id if as_caretaker else grant.caretaker_user_id
            can_change = not as_caretaker or await _authority_over(
                session, user.id, grant.member_user_id
            )
            pairs.append((grant, await users.get(other_id), can_change))
    return pairs


async def create_proxy_grant(
    database: Database, user: User, new_grant: NewGrant
) -> ProxyGrant:
    now = datetime.now(UTC)
    if new_grant.member_user_id == new_grant.caretaker_user_id:
        raise BadRequestError("A person can't be their own caretaker.")
    async with database.session() as session:
        if not await _authority_over(
            session, user.id, new_grant.member_user_id, for_update=True
        ):
            raise NotAllowedError("You can't grant proxy over this person.")
        users = UserRepository(session)
        caretaker = await users.get(new_grant.caretaker_user_id)
        if caretaker is None or caretaker.status != UserStatus.ACTIVE.value:
            raise UserNotFoundError
        try:
            grant = await ProxyGrantRepository(session).create(
                {
                    "member_user_id": new_grant.member_user_id,
                    "caretaker_user_id": new_grant.caretaker_user_id,
                    "caretaker_role": new_grant.caretaker_role,
                    "can_post_requests": new_grant.scopes.can_post_requests,
                    "can_chat": new_grant.scopes.can_chat,
                    "can_thank_and_pay": new_grant.scopes.can_thank_and_pay,
                    "can_view_activity": new_grant.scopes.can_view_activity,
                    "can_manage_listings": new_grant.scopes.can_manage_listings,
                    "consent_method": new_grant.consent_method,
                    "consent_witness_user_id": new_grant.consent_witness_user_id,
                    "consented_at": now,
                }
            )
        except DuplicateGrantError as error:
            raise GrantExistsError from error
        await NotificationRepository(session).create(
            new_grant.caretaker_user_id,
            NotificationType.PROXY_GRANTED.value,
            {"grant_id": str(grant.id)},
        )
        return grant


async def _load_manageable_grant(
    session, user: User, grant_id: uuid.UUID
) -> ProxyGrant:
    repository = ProxyGrantRepository(session)
    grant = await repository.get(grant_id)
    if grant is None or grant.revoked_at is not None:
        raise GrantNotFoundError
    # Lock the creator's grant before the grant being changed.
    if not await _authority_over(
        session, user.id, grant.member_user_id, for_update=True
    ):
        if user.id == grant.caretaker_user_id:
            raise NotAllowedError("Only the person who gave access can change it.")
        raise GrantNotFoundError
    grant = await repository.get_for_update(grant_id)
    if grant is None or grant.revoked_at is not None:
        raise GrantNotFoundError
    return grant


async def update_proxy_grant(
    database: Database, user: User, grant_id: uuid.UUID, scope_changes: dict
) -> ProxyGrant:
    async with database.session() as session:
        grant = await _load_manageable_grant(session, user, grant_id)
        if not scope_changes:
            return grant
        return await ProxyGrantRepository(session).update(grant, scope_changes)


async def revoke_proxy_grant(
    database: Database, user: User, grant_id: uuid.UUID
) -> ProxyGrant:
    async with database.session() as session:
        repository = ProxyGrantRepository(session)
        grant = await repository.get(grant_id)
        if grant is None:
            raise GrantNotFoundError
        allowed = user.id in (
            grant.member_user_id,
            grant.caretaker_user_id,
        ) or await _authority_over(
            session, user.id, grant.member_user_id, for_update=True
        )
        if not allowed:
            raise GrantNotFoundError
        grant = await repository.get_for_update(grant_id)
        if grant is None:
            raise GrantNotFoundError
        if grant.revoked_at is None:
            grant = await repository.update(
                grant, {"revoked_at": datetime.now(UTC), "revoked_by_user_id": user.id}
            )
        subject = await UserRepository(session).get(grant.member_user_id)
        if (
            subject is not None
            and subject.kind == UserKind.MANAGED.value
            and subject.created_by_user_id == grant.caretaker_user_id
        ):
            await repository.revoke_delegates(grant)
        return grant
