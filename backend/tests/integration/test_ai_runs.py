from datetime import UTC, datetime, timedelta

import pytest
from openai.types.audio import Transcription
from pydantic import SecretStr
from sqlalchemy import select

from app.database.connection import Database
from app.database.models import AiRun
from app.services.ai import helpers, runner
from app.services.ai.runner import purge_old_runs
from app.services.ai.service import record_usage
from tests.integration.conftest import _settings, auth, make_user


async def test_tool_guide_run_records_tokens_and_old_runs_are_purged(
    client, monkeypatch
):
    async def model(settings, *, output_type, **kwargs):
        record_usage(11, 7)
        return output_type(lines=["Wear gloves."])

    monkeypatch.setattr(helpers, "draft", model)
    token = await make_user(client)
    response = await client.post(
        "/ai/tool-guides",
        headers=auth(token),
        json={"tool_name": "Chainsaw", "language": "en"},
    )
    assert response.status_code == 200, response.text

    settings = _settings()
    database = Database(settings)
    try:
        async with database.session() as session:
            runs = (await session.scalars(select(AiRun))).all()
        assert [(r.feature, r.input_tokens, r.output_tokens) for r in runs] == [
            ("tool_guide", 11, 7)
        ]

        assert await purge_old_runs(database, settings) == 0
        later = datetime.now(UTC) + timedelta(days=settings.ai_run_retention_days + 1)
        assert await purge_old_runs(database, settings, now=later) == 1
    finally:
        await database.close()


@pytest.mark.parametrize(
    ("model", "usage", "expected_counts"),
    [
        (
            "gpt-4o-mini-transcribe",
            {
                "type": "tokens",
                "input_tokens": 10,
                "output_tokens": 0,
                "total_tokens": 10,
            },
            (10, 0),
        ),
        ("whisper-1", {"type": "duration", "seconds": 1.4}, (None, None)),
    ],
)
async def test_transcription_records_token_usage_when_available(
    client, monkeypatch, model, usage, expected_counts
):
    settings = client._transport.app._app.state.settings
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-only"))
    monkeypatch.setattr(settings, "openai_transcribe_model", model)

    class TranscriptionClient:
        def __init__(self, **kwargs):
            self.audio = self
            self.transcriptions = self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def create(self, *, model, file):
            return Transcription.model_validate(
                {"text": "I need a drill", "usage": usage}
            )

    monkeypatch.setattr(runner, "AsyncOpenAI", TranscriptionClient)
    token = await make_user(client)
    uploaded = await client.post(
        "/media",
        headers=auth(token),
        data={"purpose": "voice"},
        files={"file": ("fixture.m4a", b"\x00\x00\x00\x18ftypM4A ", "audio/mp4")},
    )
    assert uploaded.status_code == 201, uploaded.text
    response = await client.post(
        "/ai/transcriptions",
        headers=auth(token),
        json={"media_id": uploaded.json()["id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"text": "I need a drill"}

    database = Database(settings)
    try:
        async with database.session() as session:
            runs = await session.scalars(select(AiRun))
            run = runs.one()
            assert run.feature == "transcribe"
            assert run.model == model
            assert (run.input_tokens, run.output_tokens) == expected_counts
    finally:
        await database.close()
