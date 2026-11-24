import json
import uuid

from app.services.ai import request_writer
from tests.integration.conftest import auth, join_circle, make_circle, make_user
from tests.integration.family_fixtures import acted_by, acting, give_grant, me_id
from tests.integration.test_assistant import intent, stub_agent


def stub_wording(monkeypatch, *, when_text=None):
    calls = []

    async def draft(settings, *, instructions, user_input, output_type, **kwargs):
        calls.append((instructions, json.loads(user_input)))
        return output_type(
            title="棚を運ぶお手伝い",
            message="棚を運ぶのをお手伝いいただけますでしょうか。",
            when_text=when_text,
        )

    monkeypatch.setattr(request_writer, "draft", draft)
    return calls


async def test_assistant_rewrite_requires_owned_review_and_keeps_confirmation_explicit(
    client, monkeypatch
):
    user = await make_user(client, language="en")
    circle = await make_circle(client, user)
    other = await make_user(client, language="en")
    stub_agent(
        monkeypatch,
        intent(
            draft={
                "kind": "help",
                "title": "Move a shelf",
                "description": "Could you help me move a shelf?",
                "when_text": "Saturday",
            }
        ),
    )
    turn = (
        await client.post(
            "/assistant/turns",
            headers=auth(user),
            json={"text": "Help me ask to move a shelf Saturday"},
        )
    ).json()
    calls = stub_wording(monkeypatch, when_text="土曜日")
    rewrite = {
        "text": "Could you help me move a shelf?",
        "title": "Move a shelf",
        "when_text": "Saturday",
        "language": "ja",
        "relationship": "elder",
    }
    path = f"/assistant/turns/{turn['id']}/drafts"
    assert (
        await client.post(path, headers=auth(other), json=rewrite)
    ).status_code == 404
    assert calls == []
    suggestion = await client.post(path, headers=auth(user), json=rewrite)
    assert suggestion.status_code == 200, suggestion.text
    wording = suggestion.json()
    assert wording["language"] == "ja"
    assert wording["tone"] == "keigo"
    assert wording["when_text"] == "土曜日"
    assert "keigo" in calls[0][0]
    assert calls[0][1]["text"] == rewrite["text"]
    assert (await client.get("/users/me/requests", headers=auth(user))).json()[
        "items"
    ] == []

    posted = await client.post(
        f"/assistant/turns/{turn['id']}/confirm",
        headers=auth(user),
        json={
            "kind": "help",
            "text": "少しだけ棚を運ぶのをお手伝いいただけますか。\n\n土曜日",
            "title": wording["title"],
            "language": wording["language"],
            "tone": wording["tone"],
            "home_circle_id": circle,
        },
    )
    assert posted.status_code == 201, posted.text
    assert posted.json()["lang"] == "ja"
    detail = await client.get(f"/requests/{posted.json()['id']}", headers=auth(user))
    assert detail.json()["tone"] == "keigo"
    history = await client.get(
        f"/assistant/threads/{turn['thread_id']}/turns", headers=auth(user)
    )
    saved = history.json()["items"][0]["draft"]
    assert saved["title"] == wording["title"]
    assert saved["language"] == "ja"
    assert saved["description"] == detail.json()["raw_text"]


async def test_family_rewrite_uses_subject_language_and_requires_scope_and_destination(
    client, monkeypatch
):
    member = await make_user(client, language="bn")
    caretaker = await make_user(client, language="en")
    outsider = await make_user(client, language="en")
    member_id = await me_id(client, member)
    caretaker_id = await me_id(client, caretaker)
    circle = await make_circle(client, outsider)
    other_circle = await make_circle(client, caretaker)
    await join_circle(client, outsider, circle, member)

    path = "/ai/request-drafts"
    payload = {
        "text": "A hand moving a shelf on Saturday",
        "home_circle_id": circle,
        "relationship": "family",
    }
    headers = acting(caretaker, member_id)
    calls = stub_wording(monkeypatch)
    response = await client.post(path, headers=headers, json=payload)
    assert response.status_code == 403, response.text
    grant = await give_grant(
        client, member, member_id, caretaker_id, "can_post_requests"
    )
    response = await client.post(
        path, headers=headers, json={**payload, "home_circle_id": other_circle}
    )
    assert response.status_code == 400, response.text
    assert calls == []
    response = await client.post(path, headers=headers, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["language"] == "bn"
    assert response.json()["tone"] == "casual"
    assert "আপনি" in calls[0][0]
    assert calls[0][1]["region"] == "jp"
    assert calls[0][1]["language"] == "bn"
    assert (await client.get("/users/me/requests", headers=auth(member))).json()[
        "items"
    ] == []
    posted = await client.post(
        "/requests",
        headers=headers,
        json={
            "kind": "help",
            "raw_text": "শনিবার বিকেলে একটি তাক সরাতে একটু সাহায্য করবে?",
            "lang": response.json()["language"],
            "tone": response.json()["tone"],
            "home_circle_id": circle,
        },
    )
    assert posted.status_code == 201, posted.text
    assert await acted_by(posted.json()["id"]) == uuid.UUID(caretaker_id)
    detail = await client.get(f"/requests/{posted.json()['id']}", headers=auth(member))
    assert detail.json()["tone"] == "casual"
    assert detail.json()["lang"] == "bn"
    revoked = await client.post(f"/proxy-grants/{grant}/revoke", headers=auth(member))
    assert revoked.status_code == 200, revoked.text
    assert (await client.post(path, headers=headers, json=payload)).status_code == 403
    assert len(calls) == 1
