from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def _req_and_offer(client):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Original wording", "lang": "ja"},
        )
    ).json()["id"]
    return requester, helper, request_id


async def test_patch_request_wording(client):
    requester, _, request_id = await _req_and_offer(client)
    patched = await client.patch(
        f"/requests/{request_id}",
        headers=auth(requester),
        json={"polite_text": "Could you kindly help?"},
    )
    assert patched.status_code == 200
    assert patched.json()["polite_text"] == "Could you kindly help?"


async def test_list_responses_requester_only(client):
    requester, helper, request_id = await _req_and_offer(client)
    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json={"kind": "offer", "message": "Happy to"},
        )
    ).json()["id"]

    listed = await client.get(
        f"/requests/{request_id}/responses", headers=auth(requester)
    )
    assert listed.status_code == 200
    assert response_id in [r["id"] for r in listed.json()["items"]]

    # A non-requester cannot list all responses.
    forbidden = await client.get(
        f"/requests/{request_id}/responses", headers=auth(helper)
    )
    assert forbidden.status_code == 404


async def test_patch_and_withdraw_response(client):
    _requester, helper, request_id = await _req_and_offer(client)
    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json={"kind": "offer"},
        )
    ).json()["id"]

    edited = await client.patch(
        f"/requests/{request_id}/responses/{response_id}",
        headers=auth(helper),
        json={"message": "Updated note"},
    )
    assert edited.status_code == 200
    assert edited.json()["message"] == "Updated note"

    withdrawn = await client.post(
        f"/requests/{request_id}/responses/{response_id}/withdraw",
        headers=auth(helper),
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"


async def test_widen_request(client):
    requester, _, request_id = await _req_and_offer(client)
    widened = await client.post(
        f"/requests/{request_id}/widen", headers=auth(requester)
    )
    assert widened.status_code == 200


async def test_mark_received_seen_and_hidden(client):
    _requester, helper, request_id = await _req_and_offer(client)
    patched = await client.patch(
        f"/users/me/received-requests/{request_id}",
        headers=auth(helper),
        json={"seen": True, "hidden": True},
    )
    assert patched.status_code == 200
    assert patched.json()["seen"] is True
    assert patched.json()["hidden"] is True
