import asyncio

import pytest

from tests.integration.conftest import (
    auth,
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


async def test_wrong_owner_and_missing_recipient_are_400(client):
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
            "ripple_max_stage": "han",
        },
    )
    assert missing.status_code == 400, missing.text


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
    stale = await _post(
        client,
        seeker,
        _body(listing, owner_id, needed_until="2020-01-01T00:00:00Z"),
    )
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
    stale = await _post(
        client,
        seeker,
        _body(listing, owner_id, needed_until="2020-01-01T00:00:00Z"),
    )
    fresh = await _post(client, seeker, _body(listing, owner_id))
    assert fresh.json()["id"] != stale.json()["id"]
    widened = await client.post(
        f"/requests/{stale.json()['id']}/widen", headers=auth(seeker)
    )
    assert widened.status_code == 409, widened.text
    assert widened.json()["message"]


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
