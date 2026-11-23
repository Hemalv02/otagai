import os
import uuid
from collections.abc import AsyncIterator

import httpx2
import pytest
import pytest_asyncio
from sqlalchemy import text

from app.database.connection import Database
from app.main import create_app
from app.services.auth.service import AuthClaims, InvalidTokenError
from app.settings import Settings

pytestmark = pytest.mark.integration

RUN = bool(os.environ.get("DATABASE_HOST"))

if not RUN:  # pragma: no cover
    collect_ignore_glob = ["*"]


EXERCISED: set[tuple[str, str]] = set()


class RouteRecorder:
    """Records (method, concrete path) of every HTTP request for coverage."""

    def __init__(self, app):
        self._app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            EXERCISED.add((scope["method"], scope["path"]))
        await self._app(scope, receive, send)


class FakeStorage:
    async def presigned_get_url(self, key: str, *, expires_in: int = 900) -> str:
        return f"https://signed.test/{key}?e={expires_in}"

    async def upload(self, key, content, content_type) -> None:
        return None

    async def delete(self, key) -> None:
        return None

    async def download(self, key, *, max_bytes: int = 0) -> bytes:
        return b""


class MappingVerifier:
    """Treats the bearer token as the caller's Supabase auth_user_id."""

    async def verify(self, token: str) -> AuthClaims:
        try:
            auth_id = uuid.UUID(token)
        except ValueError as error:
            raise InvalidTokenError("The access token is invalid.") from error
        return AuthClaims(auth_user_id=auth_id, email=None, phone=None)


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        database_host=os.environ["DATABASE_HOST"],
        database_port=int(os.environ.get("DATABASE_PORT", "5432")),
        postgres_user=os.environ.get("POSTGRES_USER", "otagai"),
        postgres_db=os.environ.get("POSTGRES_DB", "otagai"),
        postgres_password=os.environ["POSTGRES_PASSWORD"],
        database_ssl_mode="disable",
    )


async def _truncate(database: Database) -> None:
    async with database.engine.begin() as connection:
        rows = await connection.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' "
                "AND tablename <> 'alembic_version'"
            )
        )
        tables = ", ".join(f'"{row[0]}"' for row in rows)
        if tables:
            await connection.execute(
                text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE")
            )


async def _seed_categories(database: Database) -> None:
    async with database.engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO categories (slug, kind, names, is_risky, sort_order) "
                "VALUES ('hand_tools', 'tool', '{\"en\":\"Hand tools\"}', false, 0), "
                "('ladders', 'tool', '{\"en\":\"Ladders\"}', true, 1), "
                "('cooking', 'skill', '{\"en\":\"Cooking\"}', false, 2)"
            )
        )


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx2.AsyncClient]:
    settings = _settings()
    database = Database(settings)
    await _truncate(database)
    await _seed_categories(database)
    app = create_app(settings)
    app.state.database = database
    app.state.token_verifier = MappingVerifier()
    app.state.storage = FakeStorage()
    app.state.readiness_checks = {}
    transport = httpx2.ASGITransport(app=RouteRecorder(app))
    async with httpx2.AsyncClient(
        transport=transport, base_url="http://test"
    ) as http_client:
        yield http_client
    await database.close()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def make_user(
    client: httpx2.AsyncClient,
    *,
    display_name: str = "Neighbour",
    region: str = "jp",
    language: str = "ja",
) -> str:
    token = str(uuid.uuid4())
    response = await client.post(
        "/users",
        headers=auth(token),
        json={
            "display_name": display_name,
            "preferred_language": language,
            "region": region,
        },
    )
    assert response.status_code == 201, response.text
    return token


async def make_circle(client: httpx2.AsyncClient, token: str) -> str:
    response = await client.post(
        "/circles",
        headers=auth(token),
        json={"name": "Han 1", "unit_type": "han"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def join_circle(
    client: httpx2.AsyncClient, leader_token: str, circle_id: str, member_token: str
) -> None:
    invite = await client.post(
        f"/circles/{circle_id}/invites",
        headers=auth(leader_token),
        json={"auto_approve": True},
    )
    assert invite.status_code == 201, invite.text
    code = await _invite_code(client, leader_token, circle_id)
    joined = await client.post(
        "/users/me/memberships",
        headers=auth(member_token),
        json={"invite_code": code},
    )
    assert joined.status_code == 201, joined.text
    assert joined.json()["status"] == "approved"


async def _invite_code(
    client: httpx2.AsyncClient, leader_token: str, circle_id: str
) -> str:
    listed = await client.get(
        f"/circles/{circle_id}/invites", headers=auth(leader_token)
    )
    assert listed.status_code == 200, listed.text
    return listed.json()["items"][0]["code"]


def pytest_sessionfinish(session, exitstatus):
    import re

    if not EXERCISED:
        return
    from app.main import create_app

    spec = create_app(_settings()).openapi()
    all_ops = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops}
    regexes = {
        (m.upper(), p): re.compile("^" + re.sub(r"\{[^}]+\}", r"[^/]+", p) + "$")
        for p, ops in spec["paths"].items()
        for m in ops
    }
    covered = {
        key
        for method, cpath in EXERCISED
        for key, rx in regexes.items()
        if key[0] == method and rx.match(cpath)
    }
    untested = sorted(all_ops - covered)
    report = os.path.join(
        os.environ.get("COVERAGE_OUT", "/tmp"), "endpoint_coverage.txt"
    )
    with open(report, "w") as handle:
        handle.write(f"exercised {len(all_ops) - len(untested)}/{len(all_ops)}\n")
        handle.writelines(f"UNTESTED {method} {path}\n" for method, path in untested)


async def matched_exchange(client: httpx2.AsyncClient, *, loan: bool = False) -> dict:
    """Two circle-sharing users up to an accepted offer (exchange scheduled)."""
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "borrow", "raw_text": "Borrow a drill", "lang": "ja"},
        )
    ).json()["id"]
    offer = {"kind": "offer"}
    if loan:
        categories = await client.get("/categories?kind=tool", headers=auth(helper))
        assert categories.status_code == 200, categories.text
        listing = await client.post(
            "/listings",
            headers=auth(helper),
            json={
                "kind": "tool",
                "category_id": categories.json()["items"][0]["id"],
                "title": "Cordless drill",
                "lang": "ja",
            },
        )
        assert listing.status_code == 201, listing.text
        offer["listing_id"] = listing.json()["id"]

    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json=offer,
        )
    ).json()["id"]
    await client.post(
        f"/requests/{request_id}/responses/{response_id}/accept",
        headers=auth(requester),
    )
    exchange_id = (
        await client.get("/users/me/exchanges", headers=auth(helper))
    ).json()["items"][0]["id"]
    return {
        "requester": requester,
        "helper": helper,
        "circle_id": circle_id,
        "request_id": request_id,
        "response_id": response_id,
        "exchange_id": exchange_id,
    }


async def completed_exchange(client: httpx2.AsyncClient) -> dict:
    """Two circle-sharing users run a request through to a completed exchange."""
    ctx = await matched_exchange(client)
    exchange_id = ctx["exchange_id"]
    await client.post(
        f"/exchanges/{exchange_id}/hand-over", headers=auth(ctx["helper"])
    )
    await client.post(
        f"/exchanges/{exchange_id}/confirm", headers=auth(ctx["requester"])
    )
    await client.post(f"/exchanges/{exchange_id}/confirm", headers=auth(ctx["helper"]))
    return ctx
