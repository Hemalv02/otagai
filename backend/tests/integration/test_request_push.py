import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.database.connection import Database
from app.database.models import Notification, PushDelivery, PushToken
from app.services.notifications import dispatch
from app.services.notifications.service import (
    PushDeviceNotRegisteredError,
    PushUnavailableError,
)
from tests.integration.conftest import (
    _settings,
    auth,
    join_circle,
    make_circle,
    make_user,
)


async def _register(client, user, device, *, platform="ios"):
    response = await client.post(
        "/users/me/push-tokens",
        headers=auth(user),
        json={"expo_token": f"ExpoPushToken[{device}]", "platform": platform},
    )
    assert response.status_code in (200, 201), response.text
    return uuid.UUID(response.json()["id"])


async def _create(client, requester, **options):
    response = await client.post(
        "/requests",
        headers=auth(requester),
        json={
            "kind": "help",
            "raw_text": "Private request text",
            "lang": "en",
            **options,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _setup(client, *, region="jp", language="en"):
    requester = await make_user(client, region=region)
    recipient = await make_user(client, region=region, language=language)
    circle = await make_circle(client, requester)
    await join_circle(client, requester, circle, recipient)
    return requester, recipient


@pytest.mark.parametrize("reregister", [False, True])
async def test_enqueues_once_per_device_and_persists_expo_receipt(
    client, monkeypatch, reregister
):
    requester, recipient = await _setup(client, region="bd", language="bn")
    first = await _register(client, recipient, "first")
    second = await _register(client, recipient, "second", platform="android")
    await _register(client, requester, "requester")
    request = await _create(client, requester)
    settings = _settings()
    database = Database(settings)

    sent = []
    receipts = []

    async def send(settings, message):
        sent.append(message)
        return (
            "ticket-first" if message.to == "ExpoPushToken[first]" else "ticket-second"
        )

    async def receipt(settings, ticket_id):
        receipts.append(ticket_id)
        if ticket_id == "ticket-second":
            raise PushDeviceNotRegisteredError("Expired registration")
        return True

    monkeypatch.setattr(dispatch, "send_push", send)
    monkeypatch.setattr(dispatch, "check_push_receipt", receipt)
    try:
        async with database.session() as session:
            notification = await session.scalar(select(Notification))
            jobs = (await session.scalars(select(PushDelivery))).all()
            assert {job.push_token_id for job in jobs} == {first, second}
            await dispatch.enqueue_ripple_push(session, [notification, notification])
        tick = datetime.now(UTC)
        assert await dispatch.dispatch_next(database, settings, now=tick)
        assert await dispatch.dispatch_next(database, settings, now=tick)
        assert not await dispatch.dispatch_next(database, settings, now=tick)
        assert {message.to for message in sent} == {
            "ExpoPushToken[first]",
            "ExpoPushToken[second]",
        }
        assert {message.to: message.channel_id for message in sent} == {
            "ExpoPushToken[first]": None,
            "ExpoPushToken[second]": "requests",
        }
        assert all(message.body == "আপনার কাছে একটি নতুন অনুরোধ এসেছে।" for message in sent)
        assert all(message.ttl > 0 for message in sent)
        assert all(
            message.data
            == {
                "type": "request_nearby",
                "request_id": request["id"],
                "notification_id": str(notification.id),
            }
            for message in sent
        )
        assert not receipts
        # A late receipt for the original registration must not disable a
        # device that successfully registered again afterward.
        if reregister:
            fresh_registration = tick + timedelta(minutes=1)
            async with database.session() as session:
                token = await session.get(PushToken, second)
                token.last_seen_at = fresh_registration
        receipt_at = tick + timedelta(minutes=15)
        assert await dispatch.dispatch_next(database, settings, now=receipt_at)
        assert await dispatch.dispatch_next(database, settings, now=receipt_at)
        assert not await dispatch.dispatch_next(database, settings, now=receipt_at)
        assert set(receipts) == {"ticket-first", "ticket-second"}
        async with database.session() as session:
            assert (
                await session.get(Notification, notification.id)
            ).pushed_at == receipt_at
            assert (await session.get(PushToken, second)).disabled_at == (
                None if reregister else receipt_at
            )
            failed = await session.get(PushDelivery, (notification.id, second))
            assert failed.finished_at == receipt_at
            assert failed.last_error == "device_not_registered"
    finally:
        await database.close()


async def test_direct_push_defers_through_local_quiet_hours_then_retries(
    client, monkeypatch
):
    requester, recipient = await _setup(client)
    await _register(client, recipient, "quiet-room")
    profile = (await client.get("/users/me", headers=auth(recipient))).json()
    prefs = await client.patch(
        "/users/me",
        headers=auth(recipient),
        json={"quiet_hours_start": "22:00", "quiet_hours_end": "07:00"},
    )
    assert prefs.status_code == 200, prefs.text
    # 23:00 in Tokyo on the next local night, regardless of test runner timezone.
    tick = datetime.now(UTC).replace(hour=14, minute=0, second=0, microsecond=0)
    tick += timedelta(days=1)
    end_of_quiet = tick + timedelta(hours=8)
    request = await _create(
        client,
        requester,
        direct_to_user_id=profile["id"],
        ripple_max_stage="direct",
        needed_until=(end_of_quiet + timedelta(days=1)).isoformat(),
    )
    settings = _settings()
    database = Database(settings)
    sent = []

    async def send(settings, message):
        sent.append(message)
        if len(sent) == 1:
            raise PushUnavailableError("temporary provider failure")
        return "ticket"

    monkeypatch.setattr(dispatch, "send_push", send)
    try:
        assert await dispatch.dispatch_next(database, settings, now=tick)
        assert not sent
        assert not await dispatch.dispatch_next(
            database, settings, now=end_of_quiet - timedelta(seconds=1)
        )
        assert await dispatch.dispatch_next(database, settings, now=end_of_quiet)
        assert sent[0].data["type"] == "request_direct"
        assert sent[0].data["request_id"] == request["id"]
        assert not await dispatch.dispatch_next(database, settings, now=end_of_quiet)
        retry_at = end_of_quiet + timedelta(minutes=1)
        assert await dispatch.dispatch_next(database, settings, now=retry_at)
        assert len(sent) == 2
        assert not await dispatch.dispatch_next(database, settings, now=retry_at)
    finally:
        await database.close()


@pytest.mark.parametrize(
    "reason",
    ["cancelled", "matched", "expired", "blocked", "opt_out", "reassigned", "removed"],
)
async def test_pending_push_respects_terminal_request_and_device_state(
    client, monkeypatch, reason
):
    requester, recipient = await _setup(client)
    token_id = await _register(client, recipient, "stop-delivery")
    expires_at = datetime.now(UTC) + timedelta(hours=2)
    request = await _create(client, requester, needed_until=expires_at.isoformat())
    request_id = request["id"]
    tick = datetime.now(UTC)
    if reason == "cancelled":
        response = await client.post(
            f"/requests/{request_id}/cancel", headers=auth(requester)
        )
        assert response.status_code == 200, response.text
    elif reason == "matched":
        offered = await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(recipient),
            json={"kind": "offer"},
        )
        assert offered.status_code == 201, offered.text
        response_id = offered.json()["id"]
        accepted = await client.post(
            f"/requests/{request_id}/responses/{response_id}/accept",
            headers=auth(requester),
        )
        assert accepted.status_code == 200, accepted.text
    elif reason == "expired":
        tick = expires_at
    elif reason == "blocked":
        profile = (await client.get("/users/me", headers=auth(requester))).json()
        response = await client.post(
            "/users/me/blocks", headers=auth(recipient), json={"user_id": profile["id"]}
        )
        assert response.status_code == 201, response.text
    elif reason == "opt_out":
        response = await client.patch(
            "/users/me", headers=auth(recipient), json={"push_enabled": False}
        )
        assert response.status_code == 200, response.text
    elif reason == "reassigned":
        assert await _register(client, requester, "stop-delivery") == token_id
    else:
        response = await client.delete(
            f"/users/me/push-tokens/{token_id}", headers=auth(recipient)
        )
        assert response.status_code == 204, response.text

    async def unexpected_send(*args):
        pytest.fail(f"Expo was called for a {reason} delivery")

    monkeypatch.setattr(dispatch, "send_push", unexpected_send)
    settings = _settings()
    database = Database(settings)
    try:
        assert await dispatch.dispatch_next(database, settings, now=tick)
        assert not await dispatch.dispatch_next(database, settings, now=tick)
        async with database.session() as session:
            job = await session.scalar(select(PushDelivery))
            assert job.finished_at == tick
            assert not job.attempts
    finally:
        await database.close()


async def test_workers_do_not_send_the_same_pending_job_concurrently(
    client, monkeypatch
):
    requester, recipient = await _setup(client)
    await _register(client, recipient, "first")
    await _create(client, requester)
    entered = asyncio.Event()
    resume = asyncio.Event()
    calls = []

    async def send(settings, message):
        calls.append(message)
        entered.set()
        await resume.wait()
        return "ticket"

    monkeypatch.setattr(dispatch, "send_push", send)
    settings = _settings()
    database = Database(settings)
    tick = datetime.now(UTC)
    first = asyncio.create_task(dispatch.dispatch_next(database, settings, now=tick))
    try:
        await asyncio.wait_for(entered.wait(), timeout=3)
        assert not await asyncio.wait_for(
            dispatch.dispatch_next(database, settings, now=tick), timeout=3
        )
        assert len(calls) == 1
    finally:
        resume.set()
        await first
        await database.close()
