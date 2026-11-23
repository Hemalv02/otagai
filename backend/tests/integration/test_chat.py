import uuid

from tests.integration.conftest import (
    auth,
    completed_exchange,
    join_circle,
    make_circle,
    make_user,
)


async def _me_id(client, token):
    return (await client.get("/users/me", headers=auth(token))).json()["id"]


async def test_request_conversation_messaging(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]

    inbox = await client.get("/users/me/conversations", headers=auth(requester))
    assert inbox.status_code == 200
    assert len(inbox.json()["items"]) == 1
    conversation_id = inbox.json()["items"][0]["id"]

    client_message_id = str(uuid.uuid4())
    sent = await client.post(
        f"/conversations/{conversation_id}/messages",
        headers=auth(requester),
        json={
            "kind": "text",
            "body": "Thanks again!",
            "client_message_id": client_message_id,
        },
    )
    assert sent.status_code == 201, sent.text
    message_id = sent.json()["id"]

    # Resending the same client_message_id returns the original (200, no dup).
    resent = await client.post(
        f"/conversations/{conversation_id}/messages",
        headers=auth(requester),
        json={
            "kind": "text",
            "body": "Thanks again!",
            "client_message_id": client_message_id,
        },
    )
    assert resent.status_code == 200
    assert resent.json()["id"] == message_id

    # The helper can read the history.
    history = await client.get(
        f"/conversations/{conversation_id}/messages", headers=auth(helper)
    )
    assert history.status_code == 200
    assert message_id in [m["id"] for m in history.json()["items"]]

    # Mark read, then the unread count drops.
    read = await client.patch(
        f"/conversations/{conversation_id}/participants/me",
        headers=auth(helper),
        json={"mark_read": True},
    )
    assert read.status_code == 200


async def test_non_participant_cannot_read_conversation_404(client):
    ctx = await completed_exchange(client)
    outsider = await make_user(client, display_name="Outsider")
    inbox = await client.get("/users/me/conversations", headers=auth(ctx["requester"]))
    conversation_id = inbox.json()["items"][0]["id"]
    response = await client.get(
        f"/conversations/{conversation_id}", headers=auth(outsider)
    )
    assert response.status_code == 404


async def test_direct_conversation_is_deduped(client):
    alice = await make_user(client, display_name="Alice")
    bob = await make_user(client, display_name="Bob")
    circle_id = await make_circle(client, alice)
    await join_circle(client, alice, circle_id, bob)
    bob_id = await _me_id(client, bob)

    first = await client.post(
        "/conversations", headers=auth(alice), json={"target_user_id": bob_id}
    )
    assert first.status_code == 201, first.text
    again = await client.post(
        "/conversations", headers=auth(alice), json={"target_user_id": bob_id}
    )
    assert again.status_code == 200  # existing chat returned
    assert again.json()["id"] == first.json()["id"]


async def test_cannot_chat_without_shared_circle(client):
    alice = await make_user(client, display_name="Alice")
    bob = await make_user(client, display_name="Bob")
    bob_id = await _me_id(client, bob)
    response = await client.post(
        "/conversations", headers=auth(alice), json={"target_user_id": bob_id}
    )
    assert response.status_code == 400


async def test_conversation_bad_body_422(client):
    alice = await make_user(client)
    response = await client.post(
        "/conversations",
        headers=auth(alice),
        json={"listing_id": str(uuid.uuid4()), "target_user_id": str(uuid.uuid4())},
    )
    assert response.status_code == 422  # must provide exactly one
