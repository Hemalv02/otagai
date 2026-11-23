from types import SimpleNamespace

from pydantic import BaseModel, SecretStr

from app.services.ai import service
from app.settings import Settings


class DraftResult(BaseModel):
    text: str


async def test_ask_traces_use_the_server_key_and_omit_sensitive_data(monkeypatch):
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-only"),
        openai_model="test-model",
    )

    async def run_agent(_agent, _input, *, run_config, **_kwargs):
        assert not run_config.tracing_disabled
        assert not run_config.trace_include_sensitive_data
        assert run_config.workflow_name == "Otagai Ask"
        assert run_config.tracing == {"api_key": "test-only"}
        return SimpleNamespace(
            final_output_as=lambda *_args, **_kwargs: DraftResult(text="Draft")
        )

    monkeypatch.setattr(service.Runner, "run", run_agent)
    result = await service.draft(
        settings,
        instructions="Write a short draft.",
        user_input="Synthetic test input",
        output_type=DraftResult,
    )
    assert result.text == "Draft"
