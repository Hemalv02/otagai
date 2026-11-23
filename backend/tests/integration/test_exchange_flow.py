from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def _matched_exchange(client):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Carry boxes", "lang": "ja"},
        )
    ).json()["id"]
    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json={"kind": "offer"},
        )
    ).json()["id"]
    accepted = await client.post(
        f"/requests/{request_id}/responses/{response_id}/accept",
        headers=auth(requester),
    )
    assert accepted.status_code == 200
    exchanges = await client.get("/users/me/exchanges", headers=auth(helper))
    assert exchanges.status_code == 200
    exchange_id = exchanges.json()["items"][0]["id"]
    return requester, helper, exchange_id


async def test_full_exchange_completes_and_updates_pair(client):
    requester, helper, exchange_id = await _matched_exchange(client)

    handed = await client.post(
        f"/exchanges/{exchange_id}/hand-over", headers=auth(helper)
    )
    assert handed.status_code == 200
    assert handed.json()["status"] == "active"

    first = await client.post(
        f"/exchanges/{exchange_id}/confirm", headers=auth(requester)
    )
    assert first.status_code == 200
    assert first.json()["status"] == "active"  # waiting on the other side

    second = await client.post(
        f"/exchanges/{exchange_id}/confirm", headers=auth(helper)
    )
    assert second.status_code == 200
    assert second.json()["status"] == "completed"

    neighbours = await client.get("/users/me/neighbours", headers=auth(requester))
    assert neighbours.status_code == 200
    items = neighbours.json()["items"]
    assert len(items) == 1
    assert items[0]["they_helped_me"] == 1


async def test_cancel_after_handover_is_409(client):
    _, helper, exchange_id = await _matched_exchange(client)
    handed = await client.post(
        f"/exchanges/{exchange_id}/hand-over", headers=auth(helper)
    )
    assert handed.status_code == 200
    cancelled = await client.post(
        f"/exchanges/{exchange_id}/cancel", headers=auth(helper)
    )
    assert cancelled.status_code == 409


async def test_non_participant_cannot_see_exchange_404(client):
    _, _, exchange_id = await _matched_exchange(client)
    outsider = await make_user(client, display_name="Outsider")
    response = await client.get(f"/exchanges/{exchange_id}", headers=auth(outsider))
    assert response.status_code == 404


async def test_thank_you_requires_completed_exchange_409(client):
    requester, _, exchange_id = await _matched_exchange(client)
    # Exchange is only scheduled -> thanking is premature.
    response = await client.post(
        "/thank-yous",
        headers=auth(requester),
        json={"exchange_id": exchange_id, "gift_type": "note", "note": "thanks"},
    )
    assert response.status_code == 409
