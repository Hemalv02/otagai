import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.database.models.enums import (
    Language,
    LendMode,
    ListingKind,
    ListingStatus,
    ListingVisibility,
)
from app.repositories.listings import ListingFilters
from app.routes.dependencies import ActorDep, DatabaseDep, SettingsDep, StorageDep
from app.routes.pagination import Page, PageQuery
from app.services.listings.service import (
    ListingCard,
    ListingDetail,
    NewListing,
    browse_listings,
    create_listing,
    delete_listing,
    get_listing,
    list_my_listings,
    replace_media,
    replace_parts,
    set_listing_status,
    update_listing,
)

router = APIRouter(prefix="/listings", tags=["listings"])
me_router = APIRouter(prefix="/users/me/listings", tags=["listings"])

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
Description = Annotated[str, StringConstraints(max_length=2000)]
SafetyNotes = Annotated[str, StringConstraints(max_length=2000)]
PartLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
SearchText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


def _parse_statuses(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    values = [part.strip() for part in raw.split(",") if part.strip()]
    allowed = {status.value for status in ListingStatus}
    for value in values:
        if value not in allowed:
            raise ValueError("Unknown listing status.")
    return tuple(dict.fromkeys(values))


class ListingQuery(PageQuery):
    q: SearchText | None = None
    kind: ListingKind | None = None
    category_id: uuid.UUID | None = None
    circle_id: uuid.UUID | None = None
    status: str | None = Field(default=None, max_length=120)
    exclude_own: bool = False

    @field_validator("status")
    @classmethod
    def validate_status(cls, raw: str | None) -> str | None:
        _parse_statuses(raw)
        return raw

    def filters(self) -> ListingFilters:
        return ListingFilters(
            kind=self.kind.value if self.kind else None,
            category_id=self.category_id,
            circle_id=self.circle_id,
            statuses=_parse_statuses(self.status),
            query=self.q,
        )


class MyListingQuery(PageQuery):
    kind: ListingKind | None = None
    status: str | None = Field(default=None, max_length=120)

    @field_validator("status")
    @classmethod
    def validate_status(cls, raw: str | None) -> str | None:
        _parse_statuses(raw)
        return raw

    def filters(self) -> ListingFilters:
        return ListingFilters(
            kind=self.kind.value if self.kind else None,
            statuses=_parse_statuses(self.status),
        )


class PartInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: PartLabel
    quantity: int = Field(default=1, ge=1, le=999)


class CreateListingBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ListingKind
    category_id: uuid.UUID
    title: Title
    description: Description | None = None
    lang: Language
    safety_notes: SafetyNotes | None = None
    lend_mode: LendMode = LendMode.LEND
    max_loan_days: int | None = Field(default=None, ge=1, le=60)
    availability_note: Description | None = None
    visibility: ListingVisibility = ListingVisibility.ASSOCIATION
    media_ids: list[uuid.UUID] = Field(default_factory=list, max_length=8)
    parts: list[PartInput] = Field(default_factory=list, max_length=30)


class UpdateListingBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    description: Description | None = None
    safety_notes: SafetyNotes | None = None
    lend_mode: LendMode | None = None
    max_loan_days: int | None = Field(default=None, ge=1, le=60)
    availability_note: Description | None = None
    visibility: ListingVisibility | None = None


class PartsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parts: list[PartInput] = Field(default_factory=list, max_length=30)


class MediaBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_ids: list[uuid.UUID] = Field(default_factory=list, max_length=8)


class OwnerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class PhotoModel(BaseModel):
    media_id: uuid.UUID
    thumb_url: str | None
    display_url: str | None


class PartModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    quantity: int


class ListingSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_user_id: uuid.UUID
    kind: str
    category_id: uuid.UUID
    title: str
    lend_mode: str
    status: str
    visibility: str
    available_again_at: datetime | None
    photo_url: str | None
    created_at: datetime


class ListingDetailModel(BaseModel):
    id: uuid.UUID
    owner: OwnerSummary | None
    kind: str
    category_id: uuid.UUID
    title: str
    description: str | None
    lang: str
    translations: dict[str, Any]
    safety_notes: str | None
    lend_mode: str
    max_loan_days: int | None
    availability_note: str | None
    visibility: str
    status: str
    available_again_at: datetime | None
    parts: list[PartModel]
    photos: list[PhotoModel]
    created_at: datetime


def listing_summary(card: ListingCard) -> ListingSummary:
    return ListingSummary(
        **{
            name: getattr(card.listing, name)
            for name in (
                "id",
                "owner_user_id",
                "kind",
                "category_id",
                "title",
                "lend_mode",
                "status",
                "visibility",
                "available_again_at",
                "created_at",
            )
        },
        photo_url=card.photo_url,
    )


def listing_detail(view: ListingDetail) -> ListingDetailModel:
    listing = view.listing
    return ListingDetailModel(
        id=listing.id,
        owner=OwnerSummary.model_validate(view.owner) if view.owner else None,
        kind=listing.kind,
        category_id=listing.category_id,
        title=listing.title,
        description=listing.description,
        lang=listing.lang,
        translations=listing.translations,
        safety_notes=listing.safety_notes,
        lend_mode=listing.lend_mode,
        max_loan_days=listing.max_loan_days,
        availability_note=listing.availability_note,
        visibility=listing.visibility,
        status=listing.status,
        available_again_at=listing.available_again_at,
        parts=[PartModel.model_validate(part) for part in view.parts],
        photos=[
            PhotoModel(
                media_id=photo.media_id,
                thumb_url=photo.thumb_url,
                display_url=photo.display_url,
            )
            for photo in view.photos
        ],
        created_at=listing.created_at,
    )


@router.get("")
async def browse(
    query: Annotated[ListingQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> Page[ListingSummary]:
    result = await browse_listings(
        database,
        storage,
        settings,
        actor,
        query.filters(),
        query.page(),
        exclude_own=query.exclude_own,
    )
    return Page[ListingSummary](
        items=[listing_summary(card) for card in result.items],
        next_cursor=result.next_cursor,
    )


@router.get("/{listing_id}")
async def read_listing(
    listing_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> ListingDetailModel:
    return listing_detail(
        await get_listing(database, storage, settings, actor, listing_id)
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: CreateListingBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
    response: Response,
) -> ListingDetailModel:
    view = await create_listing(
        database,
        storage,
        settings,
        actor,
        NewListing(
            kind=body.kind.value,
            category_id=body.category_id,
            title=body.title,
            description=body.description,
            lang=body.lang.value,
            safety_notes=body.safety_notes,
            lend_mode=body.lend_mode.value,
            max_loan_days=body.max_loan_days,
            availability_note=body.availability_note,
            visibility=body.visibility.value,
            media_ids=body.media_ids,
            parts=[part.model_dump() for part in body.parts],
        ),
    )
    response.headers["Location"] = f"/listings/{view.listing.id}"
    return listing_detail(view)


@router.patch("/{listing_id}")
async def edit(
    listing_id: uuid.UUID,
    body: UpdateListingBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> ListingDetailModel:
    changes = body.model_dump(exclude_unset=True)
    normalized = {
        name: (value.value if hasattr(value, "value") else value)
        for name, value in changes.items()
    }
    return listing_detail(
        await update_listing(database, storage, settings, actor, listing_id, normalized)
    )


@router.post("/{listing_id}/pause")
async def pause(
    listing_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> ListingDetailModel:
    return listing_detail(
        await set_listing_status(
            database, storage, settings, actor, listing_id, ListingStatus.PAUSED.value
        )
    )


@router.post("/{listing_id}/resume")
async def resume(
    listing_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> ListingDetailModel:
    return listing_detail(
        await set_listing_status(
            database, storage, settings, actor, listing_id, ListingStatus.ACTIVE.value
        )
    )


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(listing_id: uuid.UUID, actor: ActorDep, database: DatabaseDep) -> None:
    await delete_listing(database, actor, listing_id)


@router.put("/{listing_id}/parts")
async def put_parts(
    listing_id: uuid.UUID,
    body: PartsBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> ListingDetailModel:
    return listing_detail(
        await replace_parts(
            database,
            storage,
            settings,
            actor,
            listing_id,
            [part.model_dump() for part in body.parts],
        )
    )


@router.put("/{listing_id}/media")
async def put_media(
    listing_id: uuid.UUID,
    body: MediaBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> ListingDetailModel:
    return listing_detail(
        await replace_media(
            database, storage, settings, actor, listing_id, body.media_ids
        )
    )


@me_router.get("")
async def my_listings(
    query: Annotated[MyListingQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> Page[ListingSummary]:
    result = await list_my_listings(
        database, storage, settings, actor, query.filters(), query.page()
    )
    return Page[ListingSummary](
        items=[listing_summary(card) for card in result.items],
        next_cursor=result.next_cursor,
    )
