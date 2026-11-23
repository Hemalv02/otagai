import uuid

from app.database.connection import Database
from app.database.models import Listing
from tests.integration.conftest import (
    _settings,
    auth,
    join_circle,
    make_circle,
    make_user,
    matched_exchange,
)


async def _matched_exchange(client, *, offer_skill=False):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    listing_id = None
    if offer_skill:
        categories = await client.get("/categories?kind=skill", headers=auth(helper))
        listing = await client.post(
            "/listings",
            headers=auth(helper),
            json={
                "kind": "skill",
                "category_id": categories.json()["items"][0]["id"],
                "title": "Help moving boxes",
                "lang": "en",
            },
        )
        assert listing.status_code == 201
        listing_id = listing.json()["id"]
    exchange_id = await _match_help(client, requester, helper, listing_id)
    return requester, helper, exchange_id


async def _match_help(client, requester, helper, listing_id=None):
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Carry boxes", "lang": "ja"},
        )
    ).json()["id"]
    offer = {"kind": "offer"}
    if listing_id:
        offer["listing_id"] = listing_id
    response_id = (
        await client.post(
            f"/requests/{request_id}/responses",
            headers=auth(helper),
            json=offer,
        )
    ).json()["id"]
    accepted = await client.post(
        f"/requests/{request_id}/responses/{response_id}/accept",
        headers=auth(requester),
    )
    assert accepted.status_code == 200
    request = await client.get(f"/requests/{request_id}", headers=auth(helper))
    assert request.status_code == 200
    return request.json()["exchange_id"]


async def test_full_exchange_completes_and_updates_pair(client):
    requester, helper, exchange_id = await _matched_exchange(client)

    handed = await client.post(
        f"/exchanges/{exchange_id}/hand-over", headers=auth(helper)
    )
    assert handed.status_code == 200
    assert handed.json()["status"] == "active"

    first = await client.post(
        f"/exchanges/{exchange_id}/confirm", headers=auth(requester)
    )
    assert first.status_code == 200
    assert first.json()["status"] == "active"  # waiting on the other side

    second = await client.post(
        f"/exchanges/{exchange_id}/confirm", headers=auth(helper)
    )
    assert second.status_code == 200
    assert second.json()["status"] == "completed"

    neighbours = await client.get("/users/me/neighbours", headers=auth(requester))
    assert neighbours.status_code == 200
    items = neighbours.json()["items"]
    assert len(items) == 1
    assert items[0]["they_helped_me"] == 1


async def test_cancel_after_handover_is_409(client):
    _, helper, exchange_id = await _matched_exchange(client)
    handed = await client.post(
        f"/exchanges/{exchange_id}/hand-over", headers=auth(helper)
    )
    assert handed.status_code == 200
    cancelled = await client.post(
        f"/exchanges/{exchange_id}/cancel", headers=auth(helper)
    )
    assert cancelled.status_code == 409


async def test_starting_help_does_not_mark_a_skill_as_lent_out(client):
    requester, helper, exchange_id = await _matched_exchange(client, offer_skill=True)
    path = f"/exchanges/{exchange_id}"
    started = await client.post(f"{path}/hand-over", headers=auth(helper))
    assert started.status_code == 200
    assert started.json()["status"] == "active"
    listing_path = f"/listings/{started.json()['listing_id']}"
    listing = await client.get(listing_path, headers=auth(helper))
    assert listing.json()["status"] == "active"

    assert (
        await client.post(f"{path}/confirm", headers=auth(requester))
    ).status_code == 200
    confirmed = await client.post(f"{path}/confirm", headers=auth(helper))
    assert confirmed.json()["status"] == "completed"
    listing = await client.get(listing_path, headers=auth(helper))
    assert listing.json()["status"] == "active"
    assert listing.json()["available_again_at"] is None


async def test_completing_legacy_help_releases_its_listing(client):
    requester, helper, exchange_id = await _matched_exchange(client, offer_skill=True)
    path = f"/exchanges/{exchange_id}"
    started = await client.post(f"{path}/hand-over", headers=auth(helper))
    listing_id = started.json()["listing_id"]

    # Before this change, starting a help exchange could reserve the listing.
    database = Database(_settings())
    try:
        async with database.session() as session:
            listing = await session.get(Listing, uuid.UUID(listing_id))
            assert listing is not None
            listing.status = "lent_out"
    finally:
        await database.close()

    await client.post(f"{path}/confirm", headers=auth(requester))
    confirmed = await client.post(f"{path}/confirm", headers=auth(helper))
    assert confirmed.json()["status"] == "completed"
    listing = await client.get(f"/listings/{listing_id}", headers=auth(helper))
    assert listing.json()["status"] == "active"


async def test_completing_help_does_not_release_a_listing_in_an_ongoing_loan(client):
    loan = await matched_exchange(client, loan=True)
    requester, helper = loan["requester"], loan["helper"]
    borrowed = await client.post(
        f"/exchanges/{loan['exchange_id']}/hand-over", headers=auth(helper)
    )
    assert borrowed.status_code == 200
    listing_id = borrowed.json()["listing_id"]
    help_id = await _match_help(client, requester, helper, listing_id)
    path = f"/exchanges/{help_id}"
    started = await client.post(f"{path}/hand-over", headers=auth(helper))
    assert started.status_code == 200

    await client.post(f"{path}/confirm", headers=auth(requester))
    confirmed = await client.post(f"{path}/confirm", headers=auth(helper))
    assert confirmed.json()["status"] == "completed"
    listing = await client.get(f"/listings/{listing_id}", headers=auth(helper))
    assert listing.json()["status"] == "lent_out"


async def test_non_participant_cannot_see_exchange_404(client):
    _, _, exchange_id = await _matched_exchange(client)
    outsider = await make_user(client, display_name="Outsider")
    response = await client.get(f"/exchanges/{exchange_id}", headers=auth(outsider))
    assert response.status_code == 404


async def test_thank_you_requires_completed_exchange_409(client):
    requester, _, exchange_id = await _matched_exchange(client)
    # Exchange is only scheduled -> thanking is premature.
    response = await client.post(
        "/thank-yous",
        headers=auth(requester),
        json={"exchange_id": exchange_id, "gift_type": "note", "note": "thanks"},
    )
    assert response.status_code == 409
