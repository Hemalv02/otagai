import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, case, delete, exists, false, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Category,
    CircleMembership,
    Listing,
    ListingMedia,
    ListingPart,
    MediaVariant,
    User,
)
from app.database.models.enums import (
    ListingKind,
    ListingStatus,
    MembershipStatus,
    UserStatus,
)
from app.repositories.pagination import PageRequest, PageResult, paginate


@dataclass(frozen=True)
class ListingFilters:
    kind: str | None = None
    category_id: uuid.UUID | None = None
    circle_id: uuid.UUID | None = None
    statuses: tuple[str, ...] = ()
    query: str | None = None


def _shared_listing_circle(circle_ids: list[uuid.UUID]):
    return exists(
        select(CircleMembership.circle_id).where(
            CircleMembership.user_id == Listing.owner_user_id,
            CircleMembership.status == MembershipStatus.APPROVED.value,
            CircleMembership.circle_id.in_(circle_ids),
        )
    )


def _assistant_visibility(
    circle_ids: list[uuid.UUID], excluded_owners: list[uuid.UUID]
):
    return (
        Listing.status == ListingStatus.ACTIVE.value,
        User.status == UserStatus.ACTIVE.value,
        Listing.owner_user_id.not_in(excluded_owners),
        _shared_listing_circle(circle_ids),
    )


class ListingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, listing_id: uuid.UUID) -> Listing | None:
        listing = await self._session.get(Listing, listing_id)
        if listing is None or listing.status == ListingStatus.DELETED.value:
            return None
        return listing

    async def get_for_update(
        self, listing_id: uuid.UUID, *, no_key_update: bool = False
    ) -> Listing | None:
        listing = await self._session.get(
            Listing,
            listing_id,
            with_for_update={"key_share": True} if no_key_update else True,
            populate_existing=True,
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
        statement = select(Listing).where(_shared_listing_circle(circle_ids))
        if exclude_owner_ids:
            statement = statement.where(Listing.owner_user_id.not_in(exclude_owner_ids))
        statement = self._apply_filters(statement, filters)
        return await paginate(
            self._session, statement, page, Listing.created_at, Listing.id
        )

    async def assistant_matches(
        self,
        *,
        circle_ids: list[uuid.UUID],
        excluded_owners: list[uuid.UUID],
        tool_terms: list[str],
        skill_terms: list[str],
    ) -> list[tuple[Listing, str]]:
        if not circle_ids or not (tool_terms or skill_terms):
            return []

        scores = []
        listing_text = func.concat_ws(" ", Listing.title, Listing.description)
        for kind, terms in (
            (ListingKind.TOOL, tool_terms),
            (ListingKind.SKILL, skill_terms),
        ):
            for term in terms:
                has_kind = Listing.kind == kind.value
                words = list(dict.fromkeys(re.findall(r"[^\W_]+", term)))
                reordered_match = false()
                if 2 <= len(words) <= 5:
                    reordered_match = and_(
                        *(
                            listing_text.icontains(word, autoescape=True)
                            for word in words
                        )
                    )
                category_match = or_(
                    func.replace(Category.slug, "_", " ").icontains(
                        term, autoescape=True
                    ),
                    *(
                        Category.names[lang].astext.icontains(term, autoescape=True)
                        for lang in ("en", "ja", "bn")
                    ),
                )
                scores.append(
                    case(
                        (
                            and_(
                                has_kind, Listing.title.icontains(term, autoescape=True)
                            ),
                            6,
                        ),
                        (
                            and_(
                                has_kind,
                                Listing.description.icontains(term, autoescape=True),
                            ),
                            3,
                        ),
                        (and_(has_kind, reordered_match), 2),
                        (and_(has_kind, category_match), 1),
                        else_=0,
                    )
                )
        score = func.greatest(*scores)
        ranked = (
            select(
                Listing.id,
                func.row_number()
                .over(
                    partition_by=Listing.kind,
                    order_by=(
                        score.desc(),
                        Listing.created_at.desc(),
                        Listing.id.desc(),
                    ),
                )
                .label("rank"),
            )
            .join(Category, Category.id == Listing.category_id)
            .join(User, User.id == Listing.owner_user_id)
            .where(
                *_assistant_visibility(circle_ids, excluded_owners),
                score > 0,
            )
            .subquery()
        )
        rows = await self._session.execute(
            select(Listing, User.display_name)
            .join(ranked, ranked.c.id == Listing.id)
            .join(User, User.id == Listing.owner_user_id)
            .where(ranked.c.rank <= 6)
            .order_by(ranked.c.rank, Listing.kind)
        )
        return [(listing, name) for listing, name in rows]

    async def assistant_matches_by_id(
        self,
        listing_ids: list[uuid.UUID],
        circle_ids: list[uuid.UUID],
        excluded_owners: list[uuid.UUID],
    ) -> list[tuple[Listing, str]]:
        if not listing_ids or not circle_ids:
            return []
        rows = await self._session.execute(
            select(Listing, User.display_name)
            .join(User, User.id == Listing.owner_user_id)
            .where(
                Listing.id.in_(listing_ids),
                *_assistant_visibility(circle_ids, excluded_owners),
            )
        )
        return [(listing, name) for listing, name in rows]

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
