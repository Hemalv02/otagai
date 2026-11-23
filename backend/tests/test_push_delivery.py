import json
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

import httpx2
import pytest

from app.services.notifications import service
from app.settings import Settings


def test_overnight_quiet_hours_end_in_the_recipient_timezone():
    start = time(22)
    end = time(7)
    tokyo = ZoneInfo("Asia/Tokyo")
    assert service.quiet_until(
        datetime(2026, 7, 10, 14, tzinfo=UTC), tokyo, start, end
    ) == (datetime(2026, 7, 10, 22, tzinfo=UTC))
    assert service.quiet_until(
        datetime(2026, 7, 10, 21, tzinfo=UTC), tokyo, start, end
    ) == (datetime(2026, 7, 10, 22, tzinfo=UTC))
    assert (
        service.quiet_until(datetime(2026, 7, 10, 22, tzinfo=UTC), tokyo, start, end)
        is None
    )


@pytest.mark.asyncio
async def test_expo_sender_passes_navigation_data_and_reads_receipt(monkeypatch):
    def respond(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        if request.url.path.endswith("/send"):
            assert body[0]["data"] == {"request_id": "request"}
            assert body[0]["ttl"] == 600
            assert body[0]["channelId"] == "requests"
            return httpx2.Response(
                200, json={"data": [{"id": "ticket", "status": "ok"}]}
            )
        assert request.url.path.endswith("/getReceipts")
        assert body == {"ids": ["ticket"]}
        return httpx2.Response(200, json={"data": {"ticket": {"status": "ok"}}})

    client_type = httpx2.AsyncClient
    monkeypatch.setattr(
        service.httpx2,
        "AsyncClient",
        lambda **kwargs: client_type(transport=httpx2.MockTransport(respond), **kwargs),
    )
    settings = Settings(_env_file=None)
    message = service.PushMessage(
        to="ExpoPushToken[local-test-token]",
        title="Otagai",
        body="Someone nearby sent a request.",
        data={"request_id": "request"},
        ttl=600,
        channel_id="requests",
    )
    assert "local-test-token" not in repr(message)
    assert await service.send_push(settings, message) == "ticket"
    assert await service.check_push_receipt(settings, "ticket") is True
