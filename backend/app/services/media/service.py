import asyncio
import base64
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.database.connection import Database
from app.database.models import MediaFile, MediaVariant
from app.database.models.enums import (
    MediaKind,
    MediaPurpose,
    MediaStatus,
    MediaVariantName,
    StoredMimeType,
)
from app.repositories.blocks import BlockRepository
from app.repositories.circles import CircleRepository
from app.repositories.media import MediaRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import (
    ConflictError,
    NotFoundError,
    UnsupportedMediaTypeError,
    UpstreamUnavailableError,
)
from app.services.media.processing import ImageDecodeError, process_image
from app.services.storage.service import Storage
from app.settings import Settings

AUDIO_PURPOSES = frozenset({MediaPurpose.VOICE.value})
UNATTACHED_TTL = timedelta(days=2)


class MediaNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Media not found.")


class MediaInUseError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This upload is in use and can't be deleted.")


class UnsupportedMediaError(UnsupportedMediaTypeError):
    def __init__(self, message: str = "This file type isn't supported.") -> None:
        super().__init__(message)


@dataclass(frozen=True)
class MediaView:
    media: MediaFile
    urls: dict[str, str]


def _is_mp4_audio(content: bytes) -> bool:
    return len(content) >= 12 and content[4:8] == b"ftyp"


async def upload_media(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    *,
    purpose: str,
    content: bytes,
) -> MediaView:
    media_id = uuid.uuid4()
    if purpose in AUDIO_PURPOSES:
        if not _is_mp4_audio(content):
            raise UnsupportedMediaError("Upload an m4a or mp4 voice recording.")
        key = f"media/{media_id}/{MediaVariantName.AUDIO.value}.m4a"
        await storage.upload(key, content, StoredMimeType.MP4_AUDIO.value)
        file_values = {
            "id": media_id,
            "owner_user_id": actor.subject_id,
            "uploaded_by_user_id": actor.user.id,
            "kind": MediaKind.AUDIO.value,
            "purpose": purpose,
            "status": MediaStatus.READY.value,
            "byte_size": len(content),
        }
        variants = [
            {
                "variant": MediaVariantName.AUDIO.value,
                "s3_key": key,
                "mime_type": StoredMimeType.MP4_AUDIO.value,
                "byte_size": len(content),
            }
        ]
    else:
        try:
            processed = await asyncio.to_thread(process_image, content)
        except ImageDecodeError as error:
            raise UnsupportedMediaError(str(error)) from error
        variants = []
        for variant in processed.variants:
            key = f"media/{media_id}/{variant.variant}.webp"
            await storage.upload(key, variant.content, variant.mime_type)
            variants.append(
                {
                    "variant": variant.variant,
                    "s3_key": key,
                    "mime_type": variant.mime_type,
                    "width": variant.width,
                    "height": variant.height,
                    "byte_size": variant.byte_size,
                }
            )
        file_values = {
            "id": media_id,
            "owner_user_id": actor.subject_id,
            "uploaded_by_user_id": actor.user.id,
            "kind": MediaKind.IMAGE.value,
            "purpose": purpose,
            "status": MediaStatus.READY.value,
            "byte_size": len(content),
            "width": processed.width,
            "height": processed.height,
            "sha256": processed.sha256,
        }
    file_values["delete_after"] = datetime.now(UTC) + UNATTACHED_TTL
    async with database.session() as session:
        media = await MediaRepository(session).create(file_values, variants)
    urls = await asyncio.gather(
        *(
            storage.presigned_get_url(
                values["s3_key"], expires_in=settings.media_signed_url_ttl_seconds
            )
            for values in variants
        )
    )
    return MediaView(
        media=media,
        urls={
            values["variant"]: url for values, url in zip(variants, urls, strict=True)
        },
    )


async def _can_view_request_photo(session, actor: Actor, media: MediaFile) -> bool:
    if actor.grant is not None and not actor.grant.can_view_activity:
        return False
    owner = media.owner_user_id
    if actor.subject_id == owner:
        return not actor.is_proxy or not await BlockRepository(
            session
        ).is_blocked_either_way(actor.user.id, owner)
    return await MediaRepository(session).delivered_request_attachment(
        media.id, owner, actor.subject_id, actor.user.id
    )


async def _can_view(session, actor: Actor, media: MediaFile) -> bool:
    if media.purpose == MediaPurpose.REQUEST.value:
        return await _can_view_request_photo(session, actor, media)
    viewer_id = actor.subject_id
    if viewer_id in (media.owner_user_id, media.uploaded_by_user_id):
        return True
    if media.purpose == MediaPurpose.ASK.value:
        return False
    if media.purpose == MediaPurpose.HANDOVER.value:
        return await MediaRepository(session).is_handover_participant(
            media.id, viewer_id
        )
    if await BlockRepository(session).is_blocked_either_way(
        viewer_id, media.owner_user_id
    ):
        return False
    return await CircleRepository(session).share_approved_circle(
        viewer_id, media.owner_user_id
    )


async def read_media(
    database: Database, storage: Storage, settings: Settings, actor: Actor, media_id
) -> MediaView:
    async with database.session() as session:
        repository = MediaRepository(session)
        media = await repository.get(media_id)
        if media is None or media.status == MediaStatus.DELETED.value:
            raise MediaNotFoundError
        if not await _can_view(session, actor, media):
            raise MediaNotFoundError
        if media.purpose == MediaPurpose.HANDOVER.value:
            actor.require(ProxyScope.VIEW_ACTIVITY)
        variants = await repository.get_variants(media_id)
    urls = await _sign_variants(storage, settings, variants)
    return MediaView(media=media, urls=urls)


async def _sign_variants(
    storage: Storage, settings: Settings, variants: list[MediaVariant]
) -> dict[str, str]:
    ttl = settings.media_signed_url_ttl_seconds
    signed = await asyncio.gather(
        *(storage.presigned_get_url(v.s3_key, expires_in=ttl) for v in variants)
    )
    return {variant.variant: url for variant, url in zip(variants, signed, strict=True)}


async def delete_media(
    database: Database, storage: Storage, actor: Actor, media_id
) -> None:
    async with database.session() as session:
        repository = MediaRepository(session)
        media = await repository.get_for_update(media_id)
        if media is None or media.status == MediaStatus.DELETED.value:
            return
        if media.owner_user_id != actor.subject_id:
            raise MediaNotFoundError
        if await repository.is_referenced(media_id):
            raise MediaInUseError
        keys = [variant.s3_key for variant in await repository.get_variants(media_id)]
        await repository.update(
            media,
            {"status": MediaStatus.DELETED.value, "deleted_at": datetime.now(UTC)},
        )
    for key in keys:
        await storage.delete(key)


async def ready_image_data_url(
    database: Database,
    storage: Storage,
    settings: Settings,
    owner_user_id: uuid.UUID,
    media_id: uuid.UUID,
    purpose: str,
) -> str:
    async with database.session() as session:
        repository = MediaRepository(session)
        media = await repository.owned_ready(media_id, owner_user_id, purpose)
        if media is None or media.kind != MediaKind.IMAGE:
            raise MediaNotFoundError
        variants = await repository.get_variants(media_id)
        display = next(
            (item for item in variants if item.variant == MediaVariantName.DISPLAY),
            None,
        )
        if display is None:
            raise MediaNotFoundError
    image = await storage.download(
        display.s3_key, max_bytes=settings.media_max_image_bytes
    )
    if not image:
        raise UpstreamUnavailableError(
            "The uploaded photo could not be read. Try again."
        )
    encoded = base64.b64encode(image).decode("ascii")
    return f"data:{display.mime_type};base64,{encoded}"
