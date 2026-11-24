from tests.integration.conftest import auth, make_user
from tests.integration.test_listing_drafts import category_id


async def create(client, token, slug, lend_mode, kind="tool"):
    response = await client.post(
        "/listings",
        headers=auth(token),
        json={
            "kind": kind,
            "category_id": await category_id(client, token, slug),
            "title": "Item",
            "lang": "en",
            "lend_mode": lend_mode,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_risky_listing_is_stored_as_help_only(client):
    token = await make_user(client, language="en")
    listing = await create(client, token, "ladders", "lend")
    assert listing["lend_mode"] == "help_only"


async def test_patching_a_risky_listing_to_lend_keeps_help_only(client):
    token = await make_user(client, language="en")
    listing = await create(client, token, "ladders", "lend")
    response = await client.patch(
        f"/listings/{listing['id']}", headers=auth(token), json={"lend_mode": "lend"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["lend_mode"] == "help_only"


async def test_patching_a_safe_listing_to_lend_or_help_is_allowed(client):
    token = await make_user(client, language="en")
    listing = await create(client, token, "hand_tools", "lend")
    response = await client.patch(
        f"/listings/{listing['id']}",
        headers=auth(token),
        json={"lend_mode": "lend_or_help"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["lend_mode"] == "lend_or_help"


async def test_patching_a_skill_to_lend_keeps_help_only(client):
    token = await make_user(client, language="en")
    categories = await client.get("/categories?kind=skill", headers=auth(token))
    skill_category = categories.json()["items"][0]["id"]
    created = await client.post(
        "/listings",
        headers=auth(token),
        json={
            "kind": "skill",
            "category_id": skill_category,
            "title": "Gardening",
            "lang": "en",
            "lend_mode": "lend",
        },
    )
    assert created.status_code == 201, created.text
    response = await client.patch(
        f"/listings/{created.json()['id']}",
        headers=auth(token),
        json={"lend_mode": "lend"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["lend_mode"] == "help_only"
