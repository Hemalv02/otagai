import asyncio
import uuid

import pytest
from sqlalchemy import text

from app.database.connection import Database
from app.repositories.requests import RequestRepository
from tests.integration.conftest import (
    _settings,
    auth,
    confirmed_pickup,
    join_circle,
    make_circle,
    make_user,
    matched_exchange,
)


async def create_listing(client, owner, kind, title, lend_mode=None):
    categories = await client.get(f"/categories?kind={kind}", headers=auth(owner))
    response = await client.post(
        "/listings",
        headers=auth(owner),
        json={
            "kind": kind,
            "category_id": categories.json()["items"][0]["id"],
            "title": title,
            "lend_mode": lend_mode or ("lend" if kind == "tool" else "help_only"),
            "lang": "en",
        },
    )
    assert response.status_code == 201, response.text
    return response.headers["Location"].rsplit("/", 1)[1]


async def _profile_id(client, token):
    response = await client.get("/users/me", headers=auth(token))
    assert response.status_code == 200, response.text
    return response.json()["id"]


async def _world(client, kind="tool", lend_mode=None):
    owner = await make_user(client, display_name="Owner")
    seeker = await make_user(client, display_name="Seeker")
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, seeker)
    listing = await create_listing(
        client, owner, kind, "Shared item", lend_mode=lend_mode
    )
    return owner, seeker, listing, circle


def _body(listing, owner_id, kind="borrow", **extra):
    return {
        "kind": kind,
        "raw_text": "May I borrow it Saturday?",
        "lang": "en",
        "listing_id": listing,
        "direct_to_user_id": owner_id,
        "ripple_max_stage": "direct",
        **extra,
    }


async def _post(client, token, body):
    return await client.post("/requests", headers=auth(token), json=body)


async def _elapse(request_id):
    database = Database(_settings())
    try:
        async with database.session() as session:
            await session.execute(
                text(
                    "UPDATE help_requests SET expires_at = now() - interval '1 second' WHERE id = :request_id"
                ),
                {"request_id": uuid.UUID(request_id)},
            )
    finally:
        await database.close()


async def test_borrow_request_reaches_owner_with_listing(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    detail = await client.get(f"/listings/{listing}", headers=auth(seeker))
    created = await _post(client, seeker, _body(listing, owner_id))
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["listing_id"] == listing
    assert data["direct_to_user_id"] == owner_id
    assert data["ripple_stage"] == "direct"
    received = await client.get(
        "/users/me/received-requests?direct=true", headers=auth(owner)
    )
    assert data["id"] in [item["request"]["id"] for item in received.json()["items"]]
    seen = await client.get(f"/requests/{data['id']}", headers=auth(owner))
    assert seen.status_code == 200, seen.text
    assert seen.json()["listing_id"] == listing
    assert seen.json()["category_id"] == detail.json()["category_id"]


async def test_help_only_skill_accepts_help_and_rejects_borrow(client):
    owner, seeker, listing, _ = await _world(client, kind="skill")
    owner_id = await _profile_id(client, owner)
    rejected = await _post(client, seeker, _body(listing, owner_id, "borrow"))
    assert rejected.status_code == 400, rejected.text
    accepted = await _post(client, seeker, _body(listing, owner_id, "help"))
    assert accepted.status_code == 201, accepted.text


async def test_lend_only_tool_rejects_help(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    rejected = await _post(client, seeker, _body(listing, owner_id, "help"))
    assert rejected.status_code == 400, rejected.text
    allowed = await _post(client, seeker, _body(listing, owner_id, "borrow_with_help"))
    assert allowed.status_code == 201, allowed.text


async def test_lend_or_help_allows_every_kind(client):
    owner, seeker, listing, _ = await _world(client, lend_mode="lend_or_help")
    owner_id = await _profile_id(client, owner)
    for kind in ("borrow", "help", "borrow_with_help"):
        listing = await create_listing(
            client, owner, "tool", "Another", lend_mode="lend_or_help"
        )
        response = await _post(client, seeker, _body(listing, owner_id, kind))
        assert response.status_code == 201, response.text


async def test_paused_listing_is_409_and_resume_recovers(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    paused = await client.post(f"/listings/{listing}/pause", headers=auth(owner))
    assert paused.status_code == 200, paused.text
    blocked = await _post(client, seeker, _body(listing, owner_id))
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["message"]
    resumed = await client.post(f"/listings/{listing}/resume", headers=auth(owner))
    assert resumed.status_code == 200, resumed.text
    retried = await _post(client, seeker, _body(listing, owner_id))
    assert retried.status_code == 201, retried.text


async def test_lent_out_listing_is_409(client):
    match = await matched_exchange(client, loan=True)
    borrower, lender = match["requester"], match["helper"]
    exchange = await client.get(
        f"/exchanges/{match['exchange_id']}", headers=auth(borrower)
    )
    listing = exchange.json()["listing_id"]
    handed = await client.post(
        f"/exchanges/{match['exchange_id']}/hand-over", headers=auth(borrower)
    )
    assert handed.status_code == 200, handed.text
    third = await make_user(client, display_name="Third")
    await join_circle(client, borrower, match["circle_id"], third)
    lender_id = await _profile_id(client, lender)
    response = await _post(client, third, _body(listing, lender_id))
    assert response.status_code == 409, response.text


async def test_wrong_owner_rejected_and_missing_recipient_infers_owner(client):
    owner, seeker, listing, circle = await _world(client)
    other = await make_user(client, display_name="Other")
    await join_circle(client, owner, circle, other)
    other_id = await _profile_id(client, other)
    wrong = await _post(client, seeker, _body(listing, other_id))
    assert wrong.status_code == 400, wrong.text
    missing = await _post(
        client,
        seeker,
        {
            "kind": "borrow",
            "raw_text": "May I borrow it?",
            "lang": "en",
            "listing_id": listing,
            "ripple_max_stage": "direct",
        },
    )
    assert missing.status_code == 201, missing.text
    assert missing.json()["direct_to_user_id"] == await _profile_id(client, owner)
    receipt = await client.get(
        f"/requests/{missing.json()['id']}/receipt", headers=auth(seeker)
    )
    assert receipt.status_code == 200, receipt.text
    other_inbox = await client.get(
        "/users/me/received-requests?direct=true", headers=auth(other)
    )
    assert missing.json()["id"] not in [
        item["request"]["id"] for item in other_inbox.json()["items"]
    ]


async def test_owner_cannot_request_own_listing(client):
    owner, _, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    response = await _post(client, owner, _body(listing, owner_id))
    assert response.status_code == 400, response.text


async def test_other_circle_listing_is_rejected_without_leaking(client):
    owner, _, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    outsider = await make_user(client, display_name="Outsider")
    await make_circle(client, outsider)
    response = await _post(client, outsider, _body(listing, owner_id))
    assert response.status_code == 400, response.text


async def test_blocked_owner_listing_is_rejected_without_leaking(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    blocked = await client.post(
        "/users/me/blocks", headers=auth(seeker), json={"user_id": owner_id}
    )
    assert blocked.status_code == 201, blocked.text
    response = await _post(client, seeker, _body(listing, owner_id))
    assert response.status_code == 400, response.text


async def test_missing_listing_is_404(client):
    owner, seeker, _, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    response = await _post(
        client,
        seeker,
        _body("00000000-0000-4000-8000-000000000000", owner_id),
    )
    assert response.status_code == 404, response.text


@pytest.mark.parametrize("direct", [False, True])
async def test_request_without_listing_unchanged(client, direct):
    owner, seeker, _, _ = await _world(client)
    body = {"kind": "help", "raw_text": "Need a hand", "lang": "en"}
    if direct:
        body = {
            "kind": "borrow",
            "raw_text": "Need a ladder",
            "lang": "en",
            "direct_to_user_id": await _profile_id(client, owner),
            "ripple_max_stage": "direct",
        }
    response = await _post(client, seeker, body)
    assert response.status_code == 201, response.text
    assert response.json()["listing_id"] is None


async def test_repeat_send_returns_same_open_request(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    second = await _post(client, seeker, _body(listing, owner_id))
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]
    received = await client.get(
        "/users/me/received-requests?direct=true", headers=auth(owner)
    )
    assert len(received.json()["items"]) == 1


async def test_concurrent_sends_create_one_request(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    results = await asyncio.gather(
        *(_post(client, seeker, _body(listing, owner_id)) for _ in range(4))
    )
    assert {r.status_code for r in results} == {201}
    assert len({r.json()["id"] for r in results}) == 1
    received = await client.get(
        "/users/me/received-requests?direct=true", headers=auth(owner)
    )
    assert len(received.json()["items"]) == 1


async def test_new_request_allowed_after_cancel(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    cancelled = await client.post(
        f"/requests/{first.json()['id']}/cancel", headers=auth(seeker)
    )
    assert cancelled.status_code == 200, cancelled.text
    second = await _post(client, seeker, _body(listing, owner_id))
    assert second.status_code == 201, second.text
    assert second.json()["id"] != first.json()["id"]


async def test_different_members_can_each_request_the_listing(client):
    owner, seeker, listing, circle = await _world(client)
    other = await make_user(client, display_name="Other")
    await join_circle(client, owner, circle, other)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    second = await _post(client, other, _body(listing, owner_id))
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


async def test_expired_open_request_does_not_block_a_new_one(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    stale = await _post(client, seeker, _body(listing, owner_id))
    assert stale.status_code == 201, stale.text
    await _elapse(stale.json()["id"])
    assert stale.status_code == 201, stale.text
    fresh = await _post(client, seeker, _body(listing, owner_id))
    assert fresh.status_code == 201, fresh.text
    assert fresh.json()["id"] != stale.json()["id"]
    old = await client.get(f"/requests/{stale.json()['id']}", headers=auth(seeker))
    assert old.json()["status"] == "expired"
    again = await _post(client, seeker, _body(listing, owner_id))
    assert again.json()["id"] == fresh.json()["id"]


async def test_reopening_an_expired_request_blocked_by_a_newer_open_one_is_409(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    stale = await _post(client, seeker, _body(listing, owner_id))
    assert stale.status_code == 201, stale.text
    await _elapse(stale.json()["id"])
    fresh = await _post(client, seeker, _body(listing, owner_id))
    assert fresh.json()["id"] != stale.json()["id"]
    widened = await client.post(
        f"/requests/{stale.json()['id']}/widen", headers=auth(seeker)
    )
    assert widened.status_code == 409, widened.text
    assert widened.json()["code"] == "open_request_exists"
    assert widened.json()["request_id"] == fresh.json()["id"]


async def test_repeat_send_with_a_different_kind_is_409(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id, "borrow"))
    assert first.status_code == 201, first.text
    second = await _post(client, seeker, _body(listing, owner_id, "borrow_with_help"))
    assert second.status_code == 409, second.text
    assert (
        second.json()["message"] == "You already have an open request for this listing."
    )
    assert second.json()["code"] == "open_request_exists"
    assert second.json()["request_id"] == first.json()["id"]


async def test_repeat_send_with_a_changed_message_is_409(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    assert first.status_code == 201, first.text

    changed = await _post(
        client, seeker, _body(listing, owner_id, raw_text="Could I borrow it Monday?")
    )
    assert changed.status_code == 409, changed.text
    assert changed.json()["code"] == "open_request_exists"
    assert changed.json()["request_id"] == first.json()["id"]


async def test_request_detail_shows_the_listing_title_to_the_recipient(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    created = await _post(client, seeker, _body(listing, owner_id))
    seen = await client.get(f"/requests/{created.json()['id']}", headers=auth(owner))
    assert seen.json()["listing"] == {"id": listing, "title": "Shared item"}


async def test_request_detail_hides_a_listing_the_viewer_can_no_longer_see(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    created = await _post(client, seeker, _body(listing, owner_id))
    blocked = await client.post(
        "/users/me/blocks", headers=auth(seeker), json={"user_id": owner_id}
    )
    assert blocked.status_code == 201, blocked.text
    seen = await client.get(f"/requests/{created.json()['id']}", headers=auth(seeker))
    assert seen.status_code == 200, seen.text
    assert seen.json()["listing"] is None


async def test_request_without_a_listing_has_no_listing_summary(client):
    _owner, seeker, _, _ = await _world(client)
    created = await _post(
        client, seeker, {"kind": "help", "raw_text": "Need a hand", "lang": "en"}
    )
    seen = await client.get(f"/requests/{created.json()['id']}", headers=auth(seeker))
    assert seen.json()["listing"] is None


async def test_reopening_ignores_a_sibling_that_has_already_expired(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    assert first.status_code == 201, first.text
    await _elapse(first.json()["id"])
    second = await _post(client, seeker, _body(listing, owner_id))
    assert second.status_code == 201, second.text
    await _elapse(second.json()["id"])
    assert second.json()["id"] != first.json()["id"]
    widened = await client.post(
        f"/requests/{first.json()['id']}/widen", headers=auth(seeker)
    )
    assert widened.status_code == 200, widened.text
    assert widened.json()["status"] == "open"
    sibling = await client.get(f"/requests/{second.json()['id']}", headers=auth(seeker))
    assert sibling.json()["status"] == "expired"


async def test_reopening_an_expired_request_for_a_paused_listing_is_409(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    stale = await _post(client, seeker, _body(listing, owner_id))
    assert stale.status_code == 201, stale.text
    await _elapse(stale.json()["id"])
    fresh = await _post(client, seeker, _body(listing, owner_id))
    cancelled = await client.post(
        f"/requests/{fresh.json()['id']}/cancel", headers=auth(seeker)
    )
    assert cancelled.status_code == 200, cancelled.text
    paused = await client.post(f"/listings/{listing}/pause", headers=auth(owner))
    assert paused.status_code == 200, paused.text
    widened = await client.post(
        f"/requests/{stale.json()['id']}/widen", headers=auth(seeker)
    )
    assert widened.status_code == 409, widened.text
    still = await client.get(f"/requests/{stale.json()['id']}", headers=auth(seeker))
    assert still.json()["status"] == "expired"


@pytest.mark.parametrize("action", ["withdraw", "cancel_exchange"])
async def test_reversing_match_keeps_newer_listing_request_open(client, action):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    older = await _post(client, seeker, _body(listing, owner_id))
    assert older.status_code == 201, older.text
    request_path = f"/requests/{older.json()['id']}"
    offer = await client.post(
        f"{request_path}/responses", headers=auth(owner), json={"kind": "offer"}
    )
    assert offer.status_code == 201, offer.text
    offer_path = f"{request_path}/responses/{offer.json()['id']}"
    accepted = await client.post(f"{offer_path}/accept", headers=auth(seeker))
    assert accepted.status_code == 200, accepted.text
    matched = await client.get(request_path, headers=auth(seeker))
    assert matched.status_code == 200, matched.text
    exchange_id = matched.json()["exchange_id"]

    newer = await _post(client, seeker, _body(listing, owner_id))
    assert newer.status_code == 201, newer.text
    assert newer.json()["id"] != older.json()["id"]
    if action == "withdraw":
        reversed_match = await client.post(
            f"{offer_path}/withdraw", headers=auth(owner)
        )
        assert reversed_match.status_code == 200, reversed_match.text
        assert reversed_match.json()["status"] == "withdrawn"
    else:
        reversed_match = await client.post(
            f"/exchanges/{exchange_id}/cancel", headers=auth(seeker)
        )
        assert reversed_match.status_code == 200, reversed_match.text
        assert reversed_match.json()["status"] == "cancelled"

    old_detail = await client.get(request_path, headers=auth(seeker))
    new_detail = await client.get(
        f"/requests/{newer.json()['id']}", headers=auth(seeker)
    )
    assert old_detail.status_code == 200, old_detail.text
    assert new_detail.status_code == 200, new_detail.text
    assert old_detail.json()["status"] == "expired"
    assert new_detail.json()["status"] == "open"


async def test_reopening_elapsed_open_listing_request_ignores_itself(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    request = await _post(client, seeker, _body(listing, owner_id))
    assert request.status_code == 201, request.text
    await _elapse(request.json()["id"])
    widened = await client.post(
        f"/requests/{request.json()['id']}/widen", headers=auth(seeker)
    )
    assert widened.status_code == 200, widened.text
    assert widened.json()["id"] == request.json()["id"]
    assert widened.json()["status"] == "open"


async def _accepted_listing_request(client, owner, seeker, listing):
    owner_id = await _profile_id(client, owner)
    created = await _post(client, seeker, _body(listing, owner_id))
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    path = f"/requests/{request_id}"
    offer = await client.post(
        f"{path}/responses", headers=auth(owner), json={"kind": "offer"}
    )
    assert offer.status_code == 201, offer.text
    offer_path = f"{path}/responses/{offer.json()['id']}"
    accepted = await client.post(f"{offer_path}/accept", headers=auth(seeker))
    assert accepted.status_code == 200, accepted.text
    request = await client.get(path, headers=auth(seeker))
    assert request.status_code == 200, request.text
    return request_id, request.json()["exchange_id"], offer_path


async def test_stale_widen_does_not_block_pickup(client, monkeypatch):
    owner, seeker, listing, _ = await _world(client)
    request_id, exchange_id, _ = await _accepted_listing_request(
        client, owner, seeker, listing
    )
    await confirmed_pickup(client, exchange_id, seeker, owner)
    widen_waiting = asyncio.Event()
    continue_widen = asyncio.Event()
    original = RequestRepository.get_for_update

    async def pause_widen_before_request_lock(self, candidate_id):
        if candidate_id == uuid.UUID(request_id) and not widen_waiting.is_set():
            widen_waiting.set()
            await continue_widen.wait()
        return await original(self, candidate_id)

    monkeypatch.setattr(
        RequestRepository, "get_for_update", pause_widen_before_request_lock
    )
    widening = asyncio.create_task(
        client.post(f"/requests/{request_id}/widen", headers=auth(seeker))
    )
    try:
        await asyncio.wait_for(widen_waiting.wait(), timeout=3)
        pickup = await asyncio.wait_for(
            client.post(f"/exchanges/{exchange_id}/hand-over", headers=auth(owner)),
            timeout=3,
        )
        assert pickup.status_code == 200, pickup.text
    finally:
        continue_widen.set()
        widened = await asyncio.wait_for(widening, timeout=3)

    assert widened.status_code == 409, widened.text


@pytest.mark.parametrize("action", ["withdraw", "cancel_exchange"])
async def test_reversing_match_does_not_reopen_when_listing_is_paused(client, action):
    owner, seeker, listing, _ = await _world(client)
    request_id, exchange_id, offer_path = await _accepted_listing_request(
        client, owner, seeker, listing
    )
    paused = await client.post(f"/listings/{listing}/pause", headers=auth(owner))
    assert paused.status_code == 200, paused.text

    if action == "withdraw":
        reversed_match = await client.post(
            f"{offer_path}/withdraw", headers=auth(owner)
        )
    else:
        reversed_match = await client.post(
            f"/exchanges/{exchange_id}/cancel", headers=auth(seeker)
        )
    assert reversed_match.status_code == 200, reversed_match.text

    request = await client.get(f"/requests/{request_id}", headers=auth(seeker))
    assert request.status_code == 200, request.text
    assert request.json()["status"] == "expired"


async def test_duplicate_send_does_not_block_listing_foreign_key_lock(client):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    assert first.status_code == 201, first.text
    database = Database(_settings())
    duplicate = None
    try:
        async with database.session() as session:
            await session.execute(
                text("SELECT id FROM help_requests WHERE id = :id FOR UPDATE"),
                {"id": uuid.UUID(first.json()["id"])},
            )
            duplicate = asyncio.create_task(
                _post(client, seeker, _body(listing, owner_id))
            )
            for _ in range(200):
                async with database.session() as observer:
                    waiting = await observer.scalar(
                        text(
                            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity "
                            "WHERE datname = current_database() AND wait_event_type = 'Lock' "
                            "AND query LIKE '%help_requests%')"
                        )
                    )
                if waiting:
                    break
                await asyncio.sleep(0.01)
            assert waiting, "duplicate request did not wait for the request row"
            await asyncio.wait_for(
                session.execute(
                    text("SELECT id FROM listings WHERE id = :id FOR KEY SHARE"),
                    {"id": uuid.UUID(listing)},
                ),
                timeout=3,
            )
        result = await asyncio.wait_for(duplicate, timeout=3)
        assert result.status_code == 201, result.text
        assert result.json()["id"] == first.json()["id"]
    finally:
        if duplicate is not None and not duplicate.done():
            duplicate.cancel()
            await asyncio.gather(duplicate, return_exceptions=True)
        await database.close()


async def test_duplicate_send_retries_if_existing_request_is_matched(
    client, monkeypatch
):
    owner, seeker, listing, _ = await _world(client)
    owner_id = await _profile_id(client, owner)
    first = await _post(client, seeker, _body(listing, owner_id))
    assert first.status_code == 201, first.text
    path = f"/requests/{first.json()['id']}"
    offer = await client.post(
        f"{path}/responses", headers=auth(owner), json={"kind": "offer"}
    )
    assert offer.status_code == 201, offer.text
    lookup_started = asyncio.Event()
    continue_lookup = asyncio.Event()
    original = RequestRepository.get_open_for_listing

    async def delayed_lookup(self, *args, **kwargs):
        if kwargs.get("lock"):
            lookup_started.set()
            await continue_lookup.wait()
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(RequestRepository, "get_open_for_listing", delayed_lookup)
    duplicate = asyncio.create_task(_post(client, seeker, _body(listing, owner_id)))
    try:
        await asyncio.wait_for(lookup_started.wait(), timeout=3)
        accepted = await asyncio.wait_for(
            client.post(
                f"{path}/responses/{offer.json()['id']}/accept", headers=auth(seeker)
            ),
            timeout=3,
        )
        assert accepted.status_code == 200, accepted.text
        continue_lookup.set()
        result = await asyncio.wait_for(duplicate, timeout=3)
        assert result.status_code == 201, result.text
        assert result.json()["id"] != first.json()["id"]
    finally:
        continue_lookup.set()
        if not duplicate.done():
            duplicate.cancel()
            await asyncio.gather(duplicate, return_exceptions=True)
