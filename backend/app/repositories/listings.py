import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    CircleMembership,
    Listing,
    ListingMedia,
    ListingPart,
    MediaVariant,
)
from app.database.models.enums import ListingStatus, MembershipStatus
from app.repositories.pagination import PageRequest, PageResult, paginate


@dataclass(frozen=True)
class ListingFilters:
    kind: str | None = None
    category_id: uuid.UUID | None = None
    circle_id: uuid.UUID | None = None
    statuses: tuple[str, ...] = ()
    query: str | None = None


class ListingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, listing_id: uuid.UUID) -> Listing | None:
        listing = await self._session.get(Listing, listing_id)
        if listing is None or listing.status == ListingStatus.DELETED.value:
            return None
        return listing

    async def get_for_update(self, listing_id: uuid.UUID) -> Listing | None:
        listing = await self._session.get(
            Listing, listing_id, with_for_update=True, populate_existing=True
        )
        if listing is None or listing.status == ListingStatus.DELETED.value:
            return None
        return listing

    def _apply_filters(self, statement: Any, filters: ListingFilters) -> Any:
        if filters.kind:
            statement = statement.where(Listing.kind == filters.kind)
        if filters.category_id:
            statement = statement.where(Listing.category_id == filters.category_id)
        if filters.statuses:
            statement = statement.where(Listing.status.in_(filters.statuses))
        else:
            statement = statement.where(Listing.status != ListingStatus.DELETED.value)
        if filters.query:
            like = f"%{filters.query}%"
            statement = statement.where(Listing.title.ilike(like))
        return statement

    async def search(
        self,
        *,
        viewer_circle_ids: list[uuid.UUID],
        exclude_owner_ids: list[uuid.UUID],
        filters: ListingFilters,
        page: PageRequest,
    ) -> PageResult[Listing]:
        circle_ids = [filters.circle_id] if filters.circle_id else viewer_circle_ids
        if not circle_ids:
            return PageResult(items=[], next_cursor=None)
        shares_circle = exists(
            select(CircleMembership.circle_id).where(
                CircleMembership.user_id == Listing.owner_user_id,
                CircleMembership.status == MembershipStatus.APPROVED.value,
                CircleMembership.circle_id.in_(circle_ids),
            )
        )
        statement = select(Listing).where(shares_circle)
        if exclude_owner_ids:
            statement = statement.where(Listing.owner_user_id.not_in(exclude_owner_ids))
        statement = self._apply_filters(statement, filters)
        return await paginate(
            self._session, statement, page, Listing.created_at, Listing.id
        )

    async def search_for_owner(
        self, owner_user_id: uuid.UUID, filters: ListingFilters, page: PageRequest
    ) -> PageResult[Listing]:
        statement = select(Listing).where(Listing.owner_user_id == owner_user_id)
        statement = self._apply_filters(statement, filters)
        return await paginate(
            self._session, statement, page, Listing.created_at, Listing.id
        )

    async def create(
        self,
        values: dict[str, Any],
        parts: list[dict[str, Any]],
        media: list[dict[str, Any]],
    ) -> Listing:
        listing = Listing(**values)
        self._session.add(listing)
        await self._session.flush()
        self._add_parts(listing.id, parts)
        self._add_media(listing.id, media)
        await self._session.flush()
        await self._session.refresh(listing)
        return listing

    async def update(self, listing: Listing, values: dict[str, Any]) -> Listing:
        for name, value in values.items():
            setattr(listing, name, value)
        await self._session.flush()
        await self._session.refresh(listing)
        return listing

    def _add_parts(self, listing_id: uuid.UUID, parts: list[dict[str, Any]]) -> None:
        for index, part in enumerate(parts):
            self._session.add(
                ListingPart(
                    listing_id=listing_id,
                    label=part["label"],
                    quantity=part["quantity"],
                    sort_order=index,
                )
            )

    def _add_media(self, listing_id: uuid.UUID, media: list[dict[str, Any]]) -> None:
        for index, media_id in enumerate(media):
            self._session.add(
                ListingMedia(listing_id=listing_id, media_id=media_id, sort_order=index)
            )

    async def replace_parts(
        self, listing_id: uuid.UUID, parts: list[dict[str, Any]]
    ) -> None:
        await self._session.execute(
            delete(ListingPart).where(ListingPart.listing_id == listing_id)
        )
        self._add_parts(listing_id, parts)
        await self._session.flush()

    async def replace_media(
        self, listing_id: uuid.UUID, media_ids: list[uuid.UUID]
    ) -> None:
        await self._session.execute(
            delete(ListingMedia).where(ListingMedia.listing_id == listing_id)
        )
        self._add_media(listing_id, media_ids)
        await self._session.flush()

    async def count_active_for_owners(
        self, owner_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        if not owner_ids:
            return {}
        statement = (
            select(Listing.owner_user_id, func.count())
            .where(
                Listing.owner_user_id.in_(owner_ids),
                Listing.status.in_(
                    (ListingStatus.ACTIVE.value, ListingStatus.LENT_OUT.value)
                ),
            )
            .group_by(Listing.owner_user_id)
        )
        return {row[0]: row[1] for row in await self._session.execute(statement)}

    async def pause_active_for_owner(self, owner_user_id: uuid.UUID) -> None:
        await self._session.execute(
            update(Listing)
            .where(
                Listing.owner_user_id == owner_user_id,
                Listing.status == ListingStatus.ACTIVE.value,
            )
            .values(status=ListingStatus.PAUSED.value)
        )

    async def parts_for(self, listing_id: uuid.UUID) -> list[ListingPart]:
        statement = (
            select(ListingPart)
            .where(ListingPart.listing_id == listing_id)
            .order_by(ListingPart.sort_order, ListingPart.id)
        )
        return list(await self._session.scalars(statement))

    async def media_rows(
        self, listing_id: uuid.UUID
    ) -> list[tuple[uuid.UUID, str, str]]:
        statement = (
            select(ListingMedia.media_id, MediaVariant.variant, MediaVariant.s3_key)
            .join(MediaVariant, MediaVariant.media_id == ListingMedia.media_id)
            .where(ListingMedia.listing_id == listing_id)
            .order_by(ListingMedia.sort_order, ListingMedia.media_id)
        )
        return [tuple(row) for row in await self._session.execute(statement)]

    async def primary_thumbs(
        self, listing_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        if not listing_ids:
            return {}
        statement = (
            select(ListingMedia.listing_id, MediaVariant.s3_key)
            .join(
                MediaVariant,
                (MediaVariant.media_id == ListingMedia.media_id)
                & (MediaVariant.variant == "thumb"),
            )
            .where(ListingMedia.listing_id.in_(listing_ids))
            .order_by(ListingMedia.listing_id, ListingMedia.sort_order)
            .distinct(ListingMedia.listing_id)
        )
        return {row[0]: row[1] for row in await self._session.execute(statement)}
