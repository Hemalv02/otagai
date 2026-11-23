import asyncio
import io
import json
import uuid
from datetime import UTC, datetime

import pytest
from PIL import Image

from app.database.connection import Database
from app.database.models import Exchange, HandoverCheck
from app.services.exchanges import handover_ai
from tests.integration.conftest import (
    FakeStorage,
    _settings,
    auth,
    join_circle,
    make_user,
    matched_exchange,
)


async def _image(client, headers, purpose="handover"):
    content = io.BytesIO()
    Image.new("RGB", (24, 24), (20, 100, 80)).save(content, format="PNG")
    uploaded = await client.post(
        "/media",
        headers=headers,
        files={"file": ("pickup.png", content.getvalue(), "image/png")},
        data={"purpose": purpose},
    )
    assert uploaded.status_code == 201, uploaded.text
    return uploaded.json()["id"]


async def test_pickup_needs_clean_check_and_two_confirmations(client):
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    path = f"/exchanges/{match['exchange_id']}"
    borrower, lender = auth(match["requester"]), auth(match["helper"])
    assert (await client.post(f"{path}/hand-over", headers=lender)).status_code == 409

    created, duplicate = sorted(
        await asyncio.gather(
            client.post(
                f"{path}/handover-checks", headers=borrower, json={"phase": "pickup"}
            ),
            client.post(
                f"{path}/handover-checks", headers=lender, json={"phase": "pickup"}
            ),
        ),
        key=lambda response: response.status_code,
    )
    assert created.status_code == 201, created.text
    assert duplicate.status_code == 409, duplicate.text
    check = created.json()
    check_path = f"/handover-checks/{check['id']}"
    (item,) = check["items"]
    assert item["label"] == "Cordless drill"
    item_path = f"{check_path}/items/{item['id']}"
    assert (
        await client.post(f"{check_path}/confirm", headers=lender)
    ).status_code == 409

    marked = await client.patch(item_path, headers=lender, json={"present": True})
    assert marked.status_code == 200, marked.text
    first = await client.post(f"{check_path}/confirm", headers=lender)
    assert first.status_code == 200, first.text
    assert first.json()["lender_confirmed_at"]
    assert (await client.post(f"{path}/hand-over", headers=lender)).status_code == 409

    flagged = await client.patch(
        item_path,
        headers=borrower,
        json={"present": False, "dispute_note": "Charger missing"},
    )
    assert flagged.status_code == 200, flagged.text
    assert flagged.json()["lender_confirmed_at"] is None
    assert (
        await client.post(f"{check_path}/confirm", headers=borrower)
    ).status_code == 409
    unauthorized_clear = await client.patch(
        item_path, headers=lender, json={"dispute_note": None}
    )
    assert unauthorized_clear.status_code == 409, unauthorized_clear.text
    resolved = await client.patch(
        item_path,
        headers=borrower,
        json={
            "label": "Drill with charger",
            "quantity": 2,
            "present": True,
            "dispute_note": None,
        },
    )
    assert resolved.status_code == 200, resolved.text
    assert (
        await client.post(f"{check_path}/confirm", headers=lender)
    ).status_code == 200
    confirmed, pickup = await asyncio.gather(
        client.post(f"{check_path}/confirm", headers=borrower),
        client.post(f"{path}/hand-over", headers=lender),
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["borrower_confirmed_at"]
    assert confirmed.json()["lender_confirmed_at"]
    assert pickup.status_code in (200, 409), pickup.text
    assert (
        await client.patch(item_path, headers=borrower, json={"present": False})
    ).status_code == 409
    pickup = await client.post(f"{path}/hand-over", headers=borrower)
    assert pickup.status_code == 200, pickup.text
    assert pickup.json()["status"] == "active"
    assert (
        await client.post(f"{check_path}/confirm", headers=borrower)
    ).status_code == 200


async def test_unclean_confirmations_from_an_old_scheduled_pickup_can_be_corrected(
    client,
):
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    lender, borrower = auth(match["helper"]), auth(match["requester"])
    path = f"/exchanges/{match['exchange_id']}"
    created = await client.post(
        f"{path}/handover-checks", headers=lender, json={"phase": "pickup"}
    )
    assert created.status_code == 201, created.text
    check = created.json()
    database = Database(_settings())
    try:
        async with database.session() as session:
            old_check = await session.get(HandoverCheck, uuid.UUID(check["id"]))
            old_check.lender_confirmed_at = old_check.borrower_confirmed_at = (
                datetime.now(UTC)
            )
    finally:
        await database.close()

    check_path = f"/handover-checks/{check['id']}"
    current = (await client.get(check_path, headers=borrower)).json()
    assert current["lender_confirmed_at"] is None
    assert current["borrower_confirmed_at"] is None
    assert (
        await client.post(f"{check_path}/confirm", headers=borrower)
    ).status_code == 409
    assert (await client.post(f"{path}/hand-over", headers=lender)).status_code == 409

    item = check["items"][0]["id"]
    fixed = await client.patch(
        f"{check_path}/items/{item}", headers=lender, json={"present": True}
    )
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["lender_confirmed_at"] is None
    for participant in (borrower, lender):
        confirmed = await client.post(f"{check_path}/confirm", headers=participant)
        assert confirmed.status_code == 200, confirmed.text
    assert (await client.post(f"{path}/hand-over", headers=lender)).status_code == 200


async def test_an_existing_active_loan_can_return_without_a_pickup_check(client):
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    path = f"/exchanges/{match['exchange_id']}"
    lender, borrower = auth(match["helper"]), auth(match["requester"])
    database = Database(_settings())
    try:
        async with database.session() as session:
            exchange = await session.get(Exchange, uuid.UUID(match["exchange_id"]))
            exchange.status = "active"
            exchange.handed_over_at = datetime.now(UTC)
    finally:
        await database.close()

    assert (await client.post(f"{path}/hand-over", headers=lender)).status_code == 200
    assert (await client.post(f"{path}/return", headers=borrower)).status_code == 200
    for participant in (borrower, lender):
        confirmed = await client.post(f"{path}/confirm", headers=participant)
        assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "completed"


async def test_a_racing_edit_cannot_leave_an_invalid_confirmed_pickup(client):
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    lender, borrower = auth(match["helper"]), auth(match["requester"])
    path = f"/exchanges/{match['exchange_id']}"
    created = await client.post(
        f"{path}/handover-checks", headers=lender, json={"phase": "pickup"}
    )
    assert created.status_code == 201, created.text
    check = created.json()
    check_path = f"/handover-checks/{check['id']}"
    item_path = f"{check_path}/items/{check['items'][0]['id']}"
    assert (
        await client.patch(item_path, headers=lender, json={"present": True})
    ).status_code == 200
    assert (
        await client.post(f"{check_path}/confirm", headers=lender)
    ).status_code == 200

    edited, confirmed = await asyncio.gather(
        client.patch(item_path, headers=lender, json={"present": False}),
        client.post(f"{check_path}/confirm", headers=borrower),
    )
    final = (await client.get(check_path, headers=lender)).json()
    pickup = await client.post(f"{path}/hand-over", headers=lender)
    if edited.status_code == 200:
        assert confirmed.status_code == 409
        assert final["lender_confirmed_at"] is None
        assert final["borrower_confirmed_at"] is None
        assert final["items"][0]["present"] is False
        assert pickup.status_code == 409
    else:
        assert edited.status_code == 409
        assert confirmed.status_code == 200
        assert final["items"][0]["present"] is True
        assert pickup.status_code == 200


async def test_handover_photos_are_private_to_the_check_participants(client):
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    path = f"/exchanges/{match['exchange_id']}/handover-checks"
    borrower, lender = auth(match["requester"]), auth(match["helper"])
    peer_token = await make_user(client)
    await join_circle(client, match["requester"], match["circle_id"], peer_token)
    peer = auth(peer_token)
    photo = await _image(client, borrower)
    other_photo = await _image(client, lender)
    wrong_purpose = await _image(client, borrower, "request")
    assert (await client.get(f"/media/{photo}", headers=lender)).status_code == 404

    created = await client.post(
        path, headers=borrower, json={"phase": "pickup", "media_ids": [photo]}
    )
    assert created.status_code == 201, created.text
    check_path = f"/handover-checks/{created.json()['id']}"
    assert created.json()["media_ids"] == [photo]
    assert (await client.get(check_path, headers=peer)).status_code == 404
    assert (await client.get(f"/media/{photo}", headers=peer)).status_code == 404
    partner_read = await client.get(f"/media/{photo}", headers=lender)
    assert partner_read.status_code == 200, partner_read.text
    assert partner_read.json()["urls"]["display"]
    assert (await client.delete(f"/media/{photo}", headers=borrower)).status_code == 409

    for forbidden in (other_photo, wrong_purpose):
        denied = await client.post(
            f"{check_path}/media", headers=borrower, json={"media_ids": [forbidden]}
        )
        assert denied.status_code == 400, denied.text
    added = await client.post(
        f"{check_path}/media", headers=lender, json={"media_ids": [other_photo]}
    )
    assert added.status_code == 200, added.text
    assert set(added.json()["media_ids"]) == {photo, other_photo}
    repeated = await client.post(
        f"{check_path}/media", headers=lender, json={"media_ids": [other_photo]}
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["media_ids"] == added.json()["media_ids"]


async def test_pickup_suggestion_failure_leaves_manual_checklist_available(client):
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    lender = auth(match["helper"])
    created = await client.post(
        f"/exchanges/{match['exchange_id']}/handover-checks",
        headers=lender,
        json={"phase": "pickup", "media_ids": [await _image(client, lender)]},
    )
    assert created.status_code == 201, created.text
    check_path = f"/handover-checks/{created.json()['id']}"
    suggested = await client.post(
        f"{check_path}/suggestions", headers=lender, json={"lang": "en"}
    )
    assert suggested.status_code == 503, suggested.text
    added = await client.post(
        f"{check_path}/items", headers=lender, json={"label": "Charger"}
    )
    assert added.status_code == 201, added.text
    assert [item["label"] for item in added.json()["items"]] == [
        "Cordless drill",
        "Charger",
    ]


@pytest.fixture
def configured_vision(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "vision-test-model")


async def test_pickup_suggestions_use_photos_and_skip_existing_items(
    configured_vision, client, monkeypatch
):
    async def download(self, key, *, max_bytes=0):
        assert key.endswith("/display.webp")
        return b"sample image"

    async def draft(settings, *, user_input, output_type, **kwargs):
        content = user_input[0]["content"]
        assert json.loads(content[0]["text"]) == {
            "language": "en",
            "listing_title": "Cordless drill",
            "existing_items": ["Cordless drill"],
        }
        assert content[1]["image_url"].startswith("data:image/webp;base64,")
        return output_type.model_validate(
            {
                "items": [
                    {"label": "Cordless drill", "quantity": 1},
                    {"label": "Charger", "quantity": 2},
                    {"label": "charger", "quantity": 2},
                ]
            }
        )

    monkeypatch.setattr(FakeStorage, "download", download)
    monkeypatch.setattr(handover_ai, "draft", draft)
    match = await matched_exchange(client, loan=True, pickup_ready=False)
    lender, borrower = auth(match["helper"]), auth(match["requester"])
    created = await client.post(
        f"/exchanges/{match['exchange_id']}/handover-checks",
        headers=lender,
        json={"phase": "pickup", "media_ids": [await _image(client, lender)]},
    )
    assert created.status_code == 201, created.text
    check_path = f"/handover-checks/{created.json()['id']}"
    outsider = auth(await make_user(client))
    denied = await client.post(
        f"{check_path}/suggestions", headers=outsider, json={"lang": "en"}
    )
    assert denied.status_code == 404, denied.text
    response = await client.post(
        f"{check_path}/suggestions", headers=borrower, json={"lang": "en"}
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"items": [{"label": "Charger", "quantity": 2}]}
    unchanged = await client.get(check_path, headers=borrower)
    assert unchanged.json()["items"] == created.json()["items"]
