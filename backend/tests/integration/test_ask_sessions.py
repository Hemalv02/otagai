import io
import json
import uuid

import pytest
from PIL import Image

from app.services.ai import request_writer
from app.services.ai.helpers import TaskIdentification
from app.services.ask_sessions import service as ask_sessions
from tests.integration.conftest import auth, make_user


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (400, 400), (200, 100, 50)).save(buffer, format="PNG")
    return buffer.getvalue()


async def _ask_photo(client, token) -> str:
    media_id = (
        await client.post(
            "/media",
            headers=auth(token),
            files={"file": ("p.png", _png(), "image/png")},
            data={"purpose": "ask"},
        )
    ).json()["id"]
    return media_id


async def test_photo_ask_session_without_text_asks_question(client):
    token = await make_user(client)
    media_id = await _ask_photo(client, token)
    created = await client.post(
        "/ask-sessions",
        headers=auth(token),
        json={"input_mode": "photo", "media_id": media_id},
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "clarifying"
    assert created.json()["clarifying_question"]


async def test_ask_session_owner_reads_and_abandons(client):
    token = await make_user(client)
    media_id = await _ask_photo(client, token)
    session_id = (
        await client.post(
            "/ask-sessions",
            headers=auth(token),
            json={"input_mode": "photo", "media_id": media_id},
        )
    ).json()["id"]

    read = await client.get(f"/ask-sessions/{session_id}", headers=auth(token))
    assert read.status_code == 200
    assert "session" in read.json() and "matches" in read.json()

    deleted = await client.delete(f"/ask-sessions/{session_id}", headers=auth(token))
    assert deleted.status_code == 204


async def test_text_ask_session_needs_ai_503(client):
    token = await make_user(client)
    # Text input drives the task-to-tools model, which is unconfigured -> 503.
    response = await client.post(
        "/ask-sessions",
        headers=auth(token),
        json={"input_mode": "text", "input_text": "My tap is leaking"},
    )
    assert response.status_code == 503


async def test_ask_session_bad_body_422(client):
    token = await make_user(client)
    # Text mode without input_text.
    response = await client.post(
        "/ask-sessions", headers=auth(token), json={"input_mode": "text"}
    )
    assert response.status_code == 422


async def test_ask_session_requires_auth_401(client):
    response = await client.post(
        "/ask-sessions", json={"input_mode": "text", "input_text": "x"}
    )
    assert response.status_code == 401


async def test_foreign_ask_session_404(client):
    owner = await make_user(client, display_name="Owner")
    media_id = await _ask_photo(client, owner)
    session_id = (
        await client.post(
            "/ask-sessions",
            headers=auth(owner),
            json={"input_mode": "photo", "media_id": media_id},
        )
    ).json()["id"]
    stranger = await make_user(client, display_name="Stranger")
    response = await client.get(f"/ask-sessions/{session_id}", headers=auth(stranger))
    assert response.status_code == 404


async def test_unknown_ask_session_404(client):
    token = await make_user(client)
    response = await client.get(f"/ask-sessions/{uuid.uuid4()}", headers=auth(token))
    assert response.status_code == 404


@pytest.mark.parametrize("input_mode", ["photo", "text"])
async def test_ask_draft_uses_saved_clarification(client, monkeypatch, input_mode):
    token = await make_user(client)
    answer = "Please bring the drill to the community noticeboard on Saturday."
    description = "I need a drill for a shelf. " + "x" * 1900
    received = []

    async def identify(settings, request):
        return TaskIdentification(identified=[], clarifying_question=None)

    async def write(settings, *, instructions, user_input, output_type):
        received.append(json.loads(user_input))
        return output_type.model_validate(
            {
                language: {"title": "Help with a shelf", "message": answer}
                for language in ("en", "ja", "bn")
            }
        )

    monkeypatch.setattr(ask_sessions, "identify_task", identify)
    monkeypatch.setattr(request_writer, "draft", write)
    body = {"input_mode": input_mode}
    if input_mode == "photo":
        body["media_id"] = await _ask_photo(client, token)
    else:
        body["input_text"] = description
    created = await client.post("/ask-sessions", headers=auth(token), json=body)
    assert created.status_code == 201, created.text
    path = f"/ask-sessions/{created.json()['id']}"

    if input_mode == "photo":
        incomplete = await client.post(f"{path}/draft", headers=auth(token), json={})
        assert incomplete.status_code == 400, incomplete.text
        assert not received

    answered = await client.post(
        f"{path}/answer", headers=auth(token), json={"answer": answer}
    )
    assert answered.status_code == 200, answered.text
    assert answered.json()["clarifying_answer"] == answer

    drafted = await client.post(f"{path}/draft", headers=auth(token), json={})
    assert drafted.status_code == 200, drafted.text
    assert set(drafted.json()) == {"en", "ja", "bn"}
    assert len(received) == 1
    if input_mode == "photo":
        assert received[0]["text"] == answer
    else:
        assert received[0]["text"] == description[:1500]
        assert received[0].get("clarification") == answer

    saved = await client.get(path, headers=auth(token))
    assert saved.status_code == 200, saved.text
    assert saved.json()["session"]["status"] == "drafted"
