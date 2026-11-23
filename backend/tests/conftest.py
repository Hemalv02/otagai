import uuid
from collections.abc import AsyncIterator

import httpx2
import pytest_asyncio

from app.main import create_app
from app.services.auth.service import AuthClaims, InvalidTokenError
from app.settings import Settings

GOOD_TOKEN = "good-token"


class FakeVerifier:
    async def verify(self, token: str) -> AuthClaims:
        if token == GOOD_TOKEN:
            return AuthClaims(auth_user_id=uuid.uuid4(), email=None, phone=None)
        raise InvalidTokenError("The access token is invalid.")


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    # Force an isolated app with no backing services, independent of any
    # DATABASE_HOST/SUPABASE_URL exported for the integration suite.
    settings = Settings(
        _env_file=None,
        database_host=None,
        migration_database_host=None,
        supabase_url=None,
        redis_host=None,
        s3_bucket=None,
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        app.state.token_verifier = FakeVerifier()
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport, base_url="http://test"
        ) as http_client:
            yield http_client
