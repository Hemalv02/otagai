import io
import uuid

from PIL import Image

from tests.integration.conftest import auth, make_user

AI_CALLS = [
    ("/ai/listing-drafts", {"description": "A cordless drill", "language": "ja"}),
    (
        "/ai/thank-you-drafts",
        {"helped_with": "moving", "culture_pack": "japan", "language": "ja"},
    ),
    ("/ai/extension-drafts", {"intent": "extend", "language": "ja"}),
    ("/ai/tool-guides", {"tool_name": "Chainsaw", "language": "ja"}),
    ("/ai/transcriptions", {"media_id": str(uuid.uuid4())}),
]


async def test_ai_endpoints_without_openai_are_503(client):
    token = await make_user(client)
    for path, body in AI_CALLS:
        response = await client.post(path, headers=auth(token), json=body)
        assert response.status_code == 503, f"{path}: {response.status_code}"


async def test_ask_answer_and_draft_need_ai(client):
    token = await make_user(client)
    png = io.BytesIO()
    Image.new("RGB", (200, 200), (1, 2, 3)).save(png, format="PNG")
    media_id = (
        await client.post(
            "/media",
            headers=auth(token),
            files={"file": ("p.png", png.getvalue(), "image/png")},
            data={"purpose": "ask"},
        )
    ).json()["id"]
    session_id = (
        await client.post(
            "/ask-sessions",
            headers=auth(token),
            json={"input_mode": "photo", "media_id": media_id},
        )
    ).json()["id"]

    answered = await client.post(
        f"/ask-sessions/{session_id}/answer",
        headers=auth(token),
        json={"answer": "Indoors"},
    )
    assert answered.status_code == 503  # re-runs the AI identifier

    drafted = await client.post(
        f"/ask-sessions/{session_id}/draft",
        headers=auth(token),
        json={"audience": "han"},
    )
    # No transcript/text on a bare photo session -> 400; with text it would hit AI.
    assert drafted.status_code in (400, 503)
