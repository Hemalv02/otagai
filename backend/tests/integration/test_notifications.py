from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def _request_with_offer(client):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Help", "lang": "ja"},
        )
    ).json()["id"]
    await client.post(
        f"/requests/{request_id}/responses",
        headers=auth(helper),
        json={"kind": "offer"},
    )
    return requester, helper


async def test_notifications_list_read_and_counts(client):
    requester, _helper = await _request_with_offer(client)

    # The offer created a RESPONSE_RECEIVED notification for the requester.
    listed = await client.get("/users/me/notifications", headers=auth(requester))
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) >= 1
    notification_id = items[0]["id"]

    counts = await client.get("/users/me/unread-counts", headers=auth(requester))
    assert counts.status_code == 200
    assert counts.json()["notifications"] >= 1

    read = await client.patch(
        f"/users/me/notifications/{notification_id}", headers=auth(requester)
    )
    assert read.status_code == 200
    assert read.json()["read_at"] is not None

    all_read = await client.post(
        "/users/me/notifications/read-all", headers=auth(requester)
    )
    assert all_read.status_code == 204

    after = await client.get("/users/me/unread-counts", headers=auth(requester))
    assert after.json()["notifications"] == 0


async def test_foreign_notification_404(client):
    requester, helper = await _request_with_offer(client)
    notification_id = (
        await client.get("/users/me/notifications", headers=auth(requester))
    ).json()["items"][0]["id"]
    # The helper cannot mark the requester's notification read.
    response = await client.patch(
        f"/users/me/notifications/{notification_id}", headers=auth(helper)
    )
    assert response.status_code == 404


async def test_notifications_require_auth_401(client):
    assert (await client.get("/users/me/notifications")).status_code == 401
    assert (await client.get("/users/me/unread-counts")).status_code == 401


async def test_home_aggregates(client):
    _requester, helper = await _request_with_offer(client)
    home = await client.get("/users/me/home", headers=auth(helper))
    assert home.status_code == 200
    body = home.json()
    assert "received_requests" in body
    assert "active_exchanges" in body
    assert "due_soon" in body
