from tests.integration.conftest import (
    auth,
    completed_exchange,
    join_circle,
    make_circle,
    make_user,
)
from tests.integration.family_fixtures import acting, give_grant


async def _user_id(client, token):
    return (await client.get("/users/me", headers=auth(token))).json()["id"]


async def _send_note(client, ctx, sender, *, allow_wall_sharing=False):
    response = await client.post(
        "/thank-yous",
        headers=auth(ctx[sender]),
        json={
            "exchange_id": ctx["exchange_id"],
            "gift_type": "note",
            "note": "Thank you for carrying the boxes!",
            "allow_wall_sharing": allow_wall_sharing,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _update_wall(client, token, note_id, show_on_wall=True):
    return await client.patch(
        f"/thank-yous/{note_id}",
        headers=auth(token),
        json={"show_on_wall": show_on_wall},
    )


async def test_private_note_is_preserved_and_cannot_be_published(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]
    note = await _send_note(client, ctx, "requester")
    denied = await _update_wall(client, helper, note["id"])
    assert denied.status_code == 409
    history = await client.get("/users/me/thank-yous", headers=auth(helper))
    assert [item["id"] for item in history.json()["items"]] == [note["id"]]
    receipt = await client.get(f"/thank-yous/{note['id']}", headers=auth(requester))
    assert receipt.status_code == 200


async def test_circle_wall_and_profile_require_both_participants_to_opt_in(client):
    ctx = await completed_exchange(client)
    requester, helper, circle_id = ctx["requester"], ctx["helper"], ctx["circle_id"]
    circle_reader = await make_user(client, display_name="Circle reader")
    other_reader = await make_user(client, display_name="Other circle reader")
    other_circle_id = await make_circle(client, helper)
    await join_circle(client, requester, circle_id, circle_reader)
    await join_circle(client, helper, other_circle_id, other_reader)
    helper_id = await _user_id(client, helper)
    note = await _send_note(client, ctx, "requester", allow_wall_sharing=True)

    wall_path = f"/circles/{circle_id}/thank-yous"
    profile_path = f"/users/{helper_id}/thank-yous"
    assert (await _update_wall(client, requester, note["id"])).status_code == 404
    for path in (wall_path, profile_path):
        before = await client.get(path, headers=auth(circle_reader))
        assert before.json()["items"] == []

    published = await _update_wall(client, helper, note["id"])
    assert published.status_code == 200, published.text
    assert published.json()["show_on_wall"] is True
    for path in (wall_path, profile_path):
        visible = await client.get(path, headers=auth(circle_reader))
        assert visible.status_code == 200, visible.text
        item = visible.json()["items"][0]
        assert item["id"] == note["id"]
        assert item["from_name"] == "Requester"
        assert item["to_name"] == "Helper"
        assert "amount_minor" not in item
        assert "exchange_id" not in item

    wrong_circle = await client.get(
        f"/circles/{other_circle_id}/thank-yous", headers=auth(other_reader)
    )
    assert wrong_circle.json()["items"] == []
    assert (await client.get(profile_path, headers=auth(other_reader))).json()[
        "items"
    ] == []
    assert (await client.get(wall_path, headers=auth(other_reader))).status_code == 404
    receipt = await client.get(f"/thank-yous/{note['id']}", headers=auth(circle_reader))
    assert receipt.status_code == 404

    unpublished = await _update_wall(client, helper, note["id"], False)
    assert unpublished.status_code == 200
    assert (await client.get(wall_path, headers=auth(circle_reader))).json()[
        "items"
    ] == []


async def test_circle_wall_filters_before_pagination(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]
    viewer = await make_user(client, display_name="Third neighbour")
    await join_circle(client, requester, ctx["circle_id"], viewer)
    first = await _send_note(client, ctx, "requester", allow_wall_sharing=True)
    second = await _send_note(client, ctx, "helper", allow_wall_sharing=True)
    assert (await _update_wall(client, helper, first["id"])).status_code == 200
    assert (await _update_wall(client, requester, second["id"])).status_code == 200
    path = f"/circles/{ctx['circle_id']}/thank-yous"
    page_one = (
        await client.get(path, headers=auth(viewer), params={"limit": 1})
    ).json()
    assert [item["id"] for item in page_one["items"]] == [second["id"]]
    page_two = (
        await client.get(
            path,
            headers=auth(viewer),
            params={"limit": 1, "cursor": page_one["next_cursor"]},
        )
    ).json()
    assert [item["id"] for item in page_two["items"]] == [first["id"]]
    assert page_two["next_cursor"] is None

    helper_id = await _user_id(client, helper)
    blocked = await client.post(
        "/users/me/blocks", headers=auth(viewer), json={"user_id": helper_id}
    )
    assert blocked.status_code == 201
    after = (await client.get(path, headers=auth(viewer), params={"limit": 1})).json()
    assert after == {"items": [], "next_cursor": None}


async def test_hobbies_follow_profile_visibility(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]
    helper_id = await _user_id(client, helper)
    public = f"/users/{helper_id}"
    data = {"hobbies": " Gardening and shogi "}
    saved = await client.patch("/users/me", headers=auth(helper), json=data)
    assert saved.status_code == 200, saved.text
    assert saved.json()["hobbies"] == "Gardening and shogi"
    assert (await client.get(public, headers=auth(requester))).json()[
        "hobbies"
    ] == "Gardening and shogi"
    hidden = await client.patch(
        "/users/me", headers=auth(helper), json={"profile_details_visible": False}
    )
    assert hidden.json()["hobbies"] == "Gardening and shogi"
    assert (await client.get(public, headers=auth(requester))).json()["hobbies"] is None


async def test_proxy_can_send_with_scope_but_cannot_share_for_a_member(client):
    ctx = await completed_exchange(client)
    sender = ctx["requester"]
    caretaker = await make_user(client, display_name="Caretaker")
    sender_id = await _user_id(client, sender)
    caretaker_id = await _user_id(client, caretaker)
    grant = await give_grant(
        client, sender, sender_id, caretaker_id, "can_view_activity"
    )
    headers = acting(caretaker, sender_id)
    payload = {
        "exchange_id": ctx["exchange_id"],
        "gift_type": "note",
        "note": "Thanks!",
    }
    denied = await client.post("/thank-yous", headers=headers, json=payload)
    assert denied.status_code == 403
    updated = await client.patch(
        f"/proxy-grants/{grant}", headers=auth(sender), json={"can_thank_and_pay": True}
    )
    assert updated.status_code == 200
    denied = await client.post(
        "/thank-yous", headers=headers, json={**payload, "allow_wall_sharing": True}
    )
    assert denied.status_code == 403
    sent = await client.post("/thank-yous", headers=headers, json=payload)
    assert sent.status_code == 201, sent.text
    assert sent.json()["from_user_id"] == sender_id
    assert sent.json()["allow_wall_sharing"] is False
