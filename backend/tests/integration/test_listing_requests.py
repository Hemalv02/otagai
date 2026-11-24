import pytest
from sqlalchemy import text

from tests.integration.conftest import auth, join_circle, make_circle, make_user
from tests.integration.test_assistant import create_listing


async def setup_listing(client, *, kind="tool", lend_mode="lend"):
    requester = await make_user(client)
    owner = await make_user(client)
    circle = await make_circle(client, requester)
    await join_circle(client, requester, circle, owner)
    owner_id = (await client.get("/users/me", headers=auth(owner))).json()["id"]
    listing_id = await create_listing(
        client, owner, kind, "Test item", lend_mode=lend_mode
    )
    return requester, owner, owner_id, listing_id


def body(owner_id, listing_id, kind="borrow"):
    return {
        "kind": kind,
        "raw_text": "May I borrow it Saturday?",
        "lang": "en",
        "listing_id": listing_id,
        "direct_to_user_id": owner_id,
        "ripple_max_stage": "direct",
    }


async def test_borrow_request_reaches_owner_with_listing(client):
    requester, owner, owner_id, listing_id = await setup_listing(client)
    result = await client.post(
        "/requests", headers=auth(requester), json=body(owner_id, listing_id)
    )
    assert result.status_code == 201, result.text
    request = result.json()
    detail = (
        await client.get(f"/listings/{listing_id}", headers=auth(requester))
    ).json()
    assert request["listing_id"] == listing_id
    assert request["direct_to_user_id"] == owner_id
    assert request["ripple_stage"] == "direct"
    received = (
        await client.get("/users/me/received-requests?direct=true", headers=auth(owner))
    ).json()
    assert request["id"] in [row["request"]["id"] for row in received["items"]]
    async with client._transport.app._app.state.database.engine.begin() as connection:
        category = await connection.scalar(
            text("SELECT category_id::text FROM help_requests WHERE id=:id"),
            {"id": request["id"]},
        )
    assert category == detail["category_id"]


@pytest.mark.parametrize(
    ("mode", "kind", "expected"),
    [
        ("help_only", "borrow", 400),
        ("help_only", "help", 201),
        ("lend", "help", 400),
        ("lend_or_help", "help", 201),
    ],
)
async def test_request_kind_matches_lend_mode(client, mode, kind, expected):
    requester, _, owner_id, listing_id = await setup_listing(client, lend_mode=mode)
    result = await client.post(
        "/requests", headers=auth(requester), json=body(owner_id, listing_id, kind)
    )
    assert result.status_code == expected, result.text


async def test_paused_listing_is_409_and_resume_recovers(client):
    requester, owner, owner_id, listing_id = await setup_listing(client)
    await client.post(f"/listings/{listing_id}/pause", headers=auth(owner))
    result = await client.post(
        "/requests", headers=auth(requester), json=body(owner_id, listing_id)
    )
    assert result.status_code == 409, result.text
    await client.post(f"/listings/{listing_id}/resume", headers=auth(owner))
    result = await client.post(
        "/requests", headers=auth(requester), json=body(owner_id, listing_id)
    )
    assert result.status_code == 201, result.text


async def test_missing_recipient_is_400(client):
    requester, _, owner_id, listing_id = await setup_listing(client)
    payload = body(owner_id, listing_id)
    payload.pop("direct_to_user_id")
    result = await client.post("/requests", headers=auth(requester), json=payload)
    assert result.status_code == 400, result.text


async def test_invisible_or_blocked_listing_is_404(client):
    requester, _owner, owner_id, listing_id = await setup_listing(client)
    blocked = await client.post(
        "/users/me/blocks", headers=auth(requester), json={"user_id": owner_id}
    )
    assert blocked.status_code == 201, blocked.text
    result = await client.post(
        "/requests", headers=auth(requester), json=body(owner_id, listing_id)
    )
    assert result.status_code == 404, result.text
    outsider = await make_user(client)
    await make_circle(client, outsider)
    result = await client.post(
        "/requests", headers=auth(outsider), json=body(owner_id, listing_id)
    )
    assert result.status_code == 404, result.text
