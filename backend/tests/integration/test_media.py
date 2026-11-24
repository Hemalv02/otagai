import io

from PIL import Image

from tests.integration.conftest import auth, join_circle, make_circle, make_user


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (800, 600), (10, 120, 90)).save(buffer, format="PNG")
    return buffer.getvalue()


async def test_upload_avatar_returns_variants(client):
    token = await make_user(client)
    response = await client.post(
        "/media",
        headers=auth(token),
        files={"file": ("a.png", _png(), "image/png")},
        data={"purpose": "avatar"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert set(body["urls"]) == {"thumb", "display"}
    assert body["width"] == 800 and body["height"] == 600


async def test_upload_rejects_non_image_415(client):
    token = await make_user(client)
    response = await client.post(
        "/media",
        headers=auth(token),
        files={"file": ("a.png", b"not an image", "image/png")},
        data={"purpose": "avatar"},
    )
    assert response.status_code == 415


async def test_media_requires_auth_401(client):
    response = await client.post(
        "/media",
        files={"file": ("a.png", _png(), "image/png")},
        data={"purpose": "avatar"},
    )
    assert response.status_code == 401


async def test_owner_reads_then_deletes_media(client):
    token = await make_user(client)
    media_id = (
        await client.post(
            "/media",
            headers=auth(token),
            files={"file": ("a.png", _png(), "image/png")},
            data={"purpose": "avatar"},
        )
    ).json()["id"]

    read = await client.get(f"/media/{media_id}", headers=auth(token))
    assert read.status_code == 200
    assert "thumb" in read.json()["urls"]

    deleted = await client.delete(f"/media/{media_id}", headers=auth(token))
    assert deleted.status_code == 204

    gone = await client.get(f"/media/{media_id}", headers=auth(token))
    assert gone.status_code == 404


async def test_stranger_cannot_read_media_404(client):
    owner = await make_user(client, display_name="Owner")
    media_id = (
        await client.post(
            "/media",
            headers=auth(owner),
            files={"file": ("a.png", _png(), "image/png")},
            data={"purpose": "avatar"},
        )
    ).json()["id"]
    stranger = await make_user(client, display_name="Stranger")
    response = await client.get(f"/media/{media_id}", headers=auth(stranger))
    assert response.status_code == 404


async def test_avatar_must_be_owned_media_400(client):
    owner = await make_user(client, display_name="Owner")
    media_id = (
        await client.post(
            "/media",
            headers=auth(owner),
            files={"file": ("a.png", _png(), "image/png")},
            data={"purpose": "avatar"},
        )
    ).json()["id"]
    other = await make_user(client, display_name="Other")
    # Other cannot set their avatar to media they do not own.
    response = await client.patch(
        "/users/me",
        headers=auth(other),
        json={"avatar_media_id": media_id},
    )
    assert response.status_code == 400


async def test_neighbours_can_only_read_a_visible_attached_avatar(client):
    owner = await make_user(client, display_name="Owner")
    neighbour = await make_user(client, display_name="Neighbour")
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, neighbour)
    uploaded = await client.post(
        "/media",
        headers=auth(owner),
        files={"file": ("a.png", _png(), "image/png")},
        data={"purpose": "avatar"},
    )
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]
    media_url = f"/media/{media_id}"
    assert (await client.get(media_url, headers=auth(neighbour))).status_code == 404

    attached = await client.patch(
        "/users/me",
        headers=auth(owner),
        json={"avatar_media_id": media_id, "profile_details_visible": True},
    )
    assert attached.status_code == 200, attached.text
    assert attached.json()["avatar_media_id"] == media_id
    profile_url = f"/users/{attached.json()['id']}"
    visible = (await client.get(profile_url, headers=auth(neighbour))).json()
    assert visible["avatar_url"] == uploaded.json()["urls"]["thumb"]
    assert (await client.get(media_url, headers=auth(neighbour))).status_code == 200

    hidden = await client.patch(
        "/users/me", headers=auth(owner), json={"profile_details_visible": False}
    )
    assert hidden.status_code == 200, hidden.text
    assert (await client.get(profile_url, headers=auth(neighbour))).json()[
        "avatar_url"
    ] is None
    assert (await client.get(media_url, headers=auth(neighbour))).status_code == 404
    assert (await client.get(media_url, headers=auth(owner))).status_code == 200

    removed = await client.patch(
        "/users/me",
        headers=auth(owner),
        json={"avatar_media_id": None, "profile_details_visible": True},
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["avatar_media_id"] is None
    assert (await client.get(profile_url, headers=auth(neighbour))).json()[
        "avatar_url"
    ] is None
    assert (await client.get(media_url, headers=auth(neighbour))).status_code == 404
