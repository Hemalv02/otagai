import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from openai import APIError, AsyncOpenAI
from pydantic import BaseModel

from app.database.connection import Database
from app.database.models import User
from app.database.models.enums import (
    AiFeature,
    AiRunStatus,
    MediaKind,
    MediaPurpose,
    MediaStatus,
    MediaVariantName,
)
from app.repositories.ai_runs import AiRunRepository
from app.repositories.categories import CategoryRepository
from app.repositories.media import MediaRepository
from app.services.ai import helpers
from app.services.ai.helpers import ListingDraft, ListingDraftInput, ListingDraftPart
from app.services.ai.sanitize import clean_text
from app.services.ai.service import (
    OPENAI_MAX_RETRIES,
    AIDraftError,
    UsageMeter,
    metered,
)
from app.services.errors import NotFoundError, ServiceConfigurationError, ServiceError
from app.services.media.service import MediaNotFoundError, ready_image_data_url
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
    AiFeature.HANDOVER_CHECKLIST: RateLimit(20, 3600),
    AiFeature.TOOL_GUIDE: RateLimit(40, 3600),
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
    model: str | None = None,
) -> Output:
    rate = RATE_LIMITS[feature]
    await enforce(
        redis,
        scope=feature.value,
        user_id=user.id,
        limit=rate.limit,
        window_seconds=rate.window_seconds,
    )
    model = model or settings.openai_model or "unconfigured"
    start = time.monotonic()
    with metered() as usage:
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
                usage,
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
        usage,
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
    usage: UsageMeter,
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
                "input_tokens": usage.input_tokens or None,
                "output_tokens": usage.output_tokens or None,
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
                max_retries=OPENAI_MAX_RETRIES,
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
        model=settings.openai_transcribe_model,
    )


class ListingPhotoNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Listing photo not found.")


async def suggest_listing(
    database: Database,
    redis,
    storage: Storage | None,
    settings: Settings,
    user: User,
    body: ListingDraftInput,
) -> ListingDraft:
    async def produce() -> ListingDraft:
        image_url = None
        if body.image_media_id is not None:
            if storage is None:
                raise ServiceConfigurationError("Configure media storage.")
            try:
                image_url = await ready_image_data_url(
                    database,
                    storage,
                    settings,
                    user.id,
                    body.image_media_id,
                    MediaPurpose.LISTING.value,
                )
            except MediaNotFoundError:
                raise ListingPhotoNotFoundError from None
        async with database.session() as session:
            categories = await CategoryRepository(session).list_all("tool")
        live = {category.slug: category for category in categories}
        suggestion = await helpers.draft_listing(
            settings,
            body,
            image_url=image_url,
            categories=[
                (category.slug, category.names.get("en") or category.slug)
                for category in categories
            ],
        )
        return _checked_draft(suggestion, live)

    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.PHOTO_LISTING,
        input_payload={
            "description": body.description,
            "language": body.language,
            "image_media_id": str(body.image_media_id) if body.image_media_id else None,
        },
        produce=produce,
    )


def _checked_draft(suggestion: helpers.ListingSuggestion, live: dict) -> ListingDraft:
    title = clean_text(suggestion.title, 120)
    recognized = suggestion.recognized and bool(title)
    category = live.get(suggestion.category_slug or "") if recognized else None
    risky = bool(category and category.is_risky)
    lend_mode = "help_only" if risky else suggestion.suggested_lend_mode
    part_items = _checked_parts(suggestion.parts) if recognized else []
    unsure = dict.fromkeys(suggestion.unsure_fields)
    if any(part.quantity is None for part in part_items):
        unsure["parts"] = None
    return ListingDraft(
        recognized=recognized,
        title=title if recognized else "",
        category_hint=clean_text(suggestion.category_hint, 120) if recognized else "",
        category_id=category.id if category else None,
        category_is_risky=risky,
        parts=[part.label for part in part_items],
        part_items=part_items,
        safety_notes=(
            clean_text(suggestion.safety_notes, 2000, multiline=True) or None
            if recognized
            else None
        ),
        suggested_lend_mode=lend_mode,
        brand=clean_text(suggestion.brand, 80) or None if recognized else None,
        model=clean_text(suggestion.model, 80) or None if recognized else None,
        condition=clean_text(suggestion.condition, 200) or None if recognized else None,
        details=(
            clean_text(suggestion.details, 1000, multiline=True) or None
            if recognized
            else None
        ),
        unsure_fields=list(unsure) if recognized else [],
    )


def _checked_parts(parts: list[ListingDraftPart]) -> list[ListingDraftPart]:
    cleaned: dict[str, ListingDraftPart] = {}
    for part in parts:
        label = clean_text(part.label, 120)
        if not label:
            continue
        key = label.casefold()
        existing = cleaned.get(key)
        if existing is not None:
            if existing.quantity != part.quantity:
                cleaned[key] = ListingDraftPart(label=existing.label, quantity=None)
        elif len(cleaned) < 30:
            cleaned[key] = ListingDraftPart(label=label, quantity=part.quantity)
    return list(cleaned.values())


async def purge_old_runs(
    database: Database, settings: Settings, *, now: datetime | None = None
) -> int:
    cutoff = (now or datetime.now(UTC)) - timedelta(days=settings.ai_run_retention_days)
    async with database.session() as session:
        return await AiRunRepository(session).delete_created_before(cutoff)
