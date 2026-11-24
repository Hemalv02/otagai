from tests.integration.conftest import auth, completed_exchange, make_user


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


async def test_chat_translation_is_cached_and_invalidated_by_edits(client, monkeypatch):
    from app.services.ai.helpers import Translation
    from app.services.chat import service

    calls = []

    async def translate(_settings, request):
        calls.append(request.text)
        return Translation(translated=f"VI {request.text}")

    monkeypatch.setattr(service, "draft_translation", translate, raising=False)
    ctx = await completed_exchange(client)
    sender, reader = ctx["requester"], ctx["helper"]
    outsider = await make_user(client)
    conversation = await _conversation(client, sender)
    base = f"/conversations/{conversation}/messages"
    posted = await client.post(
        base,
        headers=auth(sender),
        json={"kind": "text", "body": "Bonjour", "lang": "vi"},
    )
    assert posted.status_code == 201, posted.text
    message = f"{base}/{posted.json()['id']}"
    path = f"{message}/translations"
    body = {"target_language": "bn"}
    assert (
        await client.post(path, headers=auth(outsider), json=body)
    ).status_code == 404
    for _ in range(2):
        result = await client.post(path, headers=auth(reader), json=body)
        assert result.status_code == 200, result.text
        assert result.json() == {"translated": "VI Bonjour"}
    assert calls == ["Bonjour"]
    await client.patch(message, headers=auth(sender), json={"body": "Changed"})
    result = await client.post(path, headers=auth(reader), json=body)
    assert result.status_code == 200, result.text
    assert result.json() == {"translated": "VI Changed"}
    assert calls == ["Bonjour", "Changed"]
    assert (await client.delete(message, headers=auth(sender))).status_code == 204
    assert (await client.post(path, headers=auth(reader), json=body)).status_code == 404
