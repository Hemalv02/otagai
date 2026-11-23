import uuid

from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def _requester_and_helper(client):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    return requester, helper, circle_id


async def test_post_request_success_and_recipient_sees_it(client):
    requester, helper, _ = await _requester_and_helper(client)
    created = await client.post(
        "/requests",
        headers=auth(requester),
        json={"kind": "help", "raw_text": "Move a sofa", "lang": "ja"},
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    received = await client.get("/users/me/received-requests", headers=auth(helper))
    assert received.status_code == 200
    ids = [item["request"]["id"] for item in received.json()["items"]]
    assert request_id in ids


async def test_request_bad_body_422(client):
    requester = await make_user(client)
    await make_circle(client, requester)
    response = await client.post(
        "/requests",
        headers=auth(requester),
        json={
            "kind": "help",
            "raw_text": "x",
            "lang": "ja",
            "ripple_max_stage": "direct",
        },
    )
    assert response.status_code == 422


async def test_requests_require_auth_401(client):
    response = await client.get("/users/me/requests")
    assert response.status_code == 401


async def test_unknown_request_404(client):
    requester = await make_user(client)
    await make_circle(client, requester)
    response = await client.get(f"/requests/{uuid.uuid4()}", headers=auth(requester))
    assert response.status_code == 404


async def test_accept_creates_exchange_and_second_accept_409(client):
    requester, helper, _ = await _requester_and_helper(client)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Need a hand", "lang": "ja"},
        )
    ).json()["id"]

    offer = await client.post(
        f"/requests/{request_id}/responses",
        headers=auth(helper),
        json={"kind": "offer", "message": "I can help"},
    )
    assert offer.status_code == 201, offer.text
    response_id = offer.json()["id"]

    accepted = await client.post(
        f"/requests/{request_id}/responses/{response_id}/accept",
        headers=auth(requester),
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    # Request is now matched; an exchange + conversation exist.
    detail = await client.get(f"/requests/{request_id}", headers=auth(requester))
    assert detail.json()["status"] == "matched"

    # Repeating the accept on the same response is idempotent (200, no change).
    again = await client.post(
        f"/requests/{request_id}/responses/{response_id}/accept",
        headers=auth(requester),
    )
    assert again.status_code == 200


async def test_duplicate_live_response_409(client):
    requester, helper, _ = await _requester_and_helper(client)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Help please", "lang": "ja"},
        )
    ).json()["id"]
    first = await client.post(
        f"/requests/{request_id}/responses",
        headers=auth(helper),
        json={"kind": "offer"},
    )
    assert first.status_code == 201
    second = await client.post(
        f"/requests/{request_id}/responses",
        headers=auth(helper),
        json={"kind": "offer"},
    )
    assert second.status_code == 409


async def test_non_recipient_cannot_respond_404(client):
    requester, _, _ = await _requester_and_helper(client)
    outsider = await make_user(client, display_name="Outsider")
    await make_circle(client, outsider)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Help", "lang": "ja"},
        )
    ).json()["id"]
    response = await client.post(
        f"/requests/{request_id}/responses",
        headers=auth(outsider),
        json={"kind": "offer"},
    )
    assert response.status_code == 404


async def test_cancel_then_cancel_again_is_idempotent(client):
    requester, _, _ = await _requester_and_helper(client)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Help", "lang": "ja"},
        )
    ).json()["id"]
    first = await client.post(f"/requests/{request_id}/cancel", headers=auth(requester))
    assert first.status_code == 200
    assert first.json()["status"] == "cancelled"
    again = await client.post(f"/requests/{request_id}/cancel", headers=auth(requester))
    assert again.status_code == 200
