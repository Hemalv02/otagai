from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def _listing(client, token):
    category_id = (
        await client.get("/categories?kind=tool", headers=auth(token))
    ).json()["items"][0]["id"]
    return (
        await client.post(
            "/listings",
            headers=auth(token),
            json={
                "kind": "tool",
                "category_id": category_id,
                "title": "Ladder",
                "lang": "ja",
                "lend_mode": "lend",
            },
        )
    ).json()["id"]


async def test_replace_parts_and_media(client):
    owner = await make_user(client)
    await make_circle(client, owner)
    listing_id = await _listing(client, owner)

    parts = await client.put(
        f"/listings/{listing_id}/parts",
        headers=auth(owner),
        json={"parts": [{"label": "Rung", "quantity": 8}, {"label": "Foot"}]},
    )
    assert parts.status_code == 200
    assert len(parts.json()["parts"]) == 2

    media = await client.put(
        f"/listings/{listing_id}/media", headers=auth(owner), json={"media_ids": []}
    )
    assert media.status_code == 200
    assert media.json()["photos"] == []


async def test_my_listings_and_delete(client):
    owner = await make_user(client)
    await make_circle(client, owner)
    listing_id = await _listing(client, owner)

    mine = await client.get("/users/me/listings", headers=auth(owner))
    assert mine.status_code == 200
    assert listing_id in [listing["id"] for listing in mine.json()["items"]]

    deleted = await client.delete(f"/listings/{listing_id}", headers=auth(owner))
    assert deleted.status_code == 204

    gone = await client.get(f"/listings/{listing_id}", headers=auth(owner))
    assert gone.status_code == 404


async def test_user_listings_visible_to_circle_mate(client):
    owner = await make_user(client, display_name="Owner")
    mate = await make_user(client, display_name="Mate")
    circle_id = await make_circle(client, owner)
    await join_circle(client, owner, circle_id, mate)
    listing_id = await _listing(client, owner)
    owner_id = (await client.get("/users/me", headers=auth(owner))).json()["id"]

    listed = await client.get(
        f"/users/{owner_id}/listings", headers=auth(mate)
    )
    assert listed.status_code == 200
    assert listing_id in [listing["id"] for listing in listed.json()["items"]]
