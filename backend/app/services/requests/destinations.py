from app.database.connection import Database
from app.database.models import Circle
from app.repositories.request_ripple import RippleRepository
from app.services.actors.service import Actor, ProxyScope


async def list_request_destinations(database: Database, actor: Actor) -> list[Circle]:
    actor.require(ProxyScope.POST_REQUESTS)
    async with database.session() as session:
        return await RippleRepository(session).home_circles(actor.subject_id)
