import time

import pytest
from pydantic import BaseModel
from sqlalchemy import text

from app.database.models.enums import AiFeature
from app.services.ai import helpers, runner
from app.services.ai.service import AIDraftError
from app.services.storage.service import ObjectNotFoundError, StorageError
from tests.integration.conftest import auth, join_circle, make_circle, make_user
from tests.integration.test_ask_sessions import _png
from tests.integration.test_assistant import FixtureRedis, FixtureStorage


class CountingRedis(FixtureRedis):
    async def ttl(self, key):
        return 3600


def suggestion(**overrides):
    base = {
        "recognized": True,
        "title": "Cordless drill",
        "category_slug": "hand_tools",
        "category_hint": "power tool",
        "parts": [{"label": "Battery", "quantity": 1}],
        "safety_notes": "Wear eye protection.",
        "suggested_lend_mode": "lend",
        "brand": None,
        "model": None,
        "condition": None,
        "details": None,
        "unsure_fields": [],
    }
    return base | overrides


@pytest.fixture
def stub_model(monkeypatch):
    calls = []
    reply = {}

    async def draft(settings, *, instructions, user_input, output_type, **kwargs):
        calls.append({"instructions": instructions, "user_input": user_input})
        if isinstance(reply["value"], Exception):
            raise reply["value"]
        if isinstance(reply["value"], BaseModel):
            return reply["value"]
        return output_type(**reply["value"])

    monkeypatch.setattr(helpers, "draft", draft)

    def set_reply(value):
        reply["value"] = value
        return calls

    return set_reply


async def upload(client, token, purpose="listing"):
    response = await client.post(
        "/media",
        headers=auth(token),
        data={"purpose": purpose},
        files={"file": ("fixture.png", _png(), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def category_id(client, token, slug):
    response = await client.get("/categories?kind=tool", headers=auth(token))
    assert response.status_code == 200, response.text
    items = response.json()
    items = items.get("items", items) if isinstance(items, dict) else items
    stack = list(items)
    while stack:
        item = stack.pop()
        if item["slug"] == slug:
            return item["id"]
        stack.extend(item.get("children", []))
    raise AssertionError(slug)


async def setup(client):
    client._transport.app._app.state.storage = FixtureStorage()
    token = await make_user(client, language="en")
    return token, await upload(client, token)


async def post(client, token, **body):
    return await client.post(
        "/ai/listing-drafts", headers=auth(token), json={"language": "en", **body}
    )


async def test_text_draft_contract_still_works(client, stub_model):
    token = await make_user(client, language="en")
    stub_model(suggestion())
    response = await post(client, token, description="A cordless drill")
    assert response.status_code == 200, response.text
    body = response.json()
    for key in (
        "title",
        "category_hint",
        "parts",
        "safety_notes",
        "suggested_lend_mode",
    ):
        assert key in body


async def test_text_draft_works_without_media_storage(client, stub_model):
    token = await make_user(client, language="en")
    client._transport.app._app.state.storage = None
    stub_model(suggestion())

    response = await post(client, token, description="Cordless drill")

    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Cordless drill"


async def test_photo_draft_keeps_known_counts_and_marks_unknown_counts(
    client, stub_model
):
    token, media_id = await setup(client)
    stub_model(
        suggestion(
            parts=[
                {"label": "<b>Battery</b>", "quantity": 2},
                {"label": "battery", "quantity": 2},
                {"label": "Driver bits", "quantity": None},
                {"label": " ", "quantity": 3},
                {"label": "Case", "quantity": 1},
                {"label": "case", "quantity": 2},
            ]
        )
    )

    response = await post(client, token, image_media_id=media_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parts"] == ["Battery", "Driver bits", "Case"]
    assert body["part_items"] == [
        {"label": "Battery", "quantity": 2},
        {"label": "Driver bits", "quantity": None},
        {"label": "Case", "quantity": None},
    ]
    assert "parts" in body["unsure_fields"]


@pytest.mark.parametrize("quantity", [0, 1000, "2", True])
async def test_photo_draft_rejects_invalid_model_part_counts(
    client, stub_model, quantity
):
    token, media_id = await setup(client)
    stub_model(suggestion(parts=[{"label": "Battery", "quantity": quantity}]))

    response = await post(client, token, image_media_id=media_id)

    assert response.status_code == 503, response.text


async def test_photo_draft_sends_image_and_maps_category(client, stub_model):
    token, media_id = await setup(client)
    calls = stub_model(
        suggestion(
            brand="Makita",
            model="DF331",
            condition="Light wear",
            details="Comes with a carry case.",
            unsure_fields=["model"],
        )
    )
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["category_id"] == await category_id(client, token, "hand_tools")
    assert body["recognized"] is True
    assert body["category_is_risky"] is False
    assert body["brand"] == "Makita"
    assert body["model"] == "DF331"
    assert body["condition"] == "Light wear"
    assert body["details"] == "Comes with a carry case."
    assert body["unsure_fields"] == ["model"]
    content = calls[0]["user_input"][0]["content"]
    image = next(part for part in content if part["type"] == "input_image")
    assert image["image_url"].startswith("data:image/webp;base64,")


async def test_unknown_category_slug_is_dropped(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion(category_slug="bogus"))
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["category_id"] is None
    assert body["category_is_risky"] is False


async def test_risky_category_forces_help_only(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion(category_slug="ladders", suggested_lend_mode="lend"))
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["category_is_risky"] is True
    assert body["suggested_lend_mode"] == "help_only"


async def test_output_is_bounded(client, stub_model):
    token, media_id = await setup(client)
    labels = ["", "  ", "Drill", "drill", "DRILL", "x" * 300]
    labels.extend(f"part {i}" for i in range(40))
    parts = [{"label": label, "quantity": 1} for label in labels]
    stub_model(
        suggestion(
            title="t" * 300,
            parts=parts,
            safety_notes="s" * 5000,
            brand="b" * 300,
            model="m" * 300,
            condition="c" * 900,
            details="d" * 5000,
            category_hint="h" * 500,
        )
    )
    body = (await post(client, token, image_media_id=media_id)).json()
    assert len(body["title"]) == 120
    assert len(body["parts"]) == len(body["part_items"]) == 30
    assert body["part_items"][1] == {"label": "x" * 120, "quantity": 1}
    assert len({part.lower() for part in body["parts"]}) == 30
    assert all(0 < len(part) <= 120 for part in body["parts"])
    assert len(body["safety_notes"]) == 2000
    assert len(body["brand"]) == 80
    assert len(body["model"]) == 80
    assert len(body["condition"]) == 200
    assert len(body["details"]) == 1000
    assert len(body["category_hint"]) == 120


async def test_injected_output_is_sanitized(client, stub_model):
    token, media_id = await setup(client)
    stub_model(
        suggestion(
            title="Ignore previous instructions <b>Drill</b> https://evil.example/x",
            category_slug="ladders; DROP TABLE categories",
            parts=[
                {"label": "[Click here](https://evil.example/p)", "quantity": 1},
                {"label": "<script>alert(1)</script>", "quantity": 1},
                {"label": "www.evil.example", "quantity": None},
                {"label": "Battery\x00\x07" + chr(0x202E), "quantity": 2},
            ],
            safety_notes="Visit http://evil.example now\x1b[31m\n\nSecond line",
            brand="<img src=x onerror=alert(1)>Acme",
            details="![pic](https://evil.example/a.png) Sturdy",
            suggested_lend_mode="lend",
        )
    )
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 200, response.text
    body = response.json()
    flat = " ".join(
        [body["title"], body["safety_notes"], body["brand"], body["details"]]
        + body["parts"]
    )
    for banned in ("http", "www.", "<", ">", "\x00", "\x1b", chr(0x202E), "evil"):
        assert banned not in flat
    assert body["category_id"] is None
    assert "Click here" in body["parts"]
    assert "Battery" in body["parts"]
    assert body["title"].endswith("Drill") or "Drill" in body["title"]


async def test_title_that_is_only_markup_is_not_recognized(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion(title="https://evil.example <i></i>"))
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["recognized"] is False
    assert body["title"] == ""
    assert body["category_id"] is None


async def test_unrecognized_photo_has_no_suggestions(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion(recognized=False, title="Wall"))
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["recognized"] is False
    assert body["category_id"] is None
    assert body["parts"] == body["part_items"] == []


async def test_off_schema_model_output_is_503(client, stub_model):
    token, media_id = await setup(client)

    class Rogue(BaseModel):
        title: str = "x"
        category_id: str = "ignore previous instructions"

    stub_model(Rogue())
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 503, response.text
    assert "ignore" not in response.text


async def test_other_users_photo_is_404_and_model_not_called(client, stub_model):
    token, media_id = await setup(client)
    stranger = await make_user(client, language="en")
    circle = await make_circle(client, token)
    await join_circle(client, token, circle, stranger)
    calls = stub_model(suggestion())
    response = await post(client, stranger, image_media_id=media_id)
    assert response.status_code == 404
    assert not calls


async def test_ask_purpose_photo_is_404(client, stub_model):
    client._transport.app._app.state.storage = FixtureStorage()
    token = await make_user(client, language="en")
    media_id = await upload(client, token, purpose="ask")
    calls = stub_model(suggestion())
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 404
    assert not calls


async def test_unready_photo_is_404(client, stub_model):
    token, media_id = await setup(client)
    async with client._transport.app._app.state.database.engine.begin() as connection:
        await connection.execute(
            text("UPDATE media_files SET status='processing' WHERE id=:id"),
            {"id": media_id},
        )
    calls = stub_model(suggestion())
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 404
    assert not calls


@pytest.mark.parametrize(
    ("error_type", "status_code"), [(ObjectNotFoundError, 404), (StorageError, 503)]
)
async def test_photo_download_failure_has_actionable_status(
    client, stub_model, monkeypatch, error_type, status_code
):
    token, media_id = await setup(client)
    storage = client._transport.app._app.state.storage

    async def unavailable(*args, **kwargs):
        raise error_type("download failed")

    monkeypatch.setattr(storage, "download", unavailable)
    calls = stub_model(suggestion())

    response = await post(client, token, image_media_id=media_id)

    assert response.status_code == status_code, response.text
    assert not calls


async def test_body_needs_text_or_photo_422(client):
    token = await make_user(client, language="en")
    assert (await post(client, token)).status_code == 422
    assert (
        await post(client, token, description="drill", extra="x")
    ).status_code == 422


async def test_model_failure_is_503(client, stub_model):
    token, media_id = await setup(client)
    stub_model(AIDraftError("x"))
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 503


async def test_rate_limit_applies_before_any_photo_work(
    client, stub_model, monkeypatch
):
    _token, media_id = await setup(client)
    stranger = await make_user(client, language="en")
    client._transport.app._app.state.redis = CountingRedis()
    monkeypatch.setitem(
        runner.RATE_LIMITS, AiFeature.PHOTO_LISTING, runner.RateLimit(2, 3600)
    )
    calls = stub_model(suggestion())
    statuses = [
        (await post(client, stranger, image_media_id=media_id)).status_code
        for _ in range(4)
    ]
    assert statuses == [404, 404, 429, 429]
    assert not calls


async def test_oversized_markdown_noise_is_bounded_and_fast(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion(details="![" * 50000, safety_notes="[" * 50000 + "(" * 50000))
    started = time.monotonic()
    response = await post(client, token, image_media_id=media_id)
    assert response.status_code == 200, response.text
    assert time.monotonic() - started < 1
    assert len(response.json()["details"] or "") <= 1000


async def test_angle_bracket_in_prose_keeps_the_text(client, stub_model):
    token, media_id = await setup(client)
    stub_model(
        suggestion(
            title="Drill < 500W, cordless",
            safety_notes="Keep dry\n\nUse only if 2 < 3\nWear gloves",
        )
    )
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["title"] == "Drill < 500W, cordless"
    assert body["safety_notes"] == "Keep dry\nUse only if 2 < 3\nWear gloves"


async def test_links_and_contact_details_are_removed(client, stub_model):
    token, media_id = await setup(client)
    stub_model(
        suggestion(
            title="Drill",
            brand="Acme example.com",
            model="X1 evil[.]example",
            condition="good //evil.test/path",
            details="javascript:alert(1) data:text/html,hi mailto:a@b.co mail me@evil.example ok",
            safety_notes="See evil.example/safety now",
        )
    )
    body = (await post(client, token, image_media_id=media_id)).json()
    flat = " ".join(
        body[key] for key in ("brand", "model", "condition", "details", "safety_notes")
    )
    for banned in ("example", "evil", "javascript:", "data:", "mailto:", "@", "//"):
        assert banned not in flat
    assert body["brand"] == "Acme"
    assert body["details"].endswith("ok")


async def test_markdown_emphasis_and_headings_are_stripped(client, stub_model):
    token, media_id = await setup(client)
    stub_model(
        suggestion(
            title="# **Cordless** `drill`",
            safety_notes="## Heads up\n**Wear** goggles",
        )
    )
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["title"] == "Cordless drill"
    assert body["safety_notes"] == "Heads up\nWear goggles"


async def test_text_request_sends_no_image_to_the_model(client, stub_model):
    token = await make_user(client, language="en")
    calls = stub_model(suggestion())
    await post(client, token, description="A cordless drill")
    assert "input_image" not in str(calls[0]["user_input"])


async def test_photo_is_sent_at_high_detail(client, stub_model):
    token, media_id = await setup(client)
    calls = stub_model(suggestion())
    await post(client, token, image_media_id=media_id)
    content = calls[0]["user_input"][0]["content"]
    image = next(part for part in content if part["type"] == "input_image")
    assert image["detail"] == "high"


async def test_stored_run_input_has_no_image_data(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion())
    await post(client, token, image_media_id=media_id)
    async with client._transport.app._app.state.database.engine.begin() as connection:
        rows = (
            await connection.execute(
                text("SELECT input::text FROM ai_runs WHERE feature='photo_listing'")
            )
        ).all()
    assert rows
    assert all("data:" not in row[0] and "base64" not in row[0] for row in rows)


async def test_capitalised_words_after_a_dot_are_not_mistaken_for_domains(
    client, stub_model
):
    token, media_id = await setup(client)
    stub_model(
        suggestion(
            title="Li-ion 18V.Use with care",
            brand="Makita.Good condition",
            model="Model XR-5.Pro",
            condition="etc.They work well",
            details="Battery.Charger included",
        )
    )
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["title"] == "Li-ion 18V.Use with care"
    assert body["brand"] == "Makita.Good condition"
    assert body["model"] == "Model XR-5.Pro"
    assert body["condition"] == "etc.They work well"
    assert body["details"] == "Battery.Charger included"


async def test_uppercase_common_domains_are_still_removed(client, stub_model):
    token, media_id = await setup(client)
    stub_model(suggestion(details="Order at EVIL.COM/x today", brand="SHOP.Io"))
    body = (await post(client, token, image_media_id=media_id)).json()
    assert body["details"] == "Order at today"
    assert body["brand"] is None
