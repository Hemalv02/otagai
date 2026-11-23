from tests.integration.conftest import auth, make_user


async def _other_id(client, token) -> str:
    me = await client.get("/users/me", headers=auth(token))
    return me.json()["id"]


async def test_block_list_unblock(client):
    me = await make_user(client, display_name="Me")
    other = await make_user(client, display_name="Other")
    other_id = await _other_id(client, other)

    blocked = await client.post(
        "/users/me/blocks", headers=auth(me), json={"user_id": other_id}
    )
    assert blocked.status_code == 201
    assert blocked.json()["id"] == other_id

    # Blocking again is idempotent -> 200, not a duplicate.
    again = await client.post(
        "/users/me/blocks", headers=auth(me), json={"user_id": other_id}
    )
    assert again.status_code == 200

    listed = await client.get("/users/me/blocks", headers=auth(me))
    assert listed.status_code == 200
    assert other_id in [item["id"] for item in listed.json()["items"]]

    removed = await client.delete(f"/users/me/blocks/{other_id}", headers=auth(me))
    assert removed.status_code == 204


async def test_cannot_block_self_400(client):
    me = await make_user(client)
    my_id = await _other_id(client, me)
    response = await client.post(
        "/users/me/blocks", headers=auth(me), json={"user_id": my_id}
    )
    assert response.status_code == 400


async def test_blocks_require_auth_401(client):
    response = await client.get("/users/me/blocks")
    assert response.status_code == 401


async def test_report_bad_body_422(client):
    me = await make_user(client)
    response = await client.post(
        "/reports",
        headers=auth(me),
        json={"target_type": "alien", "reason": "spam"},
    )
    assert response.status_code == 422
