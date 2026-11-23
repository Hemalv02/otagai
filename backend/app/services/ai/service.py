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


class AIDraftError(UpstreamUnavailableError):
    pass


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
    async with AsyncOpenAI(api_key=api_key, timeout=25, max_retries=1) as client:
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
            return result.final_output_as(output_type, raise_if_incorrect_type=True)
        except (APIError, AgentsException, TypeError):
            raise AIDraftError(
                "The AI service could not produce a valid draft."
            ) from None
