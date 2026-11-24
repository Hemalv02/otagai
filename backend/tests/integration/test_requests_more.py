from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import update

from app.database.connection import Database
from app.database.models import HelpRequest
from tests.integration.conftest import (
    _settings,
    auth,
    join_circle,
    make_circle,
    make_user,
)


async def _req_and_offer(client):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Original wording", "lang": "ja"},
        )
    ).json()["id"]
    return requester, helper, request_id


async def test_account_deletion_requires_resolving_a_matched_exchange(client):
    requester, helper, request_id = await _req_and_offer(client)
    path = f"/requests/{request_id}"
    offer = await client.post(
        f"{path}/responses", headers=auth(helper), json={"kind": "offer"}
    )
    assert offer.status_code == 201, offer.text
    accepted = await client.post(
        f"{path}/responses/{offer.json()['id']}/accept", headers=auth(requester)
    )
    assert accepted.status_code == 200, accepted.text

    for participant in (requester, helper):
        deleted = await client.delete("/users/me", headers=auth(participant))
        assert deleted.status_code == 409, deleted.text
        assert "resolve" in deleted.json()["message"]
        assert (
            await client.get("/users/me", headers=auth(participant))
        ).status_code == 200

    detail = (await client.get(path, headers=auth(requester))).json()
    assert detail["status"] == "matched"
    exchange = f"/exchanges/{detail['exchange_id']}"
    cancelled = await client.post(f"{exchange}/cancel", headers=auth(requester))
    assert cancelled.status_code == 200, cancelled.text
    assert (
        await client.delete("/users/me", headers=auth(requester))
    ).status_code == 204
    retained = await client.get(exchange, headers=auth(helper))
    assert retained.json()["status"] == "cancelled"


async def test_patch_request_wording(client):
    requester, _, request_id = await _req_and_offer(client)
    patched = await client.patch(
        f"/requests/{request_id}",
        headers=auth(requester),
        json={"polite_text": "Could you kindly help?"},
    )
    assert patched.status_code == 200
    assert patched.json()["polite_text"] == "Could you kindly help?"
    assert patched.json()["raw_text"] == "Original wording"


@pytest.mark.parametrize("field", ["raw_text", "polite_text", "tone"])
async def test_patch_request_rejects_null_for_required_fields(client, field):
    requester, _, request_id = await _req_and_offer(client)
    response = await client.patch(
        f"/requests/{request_id}", headers=auth(requester), json={field: None}
    )
    assert response.status_code == 422, response.text


async def test_patch_request_invalidates_translations_when_wording_changes(client):
    requester, _, request_id = await _req_and_offer(client)
    path = f"/requests/{request_id}"
    database = Database(_settings())
    cached = {"en": "Original wording"}
    try:
        async with database.session() as session:
            await session.execute(
                update(HelpRequest)
                .where(HelpRequest.id == UUID(request_id))
                .values(translations=cached)
            )
        response = await client.patch(
            path,
            headers=auth(requester),
            json={"needed_until": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        )
        assert response.status_code == 200, response.text
        async with database.session() as session:
            request = await session.get(HelpRequest, UUID(request_id))
            assert request.translations == cached
        response = await client.patch(
            path, headers=auth(requester), json={"polite_text": "Updated wording"}
        )
        assert response.status_code == 200, response.text
        async with database.session() as session:
            request = await session.get(HelpRequest, UUID(request_id))
            assert request.translations == {}
    finally:
        await database.close()


async def test_patch_request_timing_updates_expiry_without_overwriting_start(client):
    requester, _, request_id = await _req_and_offer(client)
    path = f"/requests/{request_id}"
    now = datetime.now(UTC).replace(microsecond=0)
    start = now + timedelta(days=1)
    end = now + timedelta(days=2)
    headers = auth(requester)
    response = await client.patch(
        path, headers=headers, json={"needed_from": start.isoformat()}
    )
    assert response.status_code == 200, response.text
    response = await client.patch(
        path, headers=headers, json={"needed_until": end.isoformat()}
    )
    assert response.status_code == 200, response.text
    assert datetime.fromisoformat(response.json()["needed_from"]) == start
    assert datetime.fromisoformat(response.json()["expires_at"]) == end

    assert (
        await client.patch(
            path, headers=headers, json={"needed_until": now.isoformat()}
        )
    ).status_code == 400
    response = await client.patch(path, headers=headers, json={"needed_until": None})
    assert response.status_code == 200, response.text
    assert response.json()["needed_until"] is None
    assert datetime.fromisoformat(response.json()["needed_from"]) == start
    assert (
        now + timedelta(days=7)
        <= datetime.fromisoformat(response.json()["expires_at"])
        <= datetime.now(UTC) + timedelta(days=7)
    )


async def test_patch_request_requires_owner_and_open_status(client):
    requester, helper, request_id = await _req_and_offer(client)
    path = f"/requests/{request_id}"
    wording = {"polite_text": "Updated wording"}
    assert (
        await client.patch(path, headers=auth(helper), json=wording)
    ).status_code == 404
    assert (
        await client.post(f"{path}/cancel", headers=auth(requester))
    ).status_code == 200
    assert (
        await client.patch(path, headers=auth(requester), json=wording)
    ).status_code == 409


async def test_list_responses_requester_only(client):
    requester, helper, request_id = await _req_and_offer(client)
    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json={"kind": "offer", "message": "Happy to"},
        )
    ).json()["id"]

    listed = await client.get(
        f"/requests/{request_id}/responses", headers=auth(requester)
    )
    assert listed.status_code == 200
    assert response_id in [r["id"] for r in listed.json()["items"]]

    # A non-requester cannot list all responses.
    forbidden = await client.get(
        f"/requests/{request_id}/responses", headers=auth(helper)
    )
    assert forbidden.status_code == 404


async def test_patch_and_withdraw_response(client):
    _requester, helper, request_id = await _req_and_offer(client)
    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json={"kind": "offer"},
        )
    ).json()["id"]

    edited = await client.patch(
        f"/requests/{request_id}/responses/{response_id}",
        headers=auth(helper),
        json={"message": "Updated note"},
    )
    assert edited.status_code == 200
    assert edited.json()["message"] == "Updated note"

    withdrawn = await client.post(
        f"/requests/{request_id}/responses/{response_id}/withdraw",
        headers=auth(helper),
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"


async def test_widen_request(client):
    requester, _, request_id = await _req_and_offer(client)
    widened = await client.post(
        f"/requests/{request_id}/widen", headers=auth(requester)
    )
    assert widened.status_code == 200


async def test_mark_received_seen_and_hidden(client):
    _requester, helper, request_id = await _req_and_offer(client)
    patched = await client.patch(
        f"/users/me/received-requests/{request_id}",
        headers=auth(helper),
        json={"seen": True, "hidden": True},
    )
    assert patched.status_code == 200
    assert patched.json()["seen"] is True
    assert patched.json()["hidden"] is True
