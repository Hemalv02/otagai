import uuid

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.database.models.enums import AiFeature
from app.routes.dependencies import (
    CurrentUserDep,
    DatabaseDep,
    OptionalStorageDep,
    RedisDep,
    SettingsDep,
    StorageDep,
)
from app.services.ai.helpers import (
    ExtensionDraft,
    ExtensionDraftInput,
    IntroCard,
    IntroCardInput,
    ListingDraft,
    ListingDraftInput,
    ThankYouDraft,
    ThankYouDraftInput,
    ToolGuide,
    ToolGuideInput,
    Translation,
    TranslationInput,
    draft_extension,
    draft_intro_card,
    draft_thank_you,
    draft_tool_guide,
    draft_translation,
)
from app.services.ai.runner import (
    Transcript,
    run_feature,
    suggest_listing,
    transcribe_voice,
)

router = APIRouter(prefix="/ai", tags=["ai"])


class TranscriptionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_id: uuid.UUID


@router.post("/intro-cards")
async def intro_cards(
    body: IntroCardInput,
    user: CurrentUserDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> IntroCard:
    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.INTRO_CARD,
        input_payload=body.model_dump(),
        produce=lambda: draft_intro_card(settings, body),
    )


@router.post("/listing-drafts")
async def listing_drafts(
    body: ListingDraftInput,
    user: CurrentUserDep,
    database: DatabaseDep,
    settings: SettingsDep,
    storage: OptionalStorageDep,
    redis: RedisDep,
) -> ListingDraft:
    return await suggest_listing(database, redis, storage, settings, user, body)


@router.post("/translations")
async def translations(
    body: TranslationInput,
    user: CurrentUserDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> Translation:
    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.TRANSLATE,
        input_payload=body.model_dump(),
        produce=lambda: draft_translation(settings, body),
    )


@router.post("/thank-you-drafts")
async def thank_you_drafts(
    body: ThankYouDraftInput,
    user: CurrentUserDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> ThankYouDraft:
    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.THANK_YOU,
        input_payload=body.model_dump(),
        produce=lambda: draft_thank_you(settings, body),
    )


@router.post("/extension-drafts")
async def extension_drafts(
    body: ExtensionDraftInput,
    user: CurrentUserDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> ExtensionDraft:
    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.EXTENSION_DRAFT,
        input_payload=body.model_dump(),
        produce=lambda: draft_extension(settings, body),
    )


@router.post("/tool-guides")
async def tool_guides(
    body: ToolGuideInput,
    user: CurrentUserDep,
    settings: SettingsDep,
    database: DatabaseDep,
    redis: RedisDep,
) -> ToolGuide:
    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.TOOL_GUIDE,
        input_payload=body.model_dump(mode="json"),
        produce=lambda: draft_tool_guide(settings, body),
    )


@router.post("/transcriptions")
async def transcriptions(
    body: TranscriptionBody,
    user: CurrentUserDep,
    database: DatabaseDep,
    settings: SettingsDep,
    storage: StorageDep,
    redis: RedisDep,
) -> Transcript:
    return await transcribe_voice(
        database, redis, storage, settings, user, body.media_id
    )
