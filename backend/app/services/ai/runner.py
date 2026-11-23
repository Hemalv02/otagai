import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from openai import APIError, AsyncOpenAI
from pydantic import BaseModel

from app.database.connection import Database
from app.database.models import User
from app.database.models.enums import (
    AiFeature,
    AiRunStatus,
    MediaKind,
    MediaStatus,
    MediaVariantName,
)
from app.repositories.ai_runs import AiRunRepository
from app.repositories.media import MediaRepository
from app.services.ai.service import AIDraftError
from app.services.errors import NotFoundError, ServiceConfigurationError, ServiceError
from app.services.ratelimit import enforce
from app.services.storage.service import Storage
from app.settings import Settings


@dataclass(frozen=True)
class RateLimit:
    limit: int
    window_seconds: int


RATE_LIMITS = {
    AiFeature.INTRO_CARD: RateLimit(20, 3600),
    AiFeature.PHOTO_LISTING: RateLimit(40, 3600),
    AiFeature.TRANSLATE: RateLimit(120, 3600),
    AiFeature.THANK_YOU: RateLimit(40, 3600),
    AiFeature.EXTENSION_DRAFT: RateLimit(40, 3600),
    AiFeature.TRANSCRIBE: RateLimit(30, 3600),
    AiFeature.TASK_TO_TOOLS: RateLimit(60, 3600),
    AiFeature.POLITE_WRITER: RateLimit(60, 3600),
}


class VoiceNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Voice recording not found.")


class Transcript(BaseModel):
    text: str


async def run_feature[Output: BaseModel](
    database: Database,
    redis,
    settings: Settings,
    user: User,
    *,
    feature: AiFeature,
    input_payload: dict,
    produce: Callable[[], Awaitable[Output]],
) -> Output:
    rate = RATE_LIMITS[feature]
    await enforce(
        redis,
        scope=feature.value,
        user_id=user.id,
        limit=rate.limit,
        window_seconds=rate.window_seconds,
    )
    model = settings.openai_model or "unconfigured"
    start = time.monotonic()
    try:
        output = await produce()
    except ServiceError as error:
        await _log(
            database,
            user,
            feature,
            model,
            input_payload,
            None,
            AiRunStatus.FAILED.value,
            type(error).__name__,
            _latency(start),
        )
        raise
    await _log(
        database,
        user,
        feature,
        model,
        input_payload,
        output.model_dump(mode="json"),
        AiRunStatus.SUCCEEDED.value,
        None,
        _latency(start),
    )
    return output


def _latency(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


async def _log(
    database: Database,
    user: User,
    feature: AiFeature,
    model: str,
    input_payload: dict,
    output: dict | None,
    status: str,
    error: str | None,
    latency_ms: int,
) -> None:
    async with database.session() as session:
        await AiRunRepository(session).create(
            {
                "user_id": user.id,
                "feature": feature.value,
                "model": model,
                "input": input_payload,
                "output": output,
                "status": status,
                "error": error,
                "latency_ms": latency_ms,
            }
        )


async def transcribe_voice(
    database: Database,
    redis,
    storage: Storage,
    settings: Settings,
    user: User,
    media_id: uuid.UUID,
) -> Transcript:
    async def produce() -> Transcript:
        if not settings.openai_api_key:
            raise ServiceConfigurationError("Configure the OpenAI key.")
        async with database.session() as session:
            media = await MediaRepository(session).get(media_id)
            if (
                media is None
                or media.owner_user_id != user.id
                or media.kind != MediaKind.AUDIO.value
                or media.status != MediaStatus.READY.value
            ):
                raise VoiceNotFoundError
            variants = await MediaRepository(session).get_variants(media_id)
        audio_key = next(
            (
                variant.s3_key
                for variant in variants
                if variant.variant == MediaVariantName.AUDIO.value
            ),
            None,
        )
        if audio_key is None:
            raise VoiceNotFoundError
        content = await storage.download(
            audio_key, max_bytes=settings.media_max_audio_bytes
        )
        try:
            async with AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value(),
                timeout=60,
                max_retries=1,
            ) as client:
                result = await client.audio.transcriptions.create(
                    model=settings.openai_transcribe_model,
                    file=("voice.m4a", content, "audio/mp4"),
                )
        except APIError as error:
            raise AIDraftError("The transcription service failed.") from error
        return Transcript(text=result.text)

    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.TRANSCRIBE,
        input_payload={"media_id": str(media_id)},
        produce=produce,
    )
