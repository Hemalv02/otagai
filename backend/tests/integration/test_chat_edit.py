from tests.integration.conftest import auth, completed_exchange


async def _conversation(client, token):
    inbox = await client.get("/users/me/conversations", headers=auth(token))
    return inbox.json()["items"][0]["id"]


async def test_edit_and_delete_own_message(client):
    ctx = await completed_exchange(client)
    requester = ctx["requester"]
    conversation_id = await _conversation(client, requester)

    sent = await client.post(
        f"/conversations/{conversation_id}/messages",
        headers=auth(requester),
        json={"kind": "text", "body": "Original"},
    )
    assert sent.status_code == 201
    message_id = sent.json()["id"]

    edited = await client.patch(
        f"/conversations/{conversation_id}/messages/{message_id}",
        headers=auth(requester),
        json={"body": "Edited"},
    )
    assert edited.status_code == 200
    assert edited.json()["body"] == "Edited"
    assert edited.json()["edited_at"] is not None

    deleted = await client.delete(
        f"/conversations/{conversation_id}/messages/{message_id}",
        headers=auth(requester),
    )
    assert deleted.status_code == 204


async def test_cannot_edit_others_message_404(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]
    conversation_id = await _conversation(client, requester)
    message_id = (
        await client.post(
            f"/conversations/{conversation_id}/messages",
            headers=auth(requester),
            json={"kind": "text", "body": "Mine"},
        )
    ).json()["id"]
    response = await client.patch(
        f"/conversations/{conversation_id}/messages/{message_id}",
        headers=auth(helper),
        json={"body": "Hijack"},
    )
    assert response.status_code == 404
