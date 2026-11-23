import uuid
from typing import Any

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssistantTurn,
    Exchange,
    HandoverCheck,
    HandoverMedia,
    ListingMedia,
    MediaFile,
    MediaVariant,
    MessageAttachment,
    RequestMedia,
    User,
)
from app.database.models.enums import MediaStatus


class MediaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, media_id: uuid.UUID) -> MediaFile | None:
        return await self._session.get(MediaFile, media_id)

    async def get_for_update(self, media_id: uuid.UUID) -> MediaFile | None:
        return await self._session.get(
            MediaFile, media_id, with_for_update=True, populate_existing=True
        )

    async def get_variants(self, media_id: uuid.UUID) -> list[MediaVariant]:
        statement = select(MediaVariant).where(MediaVariant.media_id == media_id)
        return list(await self._session.scalars(statement))

    async def create(
        self, file_values: dict[str, Any], variants: list[dict[str, Any]]
    ) -> MediaFile:
        media = MediaFile(**file_values)
        self._session.add(media)
        await self._session.flush()
        for values in variants:
            self._session.add(MediaVariant(media_id=media.id, **values))
        await self._session.flush()
        await self._session.refresh(media)
        return media

    async def owned_ready(
        self, media_id: uuid.UUID, owner_user_id: uuid.UUID, purpose: str
    ) -> MediaFile | None:
        statement = select(MediaFile).where(
            MediaFile.id == media_id,
            MediaFile.owner_user_id == owner_user_id,
            MediaFile.purpose == purpose,
            MediaFile.status == MediaStatus.READY.value,
        )
        return await self._session.scalar(statement)

    async def owned_ready_ids(
        self, media_ids: list[uuid.UUID], owner_user_id: uuid.UUID, purpose: str
    ) -> set[uuid.UUID]:
        if not media_ids:
            return set()
        statement = select(MediaFile.id).where(
            MediaFile.id.in_(media_ids),
            MediaFile.owner_user_id == owner_user_id,
            MediaFile.purpose == purpose,
            MediaFile.status == MediaStatus.READY.value,
        )
        return set(await self._session.scalars(statement))

    async def is_referenced(self, media_id: uuid.UUID) -> bool:
        checks = (
            select(AssistantTurn.id).where(AssistantTurn.image_media_id == media_id),
            select(HandoverMedia.media_id).where(HandoverMedia.media_id == media_id),
            select(ListingMedia.media_id).where(ListingMedia.media_id == media_id),
            select(RequestMedia.media_id).where(RequestMedia.media_id == media_id),
            select(MessageAttachment.media_id).where(
                MessageAttachment.media_id == media_id
            ),
            select(User.id).where(User.avatar_media_id == media_id),
        )
        statement = select(or_(*(exists(check) for check in checks)))
        return bool(await self._session.scalar(statement))

    async def is_handover_participant(
        self, media_id: uuid.UUID, user_id: uuid.UUID
    ) -> bool:
        matching = (
            select(HandoverMedia.media_id)
            .join(HandoverCheck, HandoverCheck.id == HandoverMedia.check_id)
            .join(Exchange, Exchange.id == HandoverCheck.exchange_id)
            .where(
                HandoverMedia.media_id == media_id,
                or_(
                    Exchange.requester_user_id == user_id,
                    Exchange.helper_user_id == user_id,
                ),
            )
        )
        return bool(await self._session.scalar(select(exists(matching))))

    async def update(self, media: MediaFile, values: dict[str, Any]) -> MediaFile:
        for name, value in values.items():
            setattr(media, name, value)
        await self._session.flush()
        await self._session.refresh(media)
        return media
