import uuid

from redis.asyncio import Redis

from app.database.connection import Database
from app.database.models import Circle
from app.database.models.enums import AiFeature, Language
from app.repositories.request_ripple import RippleRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.ai.request_writer import RequestWording, WordingInput, rewrite_request
from app.services.ai.runner import run_feature
from app.services.errors import BadRequestError
from app.settings import Settings


async def list_request_destinations(database: Database, actor: Actor) -> list[Circle]:
    actor.require(ProxyScope.POST_REQUESTS)
    async with database.session() as session:
        return await RippleRepository(session).home_circles(actor.subject_id)


async def draft_for_destination(
    database: Database,
    redis: Redis | None,
    settings: Settings,
    actor: Actor,
    home_circle_id: uuid.UUID,
    body: WordingInput,
) -> RequestWording:
    circles = await list_request_destinations(database, actor)
    circle = next((item for item in circles if item.id == home_circle_id), None)
    if circle is None:
        raise BadRequestError("Choose an approved circle for this request.")
    language = body.language or Language(actor.subject.preferred_language)
    return await run_feature(
        database,
        redis,
        settings,
        actor.user,
        feature=AiFeature.POLITE_WRITER,
        input_payload={
            "source": "request_composer",
            "language": language.value,
            "region": circle.region,
            "relationship": body.relationship,
        },
        produce=lambda: rewrite_request(
            settings, body, language=language, region=circle.region
        ),
    )
