import io
import uuid

from PIL import Image

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
