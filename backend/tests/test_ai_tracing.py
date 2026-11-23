from types import SimpleNamespace

import pytest
from pydantic import BaseModel, SecretStr

from app.services.ai import service
from app.settings import Settings


class DraftResult(BaseModel):
    text: str


@pytest.mark.parametrize("trace_workflow", ["Otagai Ask", None])
async def test_only_opted_in_drafts_send_redacted_traces(monkeypatch, trace_workflow):
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-only"),
        openai_model="test-model",
    )

    async def run_agent(_agent, _input, *, run_config, **_kwargs):
        assert run_config.tracing_disabled is (trace_workflow is None)
        if trace_workflow:
            assert not run_config.trace_include_sensitive_data
            assert run_config.workflow_name == trace_workflow
            assert run_config.tracing == {"api_key": "test-only"}
        else:
            assert run_config.tracing is None
        return SimpleNamespace(
            final_output_as=lambda *_args, **_kwargs: DraftResult(text="Draft")
        )

    monkeypatch.setattr(service.Runner, "run", run_agent)
    result = await service.draft(
        settings,
        instructions="Write a short draft.",
        user_input="Synthetic test input",
        output_type=DraftResult,
        trace_workflow=trace_workflow,
    )
    assert result.text == "Draft"
