from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.database.connection import Database
from app.database.models import AiRun
from app.services.ai import helpers
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
