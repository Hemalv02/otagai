import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Form, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict

from app.database.models.enums import MediaPurpose
from app.routes.dependencies import (
    ActorDep,
    DatabaseDep,
    SettingsDep,
    StorageDep,
)
from app.services.errors import ContentTooLargeError, UnsupportedMediaTypeError
from app.services.media.service import (
    MediaView,
    delete_media,
    read_media,
    upload_media,
)

router = APIRouter(prefix="/media", tags=["media"])

CHUNK_SIZE = 1024 * 1024


class MediaDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    purpose: str
    status: str
    width: int | None
    height: int | None
    duration_ms: int | None
    blurhash: str | None
    urls: dict[str, str]
    created_at: datetime


def media_detail(view: MediaView) -> MediaDetail:
    return MediaDetail(
        id=view.media.id,
        kind=view.media.kind,
        purpose=view.media.purpose,
        status=view.media.status,
        width=view.media.width,
        height=view.media.height,
        duration_ms=view.media.duration_ms,
        blurhash=view.media.blurhash,
        urls=view.urls,
        created_at=view.media.created_at,
    )


async def _read_capped(upload: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(CHUNK_SIZE):
        total += len(chunk)
        if total > limit:
            raise ContentTooLargeError("The upload is larger than allowed.")
        chunks.append(chunk)
    if total == 0:
        raise UnsupportedMediaTypeError("The upload is empty.")
    return b"".join(chunks)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_media(
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
    response: Response,
    file: UploadFile,
    purpose: Annotated[MediaPurpose, Form()],
) -> MediaDetail:
    limit = (
        settings.media_max_audio_bytes
        if purpose is MediaPurpose.VOICE
        else settings.media_max_image_bytes
    )
    content = await _read_capped(file, limit)
    view = await upload_media(
        database, storage, settings, actor, purpose=purpose.value, content=content
    )
    response.headers["Location"] = f"/media/{view.media.id}"
    return media_detail(view)


@router.get("/{media_id}")
async def get_media(
    media_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> MediaDetail:
    view = await read_media(database, storage, settings, actor, media_id)
    return media_detail(view)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_media(
    media_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
) -> None:
    await delete_media(database, storage, actor, media_id)
