import uuid
from datetime import UTC, datetime, timedelta

from app.database.connection import Database
from app.database.models import HelpRequest
from tests.integration.conftest import (
    _settings,
    auth,
    join_circle,
    make_circle,
    make_user,
    matched_exchange,
)


async def _request_with_offer(client):
    requester = await make_user(client, display_name="Requester")
    helper = await make_user(client, display_name="Helper")
    circle_id = await make_circle(client, requester)
    await join_circle(client, requester, circle_id, helper)
    request_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Help", "lang": "ja"},
        )
    ).json()["id"]
    await client.post(
        f"/requests/{request_id}/responses",
        headers=auth(helper),
        json={"kind": "offer"},
    )
    return requester, helper


async def test_notifications_list_read_and_counts(client):
    requester, _helper = await _request_with_offer(client)

    # The offer created a RESPONSE_RECEIVED notification for the requester.
    listed = await client.get("/users/me/notifications", headers=auth(requester))
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) >= 1
    notification_id = items[0]["id"]

    counts = await client.get("/users/me/unread-counts", headers=auth(requester))
    assert counts.status_code == 200
    assert counts.json()["notifications"] >= 1

    read = await client.patch(
        f"/users/me/notifications/{notification_id}", headers=auth(requester)
    )
    assert read.status_code == 200
    assert read.json()["read_at"] is not None

    all_read = await client.post(
        "/users/me/notifications/read-all", headers=auth(requester)
    )
    assert all_read.status_code == 204

    after = await client.get("/users/me/unread-counts", headers=auth(requester))
    assert after.json()["notifications"] == 0


async def test_foreign_notification_404(client):
    requester, helper = await _request_with_offer(client)
    notification_id = (
        await client.get("/users/me/notifications", headers=auth(requester))
    ).json()["items"][0]["id"]
    # The helper cannot mark the requester's notification read.
    response = await client.patch(
        f"/users/me/notifications/{notification_id}", headers=auth(helper)
    )
    assert response.status_code == 404


async def test_unread_filter_before_pagination_and_owner_isolation(client):
    requester, helper = await _request_with_offer(client)
    for _ in range(4):
        request = await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "help", "raw_text": "Help again", "lang": "en"},
        )
        assert request.status_code == 201
        offered = await client.post(
            f"/requests/{request.json()['id']}/responses",
            headers=auth(helper),
            json={"kind": "offer"},
        )
        assert offered.status_code == 201
    initial = (
        await client.get("/users/me/notifications", headers=auth(requester))
    ).json()["items"]
    assert len(initial) == 5
    read_ids = {item["id"] for item in initial[::2]}
    for notification_id in read_ids:
        result = await client.patch(
            f"/users/me/notifications/{notification_id}",
            headers=auth(requester),
            json={},
        )
        assert result.status_code == 200
    expected = [item["id"] for item in initial if item["id"] not in read_ids]
    found = []
    cursor = None
    while True:
        params = {"unread_only": "true", "limit": 1}
        if cursor:
            params["cursor"] = cursor
        page = await client.get(
            "/users/me/notifications", headers=auth(requester), params=params
        )
        assert page.status_code == 200, page.text
        assert all(item["read_at"] is None for item in page.json()["items"])
        found.extend(item["id"] for item in page.json()["items"])
        cursor = page.json()["next_cursor"]
        if cursor is None:
            break
    assert found == expected
    default_feed = (
        await client.get("/users/me/notifications", headers=auth(requester))
    ).json()["items"]
    assert [item["id"] for item in default_feed] == [item["id"] for item in initial]
    assert {item["id"] for item in default_feed if item["read_at"]} == read_ids
    foreign = (
        await client.get(
            "/users/me/notifications?unread_only=true", headers=auth(helper)
        )
    ).json()["items"]
    assert not {item["id"] for item in foreign} & {item["id"] for item in initial}
    counts = await client.get("/users/me/unread-counts", headers=auth(requester))
    assert counts.json()["notifications"] == len(expected)
    await client.post("/users/me/notifications/read-all", headers=auth(requester))
    empty = await client.get(
        "/users/me/notifications?unread_only=true", headers=auth(requester)
    )
    assert empty.json() == {"items": [], "next_cursor": None}
    assert (
        await client.get("/users/me/unread-counts", headers=auth(requester))
    ).json()["notifications"] == 0


async def test_notifications_require_auth_401(client):
    assert (await client.get("/users/me/notifications")).status_code == 401
    assert (await client.get("/users/me/unread-counts")).status_code == 401


async def test_home_aggregates(client):
    _requester, helper = await _request_with_offer(client)
    home = await client.get("/users/me/home", headers=auth(helper))
    assert home.status_code == 200
    body = home.json()
    assert "received_requests" in body
    assert "active_exchanges" in body
    assert "due_soon" in body


async def test_home_lists_only_open_received_requests(client):
    requester, helper = await _request_with_offer(client)
    open_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "borrow", "raw_text": "Ladder", "lang": "en"},
        )
    ).json()["id"]
    cancelled_id = (
        await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "borrow", "raw_text": "Drill", "lang": "en"},
        )
    ).json()["id"]
    cancel = await client.post(
        f"/requests/{cancelled_id}/cancel", headers=auth(requester)
    )
    assert cancel.status_code == 200

    body = (await client.get("/users/me/home", headers=auth(helper))).json()
    ids = {item["id"] for item in body["received_requests"]}
    assert open_id in ids
    assert cancelled_id not in ids
    assert all(item["status"] == "open" for item in body["received_requests"])


async def test_home_filters_elapsed_requests_before_limiting_received_rows(client):
    requester, helper = await _request_with_offer(client)
    original = await client.get("/users/me/home", headers=auth(helper))
    assert original.status_code == 200, original.text
    open_ids = [row["id"] for row in original.json()["received_requests"]]
    assert len(open_ids) == 1

    elapsed_ids = []
    for _ in range(5):
        created = await client.post(
            "/requests",
            headers=auth(requester),
            json={"kind": "borrow", "raw_text": "Borrow a ladder", "lang": "en"},
        )
        assert created.status_code == 201, created.text
        elapsed_ids.append(uuid.UUID(created.json()["id"]))

    expires_at = datetime.now(UTC) - timedelta(minutes=1)
    database = Database(_settings())
    try:
        async with database.session() as session:
            for request_id in elapsed_ids:
                request = await session.get(HelpRequest, request_id)
                assert request is not None
                request.expires_at = expires_at
    finally:
        await database.close()

    home = await client.get("/users/me/home", headers=auth(helper))
    assert home.status_code == 200, home.text
    assert [row["id"] for row in home.json()["received_requests"]] == open_ids


async def _match_loan(client, requester, helper, due_at: datetime | None = None):
    request = await client.post(
        "/requests",
        headers=auth(requester),
        json={"kind": "borrow", "raw_text": "Borrow a drill", "lang": "en"},
    )
    assert request.status_code == 201, request.text
    path = f"/requests/{request.json()['id']}"
    offer = await client.post(
        f"{path}/responses", headers=auth(helper), json={"kind": "offer"}
    )
    assert offer.status_code == 201, offer.text
    accepted = await client.post(
        f"{path}/responses/{offer.json()['id']}/accept", headers=auth(requester)
    )
    assert accepted.status_code == 200, accepted.text
    if due_at is None:
        return None

    detail = await client.get(path, headers=auth(requester))
    assert detail.status_code == 200, detail.text
    exchange_id = detail.json()["exchange_id"]
    await _set_due_date(client, requester, exchange_id, due_at)
    return exchange_id


async def _set_due_date(client, requester, exchange_id, due_at: datetime):
    exchange = await client.patch(
        f"/exchanges/{exchange_id}",
        headers=auth(requester),
        json={"due_at": due_at.isoformat()},
    )
    assert exchange.status_code == 200, exchange.text


async def test_home_lists_the_earliest_five_due_loans_among_all_exchanges(client):
    matched = await matched_exchange(client, loan=True)
    requester, helper = matched["requester"], matched["helper"]
    now = datetime.now(UTC)
    overdue = matched["exchange_id"]
    await _set_due_date(client, requester, overdue, now - timedelta(hours=1))
    handed = await client.post(f"/exchanges/{overdue}/hand-over", headers=auth(helper))
    assert handed.status_code == 200, handed.text

    await _match_loan(client, requester, helper, now + timedelta(hours=25))
    await _match_loan(client, requester, helper)
    cancelled = await _match_loan(client, requester, helper, now + timedelta(hours=1))
    cancellation = await client.post(
        f"/exchanges/{cancelled}/cancel", headers=auth(requester)
    )
    assert cancellation.status_code == 200, cancellation.text

    home = await client.get("/users/me/home", headers=auth(helper))
    assert home.status_code == 200, home.text
    assert [row["id"] for row in home.json()["active_exchanges"]] == [overdue]
    assert [row["id"] for row in home.json()["due_soon"]] == [overdue]

    for _ in range(48):
        await _match_loan(client, requester, helper)

    await _match_loan(client, requester, helper, now + timedelta(hours=6))
    fourth = await _match_loan(client, requester, helper, now + timedelta(hours=4))
    earliest = await _match_loan(client, requester, helper, now + timedelta(hours=1))
    same_due_at = now + timedelta(hours=2)
    tied = sorted(
        [
            await _match_loan(client, requester, helper, same_due_at),
            await _match_loan(client, requester, helper, same_due_at),
        ]
    )

    home = await client.get("/users/me/home", headers=auth(helper))
    assert home.status_code == 200, home.text
    assert [row["id"] for row in home.json()["due_soon"]] == [
        overdue,
        earliest,
        *tied,
        fourth,
    ]
