from tests.integration.conftest import (
    auth,
    join_circle,
    make_circle,
    make_user,
    matched_exchange,
)


async def _listing(client, token, *, kind="tool", title="Ladder"):
    categories = await client.get(
        "/categories", headers=auth(token), params={"kind": kind}
    )
    assert categories.status_code == 200, categories.text
    category_id = categories.json()["items"][0]["id"]
    created = await client.post(
        "/listings",
        headers=auth(token),
        json={
            "kind": kind,
            "category_id": category_id,
            "title": title,
            "lang": "ja",
            "lend_mode": "lend" if kind == "tool" else "help_only",
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


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


async def test_my_listings_filters_kind_status_and_pages_within_owner(client):
    owner = await make_user(client, display_name="Owner")
    peer = await make_user(client, display_name="Peer")
    circle_id = await make_circle(client, owner)
    await join_circle(client, owner, circle_id, peer)

    older_tool = await _listing(client, owner, title="Hand saw")
    active_tool = await _listing(client, owner, title="Wrench")
    skill = await _listing(client, owner, kind="skill", title="Cooking")
    newer_tool = await _listing(client, owner, title="Drill")
    peer_tool = await _listing(client, peer, title="Measuring tape")
    for token, listing_id in (
        (owner, older_tool),
        (owner, skill),
        (owner, newer_tool),
        (peer, peer_tool),
    ):
        paused = await client.post(f"/listings/{listing_id}/pause", headers=auth(token))
        assert paused.status_code == 200, paused.text

    filters = {"kind": "tool", "status": "paused", "limit": 1}
    first = await client.get("/users/me/listings", headers=auth(owner), params=filters)
    assert first.status_code == 200, first.text
    first_page = first.json()
    assert [item["id"] for item in first_page["items"]] == [newer_tool]
    assert first_page["next_cursor"]

    second = await client.get(
        "/users/me/listings",
        headers=auth(owner),
        params={**filters, "cursor": first_page["next_cursor"]},
    )
    assert second.status_code == 200, second.text
    assert [item["id"] for item in second.json()["items"]] == [older_tool]
    assert second.json()["next_cursor"] is None

    unfiltered = await client.get("/users/me/listings", headers=auth(owner))
    assert unfiltered.status_code == 200, unfiltered.text
    assert [item["id"] for item in unfiltered.json()["items"]] == [
        newer_tool,
        skill,
        active_tool,
        older_tool,
    ]

    skills = await client.get(
        "/users/me/listings",
        headers=auth(owner),
        params={"kind": "skill", "status": "paused,active"},
    )
    assert skills.status_code == 200, skills.text
    assert [item["id"] for item in skills.json()["items"]] == [skill]

    tools = await client.get(
        "/users/me/listings",
        headers=auth(owner),
        params={"kind": "tool", "status": "paused,active"},
    )
    assert tools.status_code == 200, tools.text
    assert [item["id"] for item in tools.json()["items"]] == [
        newer_tool,
        active_tool,
        older_tool,
    ]

    invalid = await client.get(
        "/users/me/listings", headers=auth(owner), params={"kind": "bogus"}
    )
    assert invalid.status_code == 422, invalid.text


async def test_lent_out_listing_is_visible_but_read_only(client):
    exchange = await matched_exchange(client, loan=True)
    helper = auth(exchange["helper"])
    requester = auth(exchange["requester"])
    handed = await client.post(
        f"/exchanges/{exchange['exchange_id']}/hand-over", headers=helper
    )
    assert handed.status_code == 200, handed.text
    assert handed.json()["status"] == "active"
    listing_id = handed.json()["listing_id"]
    assert listing_id
    path = f"/listings/{listing_id}"
    filters = {"kind": "tool", "status": "lent_out"}

    mine = await client.get("/users/me/listings", headers=helper, params=filters)
    assert mine.status_code == 200, mine.text
    (summary,) = mine.json()["items"]
    assert summary["id"] == listing_id
    assert summary["status"] == "lent_out"

    detail = await client.get(path, headers=helper)
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "lent_out"

    requester_list = await client.get(
        "/users/me/listings", headers=requester, params=filters
    )
    assert requester_list.status_code == 200, requester_list.text
    assert requester_list.json()["items"] == []

    for headers, expected_status in ((helper, 409), (requester, 404)):
        edited = await client.patch(path, headers=headers, json={"title": "New title"})
        assert edited.status_code == expected_status, edited.text
        paused = await client.post(f"{path}/pause", headers=headers)
        assert paused.status_code == expected_status, paused.text
        resumed = await client.post(f"{path}/resume", headers=headers)
        assert resumed.status_code == expected_status, resumed.text
        deleted = await client.delete(path, headers=headers)
        assert deleted.status_code == expected_status, deleted.text

    still_mine = await client.get("/users/me/listings", headers=helper, params=filters)
    assert still_mine.status_code == 200, still_mine.text
    assert still_mine.json()["items"] == [summary]


async def test_user_listings_visible_to_circle_mate(client):
    owner = await make_user(client, display_name="Owner")
    mate = await make_user(client, display_name="Mate")
    circle_id = await make_circle(client, owner)
    await join_circle(client, owner, circle_id, mate)
    listing_id = await _listing(client, owner)
    owner_id = (await client.get("/users/me", headers=auth(owner))).json()["id"]

    listed = await client.get(f"/users/{owner_id}/listings", headers=auth(mate))
    assert listed.status_code == 200
    assert listing_id in [listing["id"] for listing in listed.json()["items"]]
