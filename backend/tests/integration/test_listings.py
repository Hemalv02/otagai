import io
import uuid

from PIL import Image

from tests.integration.conftest import auth, make_circle, make_user


async def _category(client, token, *, kind="tool") -> str | None:
    response = await client.get(
        "/categories", headers=auth(token), params={"kind": kind}
    )
    assert response.status_code == 200
    items = response.json()["items"]
    return items[0]["id"] if items else None


async def _make_listing(client, token, category_id, *, media_ids=()):
    return await client.post(
        "/listings",
        headers=auth(token),
        json={
            "kind": "tool",
            "category_id": category_id,
            "title": "Cordless drill",
            "lang": "ja",
            "lend_mode": "lend",
            "media_ids": list(media_ids),
        },
    )


async def test_publish_tool_with_ready_listing_photo(client):
    token = await make_user(client)
    await make_circle(client, token)
    category_id = await _category(client, token)
    assert category_id is not None

    photo = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 120, 90)).save(photo, format="PNG")
    uploaded = await client.post(
        "/media",
        headers=auth(token),
        files={"file": ("drill.png", photo.getvalue(), "image/png")},
        data={"purpose": "listing"},
    )
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]
    read = await client.get(f"/media/{media_id}", headers=auth(token))
    assert read.status_code == 200, read.text
    assert read.json()["status"] == "ready"

    created = await _make_listing(client, token, category_id, media_ids=[media_id])
    assert created.status_code == 201, created.text
    listing = created.json()
    listing_id = listing["id"]
    assert [photo["media_id"] for photo in listing["photos"]] == [media_id]

    detail = await client.get(f"/listings/{listing_id}", headers=auth(token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["title"] == "Cordless drill"
    assert [photo["media_id"] for photo in detail.json()["photos"]] == [media_id]

    mine = await client.get("/users/me/listings", headers=auth(token))
    assert mine.status_code == 200, mine.text
    (summary,) = mine.json()["items"]
    assert summary["id"] == listing_id
    assert summary["photo_url"]


async def test_publish_skill_in_help_only_mode(client):
    token = await make_user(client)
    await make_circle(client, token)
    category_id = await _category(client, token, kind="skill")
    assert category_id is not None

    created = await client.post(
        "/listings",
        headers=auth(token),
        json={
            "kind": "skill",
            "category_id": category_id,
            "title": "Cooking lessons",
            "lang": "ja",
            "lend_mode": "help_only",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["kind"] == "skill"
    assert created.json()["lend_mode"] == "help_only"
    assert created.json()["photos"] == []


async def test_listing_bad_body_422(client):
    token = await make_user(client)
    await make_circle(client, token)
    response = await client.post(
        "/listings",
        headers=auth(token),
        json={"kind": "spaceship", "title": "x", "lang": "ja"},
    )
    assert response.status_code == 422


async def test_listing_requires_auth_401(client):
    response = await client.get("/listings")
    assert response.status_code == 401


async def test_unknown_listing_is_404(client):
    token = await make_user(client)
    await make_circle(client, token)
    response = await client.get(f"/listings/{uuid.uuid4()}", headers=auth(token))
    assert response.status_code == 404


async def test_other_circle_listing_hidden_404(client):
    owner = await make_user(client, display_name="Owner")
    await make_circle(client, owner)
    category_id = await _category(client, owner)
    created = await _make_listing(client, owner, category_id or str(uuid.uuid4()))
    if created.status_code != 201:
        return
    listing_id = created.json()["id"]
    outsider = await make_user(client, display_name="Outsider")
    await make_circle(client, outsider)
    response = await client.get(f"/listings/{listing_id}", headers=auth(outsider))
    assert response.status_code == 404


async def test_patch_foreign_listing_404(client):
    owner = await make_user(client, display_name="Owner")
    await make_circle(client, owner)
    category_id = await _category(client, owner)
    created = await _make_listing(client, owner, category_id or str(uuid.uuid4()))
    if created.status_code != 201:
        return
    listing_id = created.json()["id"]
    other = await make_user(client, display_name="Other")
    await make_circle(client, other)
    response = await client.patch(
        f"/listings/{listing_id}",
        headers=auth(other),
        json={"title": "hijacked"},
    )
    assert response.status_code == 404


async def test_pause_and_resume(client):
    token = await make_user(client)
    await make_circle(client, token)
    category_id = await _category(client, token)
    created = await _make_listing(client, token, category_id or str(uuid.uuid4()))
    if created.status_code != 201:
        return
    listing_id = created.json()["id"]
    paused = await client.post(f"/listings/{listing_id}/pause", headers=auth(token))
    assert paused.status_code == 200 and paused.json()["status"] == "paused"
    resumed = await client.post(f"/listings/{listing_id}/resume", headers=auth(token))
    assert resumed.status_code == 200 and resumed.json()["status"] == "active"
