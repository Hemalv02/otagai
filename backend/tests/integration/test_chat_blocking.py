import uuid

import pytest
from fastapi import Request

from app.repositories.users import UserRepository
from app.routes.chat.route import conversation_events
from app.services.actors.service import Actor
from tests.integration.conftest import auth, matched_exchange


async def test_block_hides_chat_and_prevents_new_activity_until_unblocked(client):
    loan = await matched_exchange(client, loan=True)
    borrower = auth(loan["requester"])
    lender = auth(loan["helper"])
    lender_id = (await client.get("/users/me", headers=lender)).json()["id"]
    inbox = await client.get("/users/me/conversations", headers=borrower)
    conversation = inbox.json()["items"][0]
    path = f"/conversations/{conversation['id']}"

    sent = await client.post(
        f"{path}/messages", headers=lender, json={"body": "Pickup confirmed."}
    )
    assert sent.status_code == 201
    message_id = sent.json()["id"]
    counts = await client.get("/users/me/unread-counts", headers=borrower)
    assert counts.json()["messages"] == 1

    blocked = await client.post(
        "/users/me/blocks", headers=borrower, json={"user_id": lender_id}
    )
    assert blocked.status_code == 201

    for participant in (borrower, lender):
        inbox = await client.get("/users/me/conversations?limit=1", headers=participant)
        assert inbox.status_code == 200
        assert inbox.json()["items"] == []
        for suffix in ("", "/messages", "/events"):
            hidden = await client.get(f"{path}{suffix}", headers=participant)
            assert hidden.status_code == 404
        denied = await client.post(
            f"{path}/messages", headers=participant, json={"body": "New message."}
        )
        assert denied.status_code == 404

    marked = await client.patch(
        f"{path}/participants/me", headers=borrower, json={"mark_read": True}
    )
    assert marked.status_code == 404
    edited = await client.patch(
        f"{path}/messages/{message_id}", headers=lender, json={"body": "Edited."}
    )
    assert edited.status_code == 404
    counts = await client.get("/users/me/unread-counts", headers=borrower)
    assert counts.json()["messages"] == 0

    unblocked = await client.delete(f"/users/me/blocks/{lender_id}", headers=borrower)
    assert unblocked.status_code == 204
    history = await client.get(f"{path}/messages", headers=borrower)
    assert history.status_code == 200
    user_messages = [item for item in history.json()["items"] if item["kind"] == "text"]
    assert [(item["id"], item["body"]) for item in user_messages] == [
        (message_id, "Pickup confirmed.")
    ]
    counts = await client.get("/users/me/unread-counts", headers=borrower)
    assert counts.json()["messages"] == 1


async def test_open_conversation_stream_ends_when_a_participant_blocks(client):
    loan = await matched_exchange(client, loan=True)
    borrower = auth(loan["requester"])
    lender = auth(loan["helper"])
    borrower_id = (await client.get("/users/me", headers=borrower)).json()["id"]
    lender_id = (await client.get("/users/me", headers=lender)).json()["id"]
    inbox = await client.get("/users/me/conversations", headers=borrower)
    conversation_id = uuid.UUID(inbox.json()["items"][0]["id"])
    database = client._transport.app._app.state.database
    async with database.session() as session:
        user = await UserRepository(session).get(uuid.UUID(borrower_id))
    assert user is not None

    async def receive():
        return {"type": "http.request"}

    response = await conversation_events(
        conversation_id,
        Request({"type": "http"}, receive),
        Actor(user=user, subject=user, grant=None),
        database,
    )
    stream = aiter(response.body_iterator)
    ready = await anext(stream)
    assert ready.startswith("event: ready\n")

    blocked = await client.post(
        "/users/me/blocks", headers=borrower, json={"user_id": lender_id}
    )
    assert blocked.status_code == 201
    with pytest.raises(StopAsyncIteration):
        await anext(stream)
