import uuid

import pytest
from sqlalchemy import text

from app.services.ai import helpers
from app.services.ai.service import AIDraftError
from tests.integration.conftest import auth, make_user
from tests.integration.test_ask_sessions import _png
from tests.integration.test_assistant import FixtureStorage


def stub_model(monkeypatch, **changes):
    calls = []
    payload = {
        "recognized": True,
        "title": "Drill",
        "category_slug": "hand_tools",
        "category_hint": "Hand tools",
        "parts": ["Drill", "Battery"],
        "safety_notes": "Wear eye protection.",
        "suggested_lend_mode": "lend",
    }
    payload.update(changes)

    async def model(settings, *, user_input, output_type, **kwargs):
        calls.append(user_input)
        return output_type(**payload)

    monkeypatch.setattr(helpers, "draft", model)
    return calls


async def upload(client, token, purpose="listing"):
    app = client._transport.app._app
    app.state.storage = FixtureStorage()
    response = await client.post(
        "/media",
        headers=auth(token),
        files={"file": ("tool.png", _png(), "image/png")},
        data={"purpose": purpose},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_text_contract_and_photo_category_mapping(client, monkeypatch):
    token = await make_user(client)
    calls = stub_model(monkeypatch)
    response = await client.post(
        "/ai/listing-drafts",
        headers=auth(token),
        json={"description": "A drill", "language": "en"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Drill"
    assert isinstance(calls[0], str)
    media_id = await upload(client, token)
    response = await client.post(
        "/ai/listing-drafts",
        headers=auth(token),
        json={"image_media_id": media_id, "language": "en"},
    )
    assert response.status_code == 200, response.text
    categories = (
        await client.get("/categories?kind=tool", headers=auth(token))
    ).json()["items"]
    assert response.json()["category_id"] == next(
        c["id"] for c in categories if c["slug"] == "hand_tools"
    )
    assert calls[1][0]["content"][1]["image_url"].startswith("data:image/webp;base64,")
    assert response.json()["recognized"] is True


@pytest.mark.parametrize("slug,risky", [("bogus", False), ("ladders", True)])
async def test_category_is_validated_and_risky_mode_enforced(
    client, monkeypatch, slug, risky
):
    token = await make_user(client)
    stub_model(monkeypatch, category_slug=slug)
    response = await client.post(
        "/ai/listing-drafts",
        headers=auth(token),
        json={"description": "Tool", "language": "en"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["category_is_risky"] is risky
    if risky:
        assert body["suggested_lend_mode"] == "help_only"
    else:
        assert body["category_id"] is None


async def test_output_is_bounded_and_deduplicated(client, monkeypatch):
    token = await make_user(client)
    stub_model(
        monkeypatch,
        title="x" * 300,
        parts=[" ", "Battery", "battery", *["p" * 130 + str(i) for i in range(40)]],
        safety_notes="s" * 3000,
    )
    response = await client.post(
        "/ai/listing-drafts",
        headers=auth(token),
        json={"description": "Tool", "language": "en"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["title"]) == 120
    assert len(body["parts"]) <= 30
    assert len({p.casefold() for p in body["parts"]}) == len(body["parts"])
    assert all(0 < len(p) <= 120 for p in body["parts"])
    assert len(body["safety_notes"]) == 2000


@pytest.mark.parametrize(
    "case", ["foreign", "ask", "processing", "rejected", "missing"]
)
async def test_invalid_photo_rejected_before_model(client, monkeypatch, case):
    owner = await make_user(client)
    caller = await make_user(client) if case == "foreign" else owner
    media_id = await upload(client, owner, "ask" if case == "ask" else "listing")
    if case in ("processing", "rejected"):
        async with (
            client._transport.app._app.state.database.engine.begin() as connection
        ):
            await connection.execute(
                text("UPDATE media_files SET status=:status WHERE id=:id"),
                {"status": case, "id": uuid.UUID(media_id)},
            )
    if case == "missing":
        media_id = str(uuid.uuid4())
    calls = stub_model(monkeypatch)
    response = await client.post(
        "/ai/listing-drafts",
        headers=auth(caller),
        json={"image_media_id": media_id, "language": "en"},
    )
    assert response.status_code == 404, response.text
    assert not calls


async def test_empty_input_rejected_and_model_failure_is_recoverable(
    client, monkeypatch
):
    token = await make_user(client)
    response = await client.post(
        "/ai/listing-drafts", headers=auth(token), json={"language": "en"}
    )
    assert response.status_code == 422

    async def fail(*args, **kwargs):
        raise AIDraftError("Unavailable")

    monkeypatch.setattr(helpers, "draft", fail)
    response = await client.post(
        "/ai/listing-drafts",
        headers=auth(token),
        json={"description": "Tool", "language": "en"},
    )
    assert response.status_code == 503
