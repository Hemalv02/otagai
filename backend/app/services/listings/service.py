import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.database.connection import Database
from app.database.models import Listing, ListingPart, User
from app.database.models.enums import (
    LendMode,
    ListingKind,
    ListingStatus,
    MediaPurpose,
)
from app.repositories.blocks import BlockRepository
from app.repositories.categories import CategoryRepository
from app.repositories.circles import CircleRepository
from app.repositories.listings import ListingFilters, ListingRepository
from app.repositories.media import MediaRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.users import UserRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import BadRequestError, ConflictError, NotFoundError
from app.services.storage.service import Storage
from app.settings import Settings

MAX_MEDIA = 8
MAX_PARTS = 30
RISKY_LEND_MODE = LendMode.HELP_ONLY.value


class ListingNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Listing not found.")


class InvalidCategoryError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Choose a category that matches the listing kind.")


class InvalidListingMediaError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("Choose listing photos you have uploaded.")


class ListingLentOutError(ConflictError):
    def __init__(self) -> None:
        super().__init__("You can't change a listing while it is lent out.")


@dataclass(frozen=True)
class Photo:
    media_id: uuid.UUID
    thumb_url: str | None
    display_url: str | None


@dataclass(frozen=True)
class ListingCard:
    listing: Listing
    photo_url: str | None


@dataclass(frozen=True)
class ListingDetail:
    listing: Listing
    owner: User | None
    parts: list[ListingPart]
    photos: list[Photo]


@dataclass(frozen=True)
class NewListing:
    kind: str
    category_id: uuid.UUID
    title: str
    description: str | None
    lang: str
    safety_notes: str | None
    lend_mode: str
    max_loan_days: int | None
    availability_note: str | None
    visibility: str
    media_ids: list[uuid.UUID] = field(default_factory=list)
    parts: list[dict] = field(default_factory=list)


async def _sign(storage: Storage, settings: Settings, keys: list[str]) -> list[str]:
    ttl = settings.media_signed_url_ttl_seconds
    return list(
        await asyncio.gather(
            *(storage.presigned_get_url(key, expires_in=ttl) for key in keys)
        )
    )


async def _detail_view(
    session, storage: Storage, settings: Settings, listing: Listing
) -> ListingDetail:
    repository = ListingRepository(session)
    parts = await repository.parts_for(listing.id)
    rows = await repository.media_rows(listing.id)
    owner = await UserRepository(session).get(listing.owner_user_id)
    order: list[uuid.UUID] = []
    keys: dict[uuid.UUID, dict[str, str]] = {}
    for media_id, variant, s3_key in rows:
        if media_id not in keys:
            keys[media_id] = {}
            order.append(media_id)
        keys[media_id][variant] = s3_key
    flat = [keys[m].get(v) for m in order for v in ("thumb", "display")]
    signed = await _sign(storage, settings, [key for key in flat if key])
    signed_iter = iter(signed)
    photos = []
    for media_id in order:
        thumb = keys[media_id].get("thumb")
        display = keys[media_id].get("display")
        photos.append(
            Photo(
                media_id=media_id,
                thumb_url=next(signed_iter) if thumb else None,
                display_url=next(signed_iter) if display else None,
            )
        )
    return ListingDetail(listing=listing, owner=owner, parts=parts, photos=photos)


async def browse_listings(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    filters: ListingFilters,
    page: PageRequest,
    *,
    exclude_own: bool = False,
) -> PageResult[ListingCard]:
    async with database.session() as session:
        circles = CircleRepository(session)
        circle_ids = await circles.approved_circle_ids(actor.subject_id)
        if filters.circle_id and filters.circle_id not in circle_ids:
            raise ListingNotFoundError
        excluded_owners = await BlockRepository(session).blocked_either_way(
            actor.subject_id
        )
        if exclude_own:
            excluded_owners.append(actor.subject_id)
        result = await ListingRepository(session).search(
            viewer_circle_ids=circle_ids,
            exclude_owner_ids=excluded_owners,
            filters=filters,
            page=page,
        )
        thumbs = await ListingRepository(session).primary_thumbs(
            [listing.id for listing in result.items]
        )
    return await _cards_with_thumbs(storage, settings, result, thumbs)


async def _cards_with_thumbs(
    storage: Storage,
    settings: Settings,
    result: PageResult[Listing],
    thumbs: dict[uuid.UUID, str],
) -> PageResult[ListingCard]:
    keys = [thumbs[listing.id] for listing in result.items if listing.id in thumbs]
    signed = await _sign(storage, settings, keys)
    url_by_key = dict(zip(keys, signed, strict=True))
    items = [
        ListingCard(
            listing=listing,
            photo_url=url_by_key.get(thumbs.get(listing.id)),
        )
        for listing in result.items
    ]
    return PageResult(items=items, next_cursor=result.next_cursor)


async def match_assistant_listings(
    database: Database,
    storage: Storage,
    settings: Settings,
    user_id: uuid.UUID,
    tool_terms: list[str],
    skill_terms: list[str],
) -> list[tuple[ListingCard, str]]:
    if not (tool_terms or skill_terms):
        return []
    async with database.session() as session:
        circle_ids = await CircleRepository(session).approved_circle_ids(user_id)
        hidden = await BlockRepository(session).blocked_either_way(user_id)
        repository = ListingRepository(session)
        matches = await repository.assistant_matches(
            circle_ids=circle_ids,
            excluded_owners=[user_id, *hidden],
            tool_terms=tool_terms,
            skill_terms=skill_terms,
        )
        thumbs = await repository.primary_thumbs([listing.id for listing, _ in matches])
    result = await _cards_with_thumbs(
        storage,
        settings,
        PageResult(items=[listing for listing, _ in matches], next_cursor=None),
        thumbs,
    )
    return [(card, name) for card, (_, name) in zip(result.items, matches, strict=True)]


async def assistant_listings_by_id(
    database: Database,
    storage: Storage,
    settings: Settings,
    user_id: uuid.UUID,
    listing_ids: list[uuid.UUID],
) -> dict[uuid.UUID, tuple[ListingCard, str]]:
    if not listing_ids:
        return {}
    async with database.session() as session:
        circle_ids = await CircleRepository(session).approved_circle_ids(user_id)
        hidden = await BlockRepository(session).blocked_either_way(user_id)
        repository = ListingRepository(session)
        matches = await repository.assistant_matches_by_id(
            listing_ids, circle_ids, [user_id, *hidden]
        )
        thumbs = await repository.primary_thumbs([listing.id for listing, _ in matches])
    result = await _cards_with_thumbs(
        storage,
        settings,
        PageResult(items=[listing for listing, _ in matches], next_cursor=None),
        thumbs,
    )
    return {
        card.listing.id: (card, name)
        for card, (_, name) in zip(result.items, matches, strict=True)
    }


async def list_my_listings(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    filters: ListingFilters,
    page: PageRequest,
) -> PageResult[ListingCard]:
    async with database.session() as session:
        repository = ListingRepository(session)
        result = await repository.search_for_owner(actor.subject_id, filters, page)
        thumbs = await repository.primary_thumbs(
            [listing.id for listing in result.items]
        )
    return await _cards_with_thumbs(storage, settings, result, thumbs)


async def list_user_listings(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    owner_user_id: uuid.UUID,
    filters: ListingFilters,
    page: PageRequest,
) -> PageResult[ListingCard]:
    async with database.session() as session:
        if await BlockRepository(session).is_blocked_either_way(
            actor.subject_id, owner_user_id
        ):
            raise ListingNotFoundError
        if owner_user_id != actor.subject_id and not await CircleRepository(
            session
        ).share_approved_circle(actor.subject_id, owner_user_id):
            raise ListingNotFoundError
        visible = (
            ListingStatus.ACTIVE.value,
            ListingStatus.LENT_OUT.value,
            ListingStatus.PAUSED.value,
        )
        scoped = ListingFilters(
            kind=filters.kind,
            category_id=filters.category_id,
            statuses=filters.statuses or visible,
            query=filters.query,
        )
        repository = ListingRepository(session)
        result = await repository.search_for_owner(owner_user_id, scoped, page)
        thumbs = await repository.primary_thumbs(
            [listing.id for listing in result.items]
        )
    return await _cards_with_thumbs(storage, settings, result, thumbs)


async def get_listing(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    listing_id: uuid.UUID,
) -> ListingDetail:
    async with database.session() as session:
        listing = await ListingRepository(session).get(listing_id)
        if listing is None:
            raise ListingNotFoundError
        await _require_visible(session, actor, listing)
        return await _detail_view(session, storage, settings, listing)


async def _require_visible(session, actor: Actor, listing: Listing) -> None:
    if listing.owner_user_id == actor.subject_id:
        return
    if await BlockRepository(session).is_blocked_either_way(
        actor.subject_id, listing.owner_user_id
    ):
        raise ListingNotFoundError
    if not await CircleRepository(session).share_approved_circle(
        actor.subject_id, listing.owner_user_id
    ):
        raise ListingNotFoundError


async def _validate_media(
    session, owner_user_id: uuid.UUID, media_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    deduped = list(dict.fromkeys(media_ids))
    if len(deduped) > MAX_MEDIA:
        raise InvalidListingMediaError
    owned = await MediaRepository(session).owned_ready_ids(
        deduped, owner_user_id, MediaPurpose.LISTING.value
    )
    if set(deduped) != owned:
        raise InvalidListingMediaError
    return deduped


async def create_listing(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    new_listing: NewListing,
) -> ListingDetail:
    actor.require(ProxyScope.MANAGE_LISTINGS)
    async with database.session() as session:
        category = CategoryRepository(session)
        if not await category.exists_for_kind(
            new_listing.category_id, new_listing.kind
        ):
            raise InvalidCategoryError
        target = await category.get(new_listing.category_id)
        lend_mode = new_listing.lend_mode
        if new_listing.kind == ListingKind.SKILL.value or (
            target is not None and target.is_risky
        ):
            lend_mode = RISKY_LEND_MODE
        media_ids = await _validate_media(
            session, actor.subject_id, new_listing.media_ids
        )
        values = {
            "owner_user_id": actor.subject_id,
            "acted_by_user_id": actor.user.id,
            "kind": new_listing.kind,
            "category_id": new_listing.category_id,
            "title": new_listing.title,
            "description": new_listing.description,
            "lang": new_listing.lang,
            "safety_notes": new_listing.safety_notes,
            "lend_mode": lend_mode,
            "max_loan_days": new_listing.max_loan_days,
            "availability_note": new_listing.availability_note,
            "visibility": new_listing.visibility,
        }
        listing = await ListingRepository(session).create(
            values, new_listing.parts[:MAX_PARTS], media_ids
        )
        return await _detail_view(session, storage, settings, listing)


async def _load_owned_for_update(
    session, actor: Actor, listing_id: uuid.UUID
) -> Listing:
    listing = await ListingRepository(session).get_for_update(listing_id)
    if listing is None:
        raise ListingNotFoundError
    if listing.owner_user_id != actor.subject_id:
        await _require_visible(session, actor, listing)
        raise ListingNotFoundError
    actor.require(ProxyScope.MANAGE_LISTINGS)
    return listing


async def update_listing(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    listing_id: uuid.UUID,
    changes: dict,
) -> ListingDetail:
    async with database.session() as session:
        listing = await _load_owned_for_update(session, actor, listing_id)
        if listing.status == ListingStatus.LENT_OUT.value:
            raise ListingLentOutError
        if "lend_mode" in changes:
            target = await CategoryRepository(session).get(listing.category_id)
            if listing.kind == ListingKind.SKILL.value or (
                target is not None and target.is_risky
            ):
                changes = {**changes, "lend_mode": RISKY_LEND_MODE}
        if changes:
            await ListingRepository(session).update(listing, changes)
        return await _detail_view(session, storage, settings, listing)


async def set_listing_status(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    listing_id: uuid.UUID,
    target: str,
) -> ListingDetail:
    async with database.session() as session:
        listing = await _load_owned_for_update(session, actor, listing_id)
        if target == ListingStatus.PAUSED.value:
            if listing.status == ListingStatus.ACTIVE.value:
                await ListingRepository(session).update(
                    listing, {"status": ListingStatus.PAUSED.value}
                )
            elif listing.status != ListingStatus.PAUSED.value:
                raise ListingLentOutError
        elif target == ListingStatus.ACTIVE.value:
            if listing.status == ListingStatus.PAUSED.value:
                await ListingRepository(session).update(
                    listing, {"status": ListingStatus.ACTIVE.value}
                )
            elif listing.status != ListingStatus.ACTIVE.value:
                raise ListingLentOutError
        return await _detail_view(session, storage, settings, listing)


async def delete_listing(
    database: Database, actor: Actor, listing_id: uuid.UUID
) -> None:
    async with database.session() as session:
        listing = await ListingRepository(session).get_for_update(listing_id)
        if listing is None:
            return
        if listing.owner_user_id != actor.subject_id:
            raise ListingNotFoundError
        actor.require(ProxyScope.MANAGE_LISTINGS)
        if listing.status == ListingStatus.LENT_OUT.value:
            raise ListingLentOutError
        await ListingRepository(session).update(
            listing,
            {
                "status": ListingStatus.DELETED.value,
                "deleted_at": datetime.now(UTC),
            },
        )


async def replace_parts(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    listing_id: uuid.UUID,
    parts: list[dict],
) -> ListingDetail:
    async with database.session() as session:
        listing = await _load_owned_for_update(session, actor, listing_id)
        if listing.status == ListingStatus.LENT_OUT.value:
            raise ListingLentOutError
        await ListingRepository(session).replace_parts(listing.id, parts[:MAX_PARTS])
        return await _detail_view(session, storage, settings, listing)


async def replace_media(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    listing_id: uuid.UUID,
    media_ids: list[uuid.UUID],
) -> ListingDetail:
    async with database.session() as session:
        listing = await _load_owned_for_update(session, actor, listing_id)
        if listing.status == ListingStatus.LENT_OUT.value:
            raise ListingLentOutError
        validated = await _validate_media(session, actor.subject_id, media_ids)
        await ListingRepository(session).replace_media(listing.id, validated)
        return await _detail_view(session, storage, settings, listing)
