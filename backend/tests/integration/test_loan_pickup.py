import asyncio

import pytest

from tests.integration.conftest import auth, confirmed_pickup, matched_exchange


@pytest.mark.parametrize("unavailable_status", ["paused", "deleted"])
async def test_pickup_requires_an_active_listing(client, unavailable_status):
    match = await matched_exchange(client, loan=True)
    borrower, lender = auth(match["requester"]), auth(match["helper"])
    exchange_path = f"/exchanges/{match['exchange_id']}"
    exchange = await client.get(exchange_path, headers=borrower)
    listing_id = exchange.json()["listing_id"]
    assert listing_id is not None
    listing_path = f"/listings/{listing_id}"

    if unavailable_status == "paused":
        changed = await client.post(f"{listing_path}/pause", headers=lender)
        assert changed.status_code == 200, changed.text
        assert changed.json()["status"] == "paused"
    else:
        changed = await client.delete(listing_path, headers=lender)
        assert changed.status_code == 204, changed.text

    pickup = await client.post(f"{exchange_path}/hand-over", headers=borrower)
    assert pickup.status_code == 409, pickup.text
    saved = await client.get(exchange_path, headers=borrower)
    assert saved.json()["status"] == "scheduled"
    assert saved.json()["handed_over_at"] is None
    request = await client.get(f"/requests/{match['request_id']}", headers=borrower)
    assert request.json()["status"] == "matched"

    if unavailable_status == "paused":
        listing = await client.get(listing_path, headers=lender)
        assert listing.json()["status"] == "paused"
        resumed = await client.post(f"{listing_path}/resume", headers=lender)
        assert resumed.status_code == 200, resumed.text
        retried = await client.post(f"{exchange_path}/hand-over", headers=borrower)
        assert retried.status_code == 200, retried.text
        listing = await client.get(listing_path, headers=lender)
        assert listing.json()["status"] == "lent_out"


async def test_two_matched_loans_cannot_pick_up_the_same_listing(client):
    first = await matched_exchange(client, loan=True)
    borrower, lender = auth(first["requester"]), auth(first["helper"])
    first_path = f"/exchanges/{first['exchange_id']}"
    first_exchange = await client.get(first_path, headers=borrower)
    listing_id = first_exchange.json()["listing_id"]
    assert listing_id is not None

    created = await client.post(
        "/requests",
        headers=borrower,
        json={"kind": "borrow", "raw_text": "Borrow the drill again", "lang": "en"},
    )
    assert created.status_code == 201, created.text
    second_request = f"/requests/{created.json()['id']}"
    offer = await client.post(
        f"{second_request}/responses",
        headers=lender,
        json={"kind": "offer", "listing_id": listing_id},
    )
    assert offer.status_code == 201, offer.text
    accepted = await client.post(
        f"{second_request}/responses/{offer.json()['id']}/accept", headers=borrower
    )
    assert accepted.status_code == 200, accepted.text
    request = await client.get(second_request, headers=borrower)
    second_id = request.json()["exchange_id"]
    second_path = f"/exchanges/{second_id}"
    assert second_path != first_path
    await confirmed_pickup(client, second_id, first["requester"], first["helper"])

    paths = [first_path, second_path]
    pickups = await asyncio.gather(
        *(client.post(f"{path}/hand-over", headers=borrower) for path in paths)
    )
    assert sorted(response.status_code for response in pickups) == [200, 409]
    accepted_index = next(
        index for index, response in enumerate(pickups) if response.status_code == 200
    )
    waiting = await client.get(paths[1 - accepted_index], headers=borrower)
    assert waiting.json()["status"] == "scheduled"
    assert waiting.json()["handed_over_at"] is None
    accepted_pickup = pickups[accepted_index].json()
    retried = await client.post(f"{paths[accepted_index]}/hand-over", headers=lender)
    assert retried.status_code == 200, retried.text
    assert retried.json()["handed_over_at"] == accepted_pickup["handed_over_at"]
    listing = await client.get(f"/listings/{listing_id}", headers=lender)
    assert listing.json()["status"] == "lent_out"
