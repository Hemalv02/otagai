import logging
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

from agents import (
    Agent,
    FunctionTool,
    ModelSettings,
    OpenAIResponsesModel,
    RunConfig,
    Runner,
    TResponseInputItem,
)
from agents.exceptions import AgentsException
from openai import APIError, AsyncOpenAI
from openai.types.shared import Reasoning
from pydantic import BaseModel

from app.services.errors import ServiceConfigurationError, UpstreamUnavailableError
from app.settings import Settings

logger = logging.getLogger(__name__)

OPENAI_MAX_RETRIES = 3


class AIDraftError(UpstreamUnavailableError):
    pass


@dataclass
class UsageMeter:
    input_tokens: int = 0
    output_tokens: int = 0


_meter: ContextVar[UsageMeter | None] = ContextVar("ai_usage_meter", default=None)


@contextmanager
def metered() -> Iterator[UsageMeter]:
    meter = UsageMeter()
    token = _meter.set(meter)
    try:
        yield meter
    finally:
        _meter.reset(token)


def record_usage(input_tokens: int, output_tokens: int) -> None:
    meter = _meter.get()
    if meter is not None:
        meter.input_tokens += input_tokens
        meter.output_tokens += output_tokens


async def draft[Output: BaseModel](
    settings: Settings,
    *,
    instructions: str,
    user_input: str | list[TResponseInputItem],
    output_type: type[Output],
    reasoning: Reasoning | None = None,
    tool: FunctionTool | None = None,
    context=None,
    trace_workflow: str | None = None,
) -> Output:
    if not settings.openai_api_key or not settings.openai_model:
        raise ServiceConfigurationError("Configure the OpenAI key and model.")

    api_key = settings.openai_api_key.get_secret_value()
    async with AsyncOpenAI(
        api_key=api_key, timeout=25, max_retries=OPENAI_MAX_RETRIES
    ) as client:
        agent = Agent(
            name="Otagai drafting assistant",
            instructions=instructions,
            output_type=output_type,
            tools=[tool] if tool else [],
            tool_use_behavior="stop_on_first_tool" if tool else "run_llm_again",
            model=OpenAIResponsesModel(settings.openai_model, client),
            model_settings=ModelSettings(
                store=False,
                reasoning=reasoning,
                tool_choice="required" if tool else None,
                parallel_tool_calls=False if tool else None,
            ),
        )
        try:
            result = await Runner.run(
                agent,
                user_input,
                context=context,
                max_turns=1,
                run_config=(
                    RunConfig(
                        workflow_name=trace_workflow,
                        trace_include_sensitive_data=False,
                        tracing={"api_key": api_key},
                    )
                    if trace_workflow is not None
                    else RunConfig(tracing_disabled=True)
                ),
            )
            usage = getattr(getattr(result, "context_wrapper", None), "usage", None)
            if usage is not None:
                record_usage(usage.input_tokens, usage.output_tokens)
            return result.final_output_as(output_type, raise_if_incorrect_type=True)
        except (APIError, AgentsException, TypeError) as error:
            logger.warning(
                "AI draft failed: %s status=%s",
                type(error).__name__,
                getattr(error, "status_code", None),
            )
            raise AIDraftError(
                "The AI service could not produce a valid draft."
            ) from error
