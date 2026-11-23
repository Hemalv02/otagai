from app.database.connection import Database
from app.database.models import Category
from app.repositories.categories import CategoryRepository


async def list_categories(database: Database, kind: str | None) -> list[Category]:
    async with database.session() as session:
        return await CategoryRepository(session).list_all(kind)
