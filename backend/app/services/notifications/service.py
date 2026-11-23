import asyncio
from datetime import UTC, datetime, time, timedelta, tzinfo

import httpx2
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.errors import ServiceError
from app.settings import Settings


class PushDeliveryError(ServiceError):
    pass


class PushUnavailableError(ServiceError):
    pass


class PushDeviceNotRegisteredError(PushDeliveryError):
    pass


class PushRateExceededError(PushUnavailableError):
    pass


class PushMessage(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)

    to: str = Field(
        pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$", repr=False
    )
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=240)
    data: dict[str, str] | None = None
    ttl: int | None = Field(default=None, ge=0)
    channel_id: str | None = Field(default=None, serialization_alias="channelId")


class PushDetails(BaseModel):
    error: str | None = None


class PushTicket(BaseModel):
    id: str | None = None
    status: str
    details: PushDetails | None = None


class PushResponse(BaseModel):
    data: list[PushTicket]


class PushReceiptResponse(BaseModel):
    data: dict[str, PushTicket]


def quiet_until(
    now: datetime,
    timezone: tzinfo,
    start: time | None,
    end: time | None,
) -> datetime | None:
    if start is None or end is None or start == end:
        return None

    local = now.astimezone(timezone)
    local_time = local.time()
    end_date = local.date()
    if start < end:
        if not start <= local_time < end:
            return None
    elif local_time >= start:
        end_date += timedelta(days=1)
    elif local_time >= end:
        return None

    end_local = datetime.combine(end_date, end, timezone)
    return max(
        end_local.replace(fold=0).astimezone(UTC),
        end_local.replace(fold=1).astimezone(UTC),
    )


async def _post_expo(
    settings: Settings, operation: str, body: dict | list
) -> httpx2.Response:
    headers = {}
    if settings.expo_access_token:
        headers["Authorization"] = (
            f"Bearer {settings.expo_access_token.get_secret_value()}"
        )

    try:
        async with asyncio.timeout(12), httpx2.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"https://exp.host/--/api/v2/push/{operation}",
                headers=headers,
                json=body,
            )
    except (httpx2.RequestError, TimeoutError):
        raise PushUnavailableError("The Expo push service is unavailable.") from None

    if response.status_code == 429 or response.status_code >= 500:
        raise PushUnavailableError("The Expo push service is unavailable.")
    if not response.is_success:
        raise PushDeliveryError("The Expo push service rejected the request.")
    return response


def _check_ticket(ticket: PushTicket) -> None:
    if ticket.status == "ok":
        return
    error = ticket.details.error if ticket.details else None
    if error == "DeviceNotRegistered":
        raise PushDeviceNotRegisteredError("The Expo device is no longer registered.")
    if error == "MessageRateExceeded":
        raise PushRateExceededError("The Expo device has reached its rate limit.")
    raise PushDeliveryError("The Expo push service rejected the notification.")


async def send_push(settings: Settings, message: PushMessage) -> str:
    response = await _post_expo(
        settings, "send", [message.model_dump(exclude_none=True, by_alias=True)]
    )
    try:
        result = PushResponse.model_validate_json(response.content)
    except ValidationError:
        raise PushUnavailableError(
            "The Expo push service returned an invalid response."
        ) from None

    if len(result.data) != 1:
        raise PushUnavailableError("The Expo push service returned an invalid ticket.")
    ticket = result.data[0]
    _check_ticket(ticket)
    if not ticket.id:
        raise PushUnavailableError("The Expo push service returned an invalid ticket.")
    return ticket.id


async def check_push_receipt(settings: Settings, ticket_id: str) -> bool:
    response = await _post_expo(settings, "getReceipts", {"ids": [ticket_id]})
    try:
        result = PushReceiptResponse.model_validate_json(response.content)
    except ValidationError:
        raise PushUnavailableError(
            "The Expo push service returned an invalid receipt."
        ) from None

    receipt = result.data.get(ticket_id)
    if receipt is None:
        return False
    _check_ticket(receipt)
    return True
