import uuid

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.database.models.enums import AiFeature
from app.routes.dependencies import (
    ActorDep,
    AuthClaimsDep,
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
from app.services.ai.request_writer import RequestWording, WordingInput
from app.services.ai.runner import (
    Transcript,
    enforce_feature_limit,
    run_feature,
    suggest_listing,
    transcribe_voice,
)
from app.services.requests.destinations import draft_for_destination
from app.services.users.service import ProfileNotFoundError, get_active_profile

router = APIRouter(prefix="/ai", tags=["ai"])


class TranscriptionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_id: uuid.UUID


@router.post("/intro-cards")
async def intro_cards(
    body: IntroCardInput,
    claims: AuthClaimsDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> IntroCard:
    try:
        user = await get_active_profile(database, claims.auth_user_id)
    except ProfileNotFoundError:
        await enforce_feature_limit(redis, AiFeature.INTRO_CARD, claims.auth_user_id)
        return await draft_intro_card(settings, body)

    return await run_feature(
        database,
        redis,
        settings,
        user,
        feature=AiFeature.INTRO_CARD,
        input_payload=body.model_dump(),
        produce=lambda: draft_intro_card(settings, body),
        rate_limit_user_id=claims.auth_user_id,
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


class DestinationDraftBody(WordingInput):
    home_circle_id: uuid.UUID


@router.post("/request-drafts")
async def request_drafts(
    body: DestinationDraftBody,
    actor: ActorDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> RequestWording:
    return await draft_for_destination(
        database,
        redis,
        settings,
        actor,
        body.home_circle_id,
        body,
    )


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
