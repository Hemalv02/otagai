import uuid

from sqlalchemy import text

from app.database.connection import Database
from tests.integration.conftest import (
    _settings,
    auth,
    completed_exchange,
    join_circle,
    make_user,
    matched_exchange,
)
from tests.integration.family_fixtures import me_id, post_help


async def _open_request(client, owner, circle_id, **extra):
    response = await post_help(client, auth(owner), home_circle_id=circle_id, **extra)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_return_the_favour_shows_only_actionable_requests_from_the_helper(client):
    ctx = await completed_exchange(client)
    requester, helper, circle_id = ctx["requester"], ctx["helper"], ctx["circle_id"]
    requester_headers = auth(requester)
    third = await make_user(client, display_name="Another neighbour")
    await join_circle(client, requester, circle_id, third)
    third_id = await me_id(client, third)
    requester_id = await me_id(client, requester)
    path = f"/exchanges/{ctx['exchange_id']}/return-favours"

    ordinary = await _open_request(client, helper, circle_id)
    direct = await _open_request(
        client, helper, circle_id, direct_to_user_id=requester_id
    )
    await _open_request(client, helper, circle_id, direct_to_user_id=third_id)
    await _open_request(client, third, circle_id)
    hidden = await _open_request(client, helper, circle_id)
    hidden_response = await client.patch(
        f"/users/me/received-requests/{hidden}",
        headers=requester_headers,
        json={"hidden": True},
    )
    assert hidden_response.status_code == 200, hidden_response.text
    already_responded = await _open_request(client, helper, circle_id)
    answer = await client.post(
        f"/requests/{already_responded}/responses",
        headers=requester_headers,
        json={"kind": "offer"},
    )
    assert answer.status_code == 201, answer.text
    expired = await _open_request(client, helper, circle_id)
    database = Database(_settings())
    try:
        async with database.session() as session:
            await session.execute(
                text(
                    "UPDATE help_requests SET expires_at = now() - interval '1 second' "
                    "WHERE id = :request_id"
                ),
                {"request_id": uuid.UUID(expired)},
            )
    finally:
        await database.close()

    suggestions = await client.get(path, headers=requester_headers)
    assert suggestions.status_code == 200, suggestions.text
    assert [item["id"] for item in suggestions.json()["items"]] == [direct, ordinary]
    assert (await client.get(path, headers=auth(helper))).status_code == 404
    assert (await client.get(path, headers=auth(third))).status_code == 404

    cancelled = await client.post(f"/requests/{direct}/cancel", headers=auth(helper))
    assert cancelled.status_code == 200, cancelled.text
    fresh = await client.get(path, headers=requester_headers)
    assert [item["id"] for item in fresh.json()["items"]] == [ordinary]
    detail = await client.get(f"/requests/{ordinary}", headers=requester_headers)
    assert detail.status_code == 200
    assert detail.json()["my_response_id"] is None

    newer = [await _open_request(client, helper, circle_id) for _ in range(4)]
    capped = await client.get(path, headers=requester_headers)
    assert [item["id"] for item in capped.json()["items"]] == list(reversed(newer[-3:]))

    blocked = await client.post(
        "/users/me/blocks",
        headers=auth(helper),
        json={"user_id": requester_id},
    )
    assert blocked.status_code == 201
    assert (await client.get(path, headers=requester_headers)).json()["items"] == []


async def test_return_the_favour_waits_for_confirmed_completion(client):
    ctx = await matched_exchange(client)
    await _open_request(client, ctx["helper"], ctx["circle_id"])
    response = await client.get(
        f"/exchanges/{ctx['exchange_id']}/return-favours",
        headers=auth(ctx["requester"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
