import io

from PIL import Image

from tests.integration.conftest import auth, make_user


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
        "/users/me", headers=auth(other), json={"avatar_media_id": media_id}
    )
    assert response.status_code == 400
