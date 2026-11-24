import uuid
from dataclasses import dataclass

from app.database.connection import Database
from app.database.models import AskSession, User
from app.database.models.enums import (
    AiFeature,
    AskInputMode,
    AskStatus,
    MediaPurpose,
)
from app.repositories.ask_sessions import AskSessionRepository
from app.repositories.listings import ListingFilters
from app.repositories.media import MediaRepository
from app.repositories.pagination import PageRequest
from app.repositories.users import UserRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.ai.helpers import (
    IdentifyInput,
    identify_task,
)
from app.services.ai.request_writer import (
    MAX_DRAFT_CLARIFICATION,
    MAX_DRAFT_TEXT,
    RequestDraft,
    RequestDraftInput,
    write_request,
)
from app.services.ai.runner import run_feature, transcribe_voice
from app.services.culture_packs import culture_pack_for
from app.services.errors import BadRequestError, NotFoundError
from app.services.listings.service import ListingCard, browse_listings
from app.services.storage.service import Storage
from app.settings import Settings

RELATIONSHIP_BY_AUDIENCE = {
    "person": "neighbor",
    "han": "circle_member",
    "ripple": "neighbor",
}


class AskSessionNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Ask session not found.")


@dataclass(frozen=True)
class AskResult:
    session: AskSession
    matches: list[ListingCard]
    neighbours: list[User]


async def create_ask_session(
    database: Database,
    redis,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    *,
    input_mode: str,
    input_text: str | None,
    media_id: uuid.UUID | None,
) -> AskSession:
    actor.require(ProxyScope.POST_REQUESTS)
    user = actor.user
    language = actor.subject.preferred_language
    transcript = None
    text = input_text
    if input_mode == AskInputMode.VOICE.value:
        if media_id is None:
            raise BadRequestError("Attach a voice recording.")
        transcript = (
            await transcribe_voice(database, redis, storage, settings, user, media_id)
        ).text
        text = transcript
    elif input_mode == AskInputMode.PHOTO.value and media_id is not None:
        async with database.session() as session:
            media = await MediaRepository(session).owned_ready(
                media_id, actor.subject_id, MediaPurpose.ASK.value
            )
        if media is None:
            raise BadRequestError("Choose a photo you have uploaded.")
    if not text:
        identified: list = []
        clarifying = "Can you describe what you need help with?"
        status = AskStatus.CLARIFYING.value
    else:
        result = await run_feature(
            database,
            redis,
            settings,
            user,
            feature=AiFeature.TASK_TO_TOOLS,
            input_payload={"text": text, "language": language},
            produce=lambda: identify_task(
                settings, IdentifyInput(text=text, language=language)
            ),
        )
        identified = [need.model_dump() for need in result.identified]
        clarifying = result.clarifying_question
        status = AskStatus.CLARIFYING.value if clarifying else AskStatus.RESULTS.value
    async with database.session() as session:
        return await AskSessionRepository(session).create(
            {
                "subject_user_id": actor.subject_id,
                "acted_by_user_id": user.id,
                "input_mode": input_mode,
                "input_text": input_text,
                "transcript": transcript,
                "input_media_id": media_id,
                "clarifying_question": clarifying,
                "identified": identified,
                "status": status,
            }
        )


async def get_ask_session(
    database: Database,
    storage: Storage,
    settings: Settings,
    actor: Actor,
    session_id: uuid.UUID,
) -> AskResult:
    async with database.session() as session:
        ask = await AskSessionRepository(session).get(session_id)
        if ask is None or ask.subject_user_id != actor.subject_id:
            raise AskSessionNotFoundError
    matches: list[ListingCard] = []
    if ask.identified:
        query = ask.identified[0].get("name")
        if query:
            result = await browse_listings(
                database,
                storage,
                settings,
                actor,
                ListingFilters(query=query[:100]),
                PageRequest(limit=10),
            )
            matches = result.items
    neighbours: list[User] = []
    if matches:
        owner_ids = list(dict.fromkeys(card.listing.owner_user_id for card in matches))
        async with database.session() as session:
            users = UserRepository(session)
            neighbours = [
                user for user in (await users.get(oid) for oid in owner_ids) if user
            ]
    return AskResult(session=ask, matches=matches, neighbours=neighbours)


async def answer_ask_session(
    database: Database,
    redis,
    settings: Settings,
    actor: Actor,
    session_id: uuid.UUID,
    answer: str,
) -> AskSession:
    async with database.session() as session:
        ask = await AskSessionRepository(session).get(session_id)
        if ask is None or ask.subject_user_id != actor.subject_id:
            raise AskSessionNotFoundError
    language = actor.subject.preferred_language
    base_text = ask.transcript or ask.input_text or answer
    result = await run_feature(
        database,
        redis,
        settings,
        actor.user,
        feature=AiFeature.TASK_TO_TOOLS,
        input_payload={"text": base_text, "answer": answer, "language": language},
        produce=lambda: identify_task(
            settings,
            IdentifyInput(text=base_text, answer=answer, language=language),
        ),
    )
    async with database.session() as session:
        repository = AskSessionRepository(session)
        current = await repository.get_for_update(session_id)
        if current is None or current.subject_user_id != actor.subject_id:
            raise AskSessionNotFoundError
        return await repository.update(
            current,
            {
                "clarifying_answer": answer,
                "identified": [need.model_dump() for need in result.identified],
                "clarifying_question": result.clarifying_question,
                "status": (
                    AskStatus.CLARIFYING.value
                    if result.clarifying_question
                    else AskStatus.RESULTS.value
                ),
            },
        )


async def draft_ask_message(
    database: Database,
    redis,
    settings: Settings,
    actor: Actor,
    session_id: uuid.UUID,
    audience: str,
) -> RequestDraft:
    async with database.session() as session:
        ask = await AskSessionRepository(session).get_for_update(session_id)
        if ask is None or ask.subject_user_id != actor.subject_id:
            raise AskSessionNotFoundError
        description = (ask.transcript or "").strip() or (ask.input_text or "").strip()
        clarification = (ask.clarifying_answer or "").strip()
        text = description or clarification
        if not text:
            raise BadRequestError("Describe your request before drafting it.")
        region = actor.subject.region
        draft_input = RequestDraftInput(
            text=text[:MAX_DRAFT_TEXT],
            clarification=(
                clarification[:MAX_DRAFT_CLARIFICATION]
                if description and clarification
                else None
            ),
            relationship=RELATIONSHIP_BY_AUDIENCE.get(audience, "neighbor"),
            culture_pack=culture_pack_for(region).name,
        )
        draft = await run_feature(
            database,
            redis,
            settings,
            actor.user,
            feature=AiFeature.POLITE_WRITER,
            input_payload={"audience": audience, "region": region},
            produce=lambda: write_request(settings, draft_input),
        )
        await AskSessionRepository(session).update(
            ask, {"status": AskStatus.DRAFTED.value}
        )
    return draft


async def abandon_ask_session(
    database: Database, actor: Actor, session_id: uuid.UUID
) -> None:
    async with database.session() as session:
        repository = AskSessionRepository(session)
        ask = await repository.get_for_update(session_id)
        if ask is None or ask.subject_user_id != actor.subject_id:
            return
        await repository.update(ask, {"status": AskStatus.ABANDONED.value})
