import uuid

from tests.integration.conftest import auth, make_user


async def test_create_profile_success(client):
    token = str(uuid.uuid4())
    response = await client.post(
        "/users",
        headers=auth(token),
        json={"display_name": "Aki", "preferred_language": "ja", "region": "jp"},
    )
    assert response.status_code == 201
    assert response.headers["Location"] == "/users/me"
    body = response.json()
    assert body["display_name"] == "Aki"
    assert "auth_user_id" not in body and "phone" not in body


async def test_second_profile_conflicts(client):
    token = await make_user(client)
    again = await client.post(
        "/users",
        headers=auth(token),
        json={"display_name": "Again", "preferred_language": "ja", "region": "jp"},
    )
    assert again.status_code == 409


async def test_create_profile_bad_body_422(client):
    token = str(uuid.uuid4())
    response = await client.post(
        "/users",
        headers=auth(token),
        json={"display_name": "", "preferred_language": "klingon", "region": "jp"},
    )
    assert response.status_code == 422
    assert "errors" in response.json()


async def test_me_requires_auth_401(client):
    response = await client.get("/users/me")
    assert response.status_code == 401


async def test_other_profile_hidden_is_404(client):
    alice = await make_user(client, display_name="Alice")
    bob_token = await make_user(client, display_name="Bob")
    me = await client.get("/users/me", headers=auth(alice))
    alice_id = me.json()["id"]
    # Bob shares no circle with Alice -> her profile is not visible.
    response = await client.get(f"/users/{alice_id}", headers=auth(bob_token))
    assert response.status_code == 404


async def test_patch_rejects_unknown_field_422(client):
    token = await make_user(client)
    response = await client.patch(
        "/users/me", headers=auth(token), json={"nickname": "x"}
    )
    assert response.status_code == 422


async def test_delete_account_then_inactive(client):
    token = await make_user(client)
    deleted = await client.delete("/users/me", headers=auth(token))
    assert deleted.status_code == 204
    after = await client.get("/users/me", headers=auth(token))
    assert after.status_code == 403


async def test_notification_preferences_round_trip(client):
    token = await make_user(client)
    other = await make_user(client)
    saved = await client.patch(
        "/users/me",
        headers=auth(token),
        json={
            "quiet_hours_start": "22:30:00",
            "quiet_hours_end": "07:15:00",
            "push_enabled": False,
        },
    )
    assert saved.status_code == 200, saved.text
    reloaded = (await client.get("/users/me", headers=auth(token))).json()
    assert reloaded["quiet_hours_start"] == "22:30:00"
    assert reloaded["quiet_hours_end"] == "07:15:00"
    assert reloaded["push_enabled"] is False
    other_profile = (await client.get("/users/me", headers=auth(other))).json()
    assert other_profile["quiet_hours_start"] is None
    assert other_profile["push_enabled"] is True
    assert (
        await client.get("/users/me/notifications", headers=auth(token))
    ).status_code == 200
    cleared = await client.patch(
        "/users/me",
        headers=auth(token),
        json={
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "push_enabled": True,
        },
    )
    assert cleared.status_code == 200, cleared.text
    after = (await client.get("/users/me", headers=auth(token))).json()
    assert after["quiet_hours_start"] is None and after["quiet_hours_end"] is None
    assert after["push_enabled"] is True
    invalid = await client.patch(
        "/users/me", headers=auth(token), json={"quiet_hours_start": "25:99"}
    )
    assert invalid.status_code == 422
