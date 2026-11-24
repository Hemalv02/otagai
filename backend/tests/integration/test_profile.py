import uuid

from tests.integration.conftest import auth, join_circle, make_circle, make_user


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
    repeated = await client.delete("/users/me", headers=auth(token))
    assert repeated.status_code == 204


async def test_profile_visibility_hides_optional_details_in_neighbour_reads(client):
    owner = await make_user(client, display_name="Alice")
    neighbour = await make_user(client, display_name="Bob")
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, neighbour)
    saved = await client.patch(
        "/users/me",
        headers=auth(owner),
        json={
            "display_name": " Alice Tanaka ",
            "age_band": "30s",
            "intro": " I like gardening. ",
            "happy_to_help_with": " Gardening ",
            "text_scale_percent": 150,
        },
    )
    assert saved.status_code == 200, saved.text
    own = saved.json()
    assert own["profile_details_visible"] is True
    assert own["text_scale_percent"] == 150
    url = f"/users/{own['id']}"
    default = (await client.get(url, headers=auth(neighbour))).json()
    assert default["intro"] == "I like gardening."
    assert "text_scale_percent" not in default

    hidden = await client.patch(
        "/users/me", headers=auth(owner), json={"profile_details_visible": False}
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["profile_details_visible"] is False
    read = await client.get(url, headers=auth(neighbour))
    assert read.status_code == 200, read.text
    assert read.json()["display_name"] == "Alice Tanaka"
    for optional in ("age_band", "intro", "happy_to_help_with"):
        assert read.json()[optional] is None
    self_read = (await client.get("/users/me", headers=auth(owner))).json()
    assert self_read["intro"] == "I like gardening."
    assert self_read["happy_to_help_with"] == "Gardening"
    assert self_read["text_scale_percent"] == 150
    assert self_read["profile_details_visible"] is False
    assert (await client.get(url, headers=auth(owner))).json()["age_band"] == "30s"

    shown = await client.patch(
        "/users/me", headers=auth(owner), json={"profile_details_visible": True}
    )
    assert shown.status_code == 200, shown.text
    assert (await client.get(url, headers=auth(neighbour))).json()["age_band"] == "30s"


async def test_visibility_preference_cannot_be_null(client):
    token = await make_user(client)
    response = await client.patch(
        "/users/me", headers=auth(token), json={"profile_details_visible": None}
    )
    assert response.status_code == 422
    assert "profile_details_visible cannot be empty" in response.json()["message"]


async def test_text_size_preference_cannot_be_null(client):
    token = await make_user(client)
    response = await client.patch(
        "/users/me", headers=auth(token), json={"text_scale_percent": None}
    )
    assert response.status_code == 422
    assert (await client.get("/users/me", headers=auth(token))).json()[
        "text_scale_percent"
    ] == 100


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
