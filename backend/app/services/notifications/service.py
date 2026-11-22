import httpx2
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.errors import ServiceError
from app.settings import Settings


class PushDeliveryError(ServiceError):
    pass


class PushUnavailableError(ServiceError):
    pass


class PushMessage(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)

    to: str = Field(pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$")
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=240)


class PushTicket(BaseModel):
    id: str | None = None
    status: str


class PushResponse(BaseModel):
    data: list[PushTicket]


async def send_push(settings: Settings, message: PushMessage) -> str:
    headers = {}
    if settings.expo_access_token:
        headers["Authorization"] = (
            f"Bearer {settings.expo_access_token.get_secret_value()}"
        )

    try:
        async with httpx2.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                headers=headers,
                json=[message.model_dump()],
            )
    except httpx2.RequestError as error:
        raise PushUnavailableError("The Expo push service is unavailable.") from error

    if response.status_code == 429 or response.status_code >= 500:
        raise PushUnavailableError("The Expo push service is unavailable.")
    if not response.is_success:
        raise PushDeliveryError("The Expo push service rejected the request.")
    try:
        result = PushResponse.model_validate_json(response.content)
    except ValidationError:
        raise PushDeliveryError(
            "The Expo push service returned an invalid response."
        ) from None

    if len(result.data) != 1 or result.data[0].status != "ok" or not result.data[0].id:
        raise PushDeliveryError("The Expo push service rejected the notification.")
    return result.data[0].id
