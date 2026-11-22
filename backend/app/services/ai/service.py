from agents import (
    Agent,
    ModelSettings,
    OpenAIResponsesModel,
    RunConfig,
    Runner,
    TResponseInputItem,
)
from agents.exceptions import AgentsException
from openai import APIError, AsyncOpenAI
from pydantic import BaseModel

from app.services.errors import ServiceConfigurationError, ServiceError
from app.settings import Settings


class AIDraftError(ServiceError):
    pass


async def draft[Output: BaseModel](
    settings: Settings,
    *,
    instructions: str,
    user_input: str | list[TResponseInputItem],
    output_type: type[Output],
) -> Output:
    if not settings.openai_api_key or not settings.openai_model:
        raise ServiceConfigurationError("Configure the OpenAI key and model.")

    async with AsyncOpenAI(
        api_key=settings.openai_api_key.get_secret_value(), timeout=25, max_retries=1
    ) as client:
        agent = Agent(
            name="Otagai drafting assistant",
            instructions=instructions,
            output_type=output_type,
            model=OpenAIResponsesModel(settings.openai_model, client),
            model_settings=ModelSettings(store=False),
        )
        try:
            result = await Runner.run(
                agent,
                user_input,
                max_turns=1,
                run_config=RunConfig(tracing_disabled=True),
            )
            return result.final_output_as(output_type, raise_if_incorrect_type=True)
        except (APIError, AgentsException, TypeError):
            raise AIDraftError(
                "The AI service could not produce a valid draft."
            ) from None
