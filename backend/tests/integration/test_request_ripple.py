import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text

from app.database.connection import Database
from app.database.models import RequestRecipient
from app.repositories.assistant import AssistantRepository
from app.repositories.pair_stats import PairStatsRepository
from app.services.notifications import dispatch
from app.services.requests.ripple import process_due_requests
from tests.integration.conftest import (
    _settings,
    auth,
    join_circle,
    make_circle,
    make_user,
)
from tests.integration.test_media import _png
from tests.integration.test_relationships import _family_with_open_request
from tests.integration.test_request_push import _register


async def _accepted_family(client, requester, relative):
    user = await client.get("/users/me", headers=auth(relative))
    link = await client.post(
        "/family-links",
        headers=auth(requester),
        json={"relative_user_id": user.json()["id"], "relation": "sibling"},
    )
    assert link.status_code == 201, link.text
    accepted = await client.post(
        f"/family-links/{link.json()['id']}/accept", headers=auth(relative)
    )
    assert accepted.status_code == 200, accepted.text


async def _post(client, token, **options):
    response = await client.post(
        "/requests",
        headers=auth(token),
        json={
            "kind": "help",
            "raw_text": "Help carrying a bag",
            "lang": "en",
            **options,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _receipt(client, owner, request_id):
    response = await client.get(f"/requests/{request_id}/receipt", headers=auth(owner))
    assert response.status_code == 200, response.text
    return response.json()


async def _circle(client, owner, kind, latitude, *, open_to_nearby=True):
    response = await client.post(
        "/circles",
        headers=auth(owner),
        json={
            "name": f"{kind} at {latitude}",
            "unit_type": kind,
            "approx_lat": latitude,
            "approx_lng": 129.87,
            "open_to_nearby": open_to_nearby,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _tick(request_id, at):
    database = Database(_settings())
    try:
        return await process_due_requests(
            database, request_id=uuid.UUID(request_id), now=at
        )
    finally:
        await database.close()


async def test_ripple_begins_with_accepted_family_and_protects_later_audiences(client):
    owner = await make_user(client)
    family = await make_user(client, region="bd")
    neighbour = await make_user(client)
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, neighbour)
    await _accepted_family(client, owner, family)

    request = await _post(client, owner, ripple_max_stage="nearby")
    assert request["ripple_stage"] == "family"
    path = f"/requests/{request['id']}"
    assert (await client.get(path, headers=auth(family))).status_code == 200
    assert (await client.get(path, headers=auth(neighbour))).status_code == 404
    assert (
        await client.get(f"{path}/receipt", headers=auth(family))
    ).status_code == 404
    owner_profile = await client.get("/users/me", headers=auth(owner))
    history = await client.get(
        f"/users/{owner_profile.json()['id']}/requests?status=open&limit=10",
        headers=auth(neighbour),
    )
    assert history.status_code == 200, history.text
    assert history.json()["items"] == []


async def test_request_receipt_reports_actual_inbox_delivery(client):
    owner = await make_user(client)
    neighbour = await make_user(client)
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, neighbour)
    request = await _post(client, owner)
    receipt = await client.get(
        f"/requests/{request['id']}/receipt", headers=auth(owner)
    )
    assert receipt.status_code == 200, receipt.text
    assert receipt.json()["current_stage"] == "han"
    assert receipt.json()["max_stage"] == "han"
    assert receipt.json()["next_widen_at"] is None
    assert len(receipt.json()["stages"]) == 1
    stage = receipt.json()["stages"][0]
    assert stage["stage"] == "han"
    assert stage["status"] == "sent"
    assert stage["recipient_count"] == 1
    assert stage["delivered_at"] is not None


async def test_due_workers_deliver_distinct_approved_geographic_audiences(client):
    (
        owner,
        family,
        han,
        association,
        sibling,
        nearby,
        closer_nearby,
        distant,
        private,
        pending,
        blocked,
    ) = [await make_user(client) for _ in range(11)]
    home = await _circle(client, owner, "han", 32.75)
    association_id = await _circle(client, association, "association", 32.75)
    sibling_id = await _circle(client, sibling, "han", 32.755)
    nearby_id = await _circle(client, nearby, "han", 32.76)
    await _circle(client, closer_nearby, "han", 32.753)
    await _circle(client, distant, "han", 33)
    await _circle(client, private, "han", 32.76, open_to_nearby=False)
    await join_circle(client, owner, home, han)
    await join_circle(client, owner, home, family)
    await join_circle(client, nearby, nearby_id, blocked)
    await _accepted_family(client, owner, family)
    pending_join = await client.post(
        "/users/me/memberships", headers=auth(pending), json={"circle_id": nearby_id}
    )
    assert pending_join.json()["status"] == "pending", pending_join.text
    owner_id = (await client.get("/users/me", headers=auth(owner))).json()["id"]
    blocked_response = await client.post(
        "/users/me/blocks", headers=auth(blocked), json={"user_id": owner_id}
    )
    assert blocked_response.status_code == 201, blocked_response.text
    for leader, circle_id in ((association, association_id), (sibling, sibling_id)):
        await join_circle(client, leader, circle_id, owner)
        promoted = await client.patch(
            f"/circles/{circle_id}/memberships/{owner_id}",
            headers=auth(leader),
            json={"role": "leader"},
        )
        assert promoted.status_code == 200, promoted.text
    for child_id in (home, sibling_id):
        linked = await client.patch(
            f"/circles/{child_id}",
            headers=auth(owner),
            json={"parent_id": association_id},
        )
        assert linked.status_code == 200, linked.text

    request = await _post(client, owner, home_circle_id=home, ripple_max_stage="nearby")
    request_id = request["id"]
    path = f"/requests/{request_id}"
    receipt = await _receipt(client, owner, request_id)
    assert [stage["status"] for stage in receipt["stages"]] == [
        "sent",
        "scheduled",
        "pending",
        "pending",
    ]
    deadline = datetime.fromisoformat(receipt["next_widen_at"])
    assert await _tick(request_id, deadline - timedelta(seconds=1)) == 0
    assert sorted(
        await asyncio.gather(_tick(request_id, deadline), _tick(request_id, deadline))
    ) == [0, 1]
    assert (await client.get(path, headers=auth(han))).status_code == 200
    assert (await client.get(path, headers=auth(association))).status_code == 404

    for stage in ("association", "nearby"):
        receipt = await _receipt(client, owner, request_id)
        assert (
            await _tick(request_id, datetime.fromisoformat(receipt["next_widen_at"]))
            == 1
        )
        assert (await _receipt(client, owner, request_id))["current_stage"] == stage

    final = await _receipt(client, owner, request_id)
    assert [stage["recipient_count"] for stage in final["stages"]] == [1, 1, 2, 2]
    assert final["next_widen_at"] is None
    assert await _tick(request_id, deadline + timedelta(days=1)) == 0
    for token in (family, han, association, sibling, nearby, closer_nearby):
        assert (await client.get(path, headers=auth(token))).status_code == 200
    for token in (distant, private, pending, blocked):
        assert (await client.get(path, headers=auth(token))).status_code == 404

    nearest_ids = [
        (await client.get("/users/me", headers=auth(token))).json()["id"]
        for token in (closer_nearby, nearby)
    ]
    database = Database(_settings())
    try:
        async with database.session() as session:
            rows = await session.scalars(
                select(RequestRecipient).where(
                    RequestRecipient.request_id == uuid.UUID(request_id),
                    RequestRecipient.stage == "nearby",
                )
            )
            rank = {str(row.user_id): row.match_reasons["rank"] for row in rows}
        assert [rank[user_id] for user_id in nearest_ids] == [1, 2]
    finally:
        await database.close()


@pytest.mark.parametrize("terminal", ["matched", "cancelled", "expired"])
async def test_terminal_requests_do_not_dispatch_later_audiences(client, terminal):
    owner, family, han = [await make_user(client) for _ in range(3)]
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, han)
    await _accepted_family(client, owner, family)
    expiry = datetime.now(UTC) + timedelta(hours=8)
    request = await _post(
        client,
        owner,
        ripple_start_stage="family",
        ripple_max_stage="han",
        needed_until=expiry.isoformat(),
    )
    request_id = request["id"]
    path = f"/requests/{request_id}"
    initial = await _receipt(client, owner, request_id)
    deadline = datetime.fromisoformat(initial["next_widen_at"])
    if terminal == "matched":
        offered = await client.post(
            f"{path}/responses", headers=auth(family), json={"kind": "offer"}
        )
        assert offered.status_code == 201, offered.text
        accepted = await client.post(
            f"{path}/responses/{offered.json()['id']}/accept", headers=auth(owner)
        )
        assert accepted.status_code == 200, accepted.text
    if terminal == "cancelled":
        cancelled = await client.post(f"{path}/cancel", headers=auth(owner))
        assert cancelled.status_code == 200, cancelled.text
    if terminal == "expired":
        assert await _tick(request_id, expiry) == 1
    else:
        assert await _tick(request_id, deadline) == 0
    final = await _receipt(client, owner, request_id)
    assert final["request_status"] == terminal
    assert final["next_widen_at"] is None
    assert [stage["status"] for stage in final["stages"]] == ["sent", "stopped"]
    assert (await client.get(path, headers=auth(han))).status_code == 404


async def test_empty_family_is_skipped_and_maximum_is_enforced(client):
    owner, han = [await make_user(client) for _ in range(2)]
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, han)
    request = await _post(
        client, owner, ripple_start_stage="family", ripple_max_stage="han"
    )
    receipt = await _receipt(client, owner, request["id"])
    assert receipt["current_stage"] == receipt["max_stage"] == "han"
    assert receipt["next_widen_at"] is None
    assert [stage["status"] for stage in receipt["stages"]] == ["no_recipients", "sent"]
    assert receipt["stages"][0]["delivered_at"] is None


async def test_assistant_confirmation_retains_the_chosen_maximum_on_retry(client):
    owner = await make_user(client)
    family = await make_user(client)
    circle = await make_circle(client, owner)
    await _accepted_family(client, owner, family)
    profile = await client.get("/users/me", headers=auth(owner))
    owner_id = uuid.UUID(profile.json()["id"])
    database = Database(_settings())
    try:
        async with database.session() as session:
            assistant = AssistantRepository(session)
            thread = await assistant.create_thread(owner_id, "Request draft")
            turn = await assistant.create_turn(
                thread.id,
                {
                    "reply": "I drafted this request.",
                    "context": {"language": "en", "listing_ids": []},
                    "draft": {"title": "Carry a bag"},
                },
            )
            turn_id = str(turn.id)
    finally:
        await database.close()
    path = f"/assistant/turns/{turn_id}/confirm"
    payload = {
        "kind": "help",
        "text": "Could someone help carry a bag?",
        "home_circle_id": circle,
        "ripple_max_stage": "family",
    }
    first = await client.post(path, headers=auth(owner), json=payload)
    assert first.status_code == 201, first.text
    replay = await client.post(
        path, headers=auth(owner), json={**payload, "ripple_max_stage": "nearby"}
    )
    assert replay.status_code == 200, replay.text
    request_id = first.json()["id"]
    assert replay.json()["id"] == request_id
    receipt = await _receipt(client, owner, request_id)
    assert receipt["current_stage"] == receipt["max_stage"] == "family"
    assert receipt["next_widen_at"] is None
    assert receipt["stages"][0]["recipient_count"] == 1


async def test_explicit_widen_retries_cannot_skip_an_extra_stage(client):
    owner, family, han = [await make_user(client) for _ in range(3)]
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, han)
    await _accepted_family(client, owner, family)
    request = await _post(client, owner, ripple_max_stage="association")
    request_id = request["id"]
    assert request["ripple_stage"] == "family"
    path = f"/requests/{request_id}/widen"
    calls = await asyncio.gather(
        *(
            client.post(path, headers=auth(owner), json={"expected_stage": "family"})
            for _ in range(2)
        )
    )
    assert [response.status_code for response in calls] == [200, 200]
    receipt = await _receipt(client, owner, request_id)
    assert receipt["current_stage"] == "han"
    assert [stage["status"] for stage in receipt["stages"]] == [
        "sent",
        "sent",
        "scheduled",
    ]


async def test_circle_dashboards_and_maps_only_show_requests_opened_to_the_circle(
    client,
):
    leader, owner, other = [await make_user(client) for _ in range(3)]
    circle = await _circle(client, leader, "han", 32.75)
    await join_circle(client, leader, circle, owner)
    await join_circle(client, leader, circle, other)
    await _accepted_family(client, owner, leader)
    other_id = (await client.get("/users/me", headers=auth(other))).json()["id"]
    await _post(client, owner, ripple_max_stage="family")
    await _post(client, owner, direct_to_user_id=other_id)
    staged = await _post(client, owner, ripple_start_stage="family")
    public = await _post(client, owner)

    async def verify_dashboard(expected):
        for suffix in ("requests", "unmet-needs"):
            dashboard = await client.get(
                f"/circles/{circle}/{suffix}", headers=auth(leader)
            )
            assert dashboard.status_code == 200, dashboard.text
            assert {item["id"] for item in dashboard.json()["items"]} == expected
        for viewer in (leader, other):
            pins = await client.get(
                "/map-pins?bbox=-180,-90,180,90", headers=auth(viewer)
            )
            assert pins.status_code == 200, pins.text
            assert pins.json()["items"][0]["open_requests"] == len(expected)

    await verify_dashboard({public["id"]})
    initial = await _receipt(client, owner, staged["id"])
    assert (
        await _tick(staged["id"], datetime.fromisoformat(initial["next_widen_at"])) == 1
    )
    await verify_dashboard({public["id"], staged["id"]})

    owner_id = (await client.get("/users/me", headers=auth(owner))).json()["id"]
    blocked = await client.post(
        "/users/me/blocks", headers=auth(leader), json={"user_id": owner_id}
    )
    assert blocked.status_code == 201, blocked.text
    for suffix in ("requests", "unmet-needs"):
        dashboard = await client.get(
            f"/circles/{circle}/{suffix}", headers=auth(leader)
        )
        assert dashboard.json()["items"] == []
    pins = await client.get("/map-pins?bbox=-180,-90,180,90", headers=auth(leader))
    assert pins.json()["items"][0]["open_requests"] == 0


async def _request_photo(client, owner):
    upload = await client.post(
        "/media",
        headers=auth(owner),
        files={"file": ("request.png", _png(), "image/png")},
        data={"purpose": "request"},
    )
    assert upload.status_code == 201, upload.text
    return upload.json()["id"]


async def test_request_upload_and_undelivered_audience_stay_private(client):
    owner, neighbour = [await make_user(client) for _ in range(2)]
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, neighbour)
    media_id = await _request_photo(client, owner)
    path = f"/media/{media_id}"
    assert (await client.get(path, headers=auth(owner))).status_code == 200
    assert (await client.get(path, headers=auth(neighbour))).status_code == 404
    await _post(client, owner, ripple_max_stage="family", media_ids=[media_id])
    assert (await client.get(path, headers=auth(neighbour))).status_code == 404
    await _post(client, owner, media_ids=[media_id])
    assert (await client.get(path, headers=auth(neighbour))).status_code == 200


async def test_attached_photo_is_visible_to_delivered_family_across_circles(client):
    owner, family, outsider = [await make_user(client) for _ in range(3)]
    await make_circle(client, owner)
    await _accepted_family(client, owner, family)
    media_id = await _request_photo(client, owner)
    path = f"/media/{media_id}"
    await _post(client, owner, ripple_max_stage="family", media_ids=[media_id])
    assert (await client.get(path, headers=auth(family))).status_code == 200
    assert (await client.get(path, headers=auth(outsider))).status_code == 404
    owner_id = (await client.get("/users/me", headers=auth(owner))).json()["id"]
    blocked = await client.post(
        "/users/me/blocks", headers=auth(family), json={"user_id": owner_id}
    )
    assert blocked.status_code == 201, blocked.text
    assert (await client.get(path, headers=auth(family))).status_code == 404


@pytest.mark.parametrize("can_view_activity", [False, True])
async def test_request_photo_actor_must_have_activity_scope(client, can_view_activity):
    pair = await _family_with_open_request(client, can_view_activity=can_view_activity)
    acting = {**auth(pair["caretaker"]), "X-Acting-For": pair["member_id"]}
    upload = await client.post(
        "/media",
        headers=acting,
        files={"file": ("request.png", _png(), "image/png")},
        data={"purpose": "request"},
    )
    assert upload.status_code == 201, upload.text
    path = f"/media/{upload.json()['id']}"
    assert (await client.get(path, headers=auth(pair["member"]))).status_code == 200
    assert (await client.get(path, headers=auth(pair["caretaker"]))).status_code == 404
    assert (await client.get(path, headers=acting)).status_code == (
        200 if can_view_activity else 404
    )


async def test_extending_expiry_restores_widening_from_last_delivery(client):
    owner, family, han = [await make_user(client) for _ in range(3)]
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, han)
    await _accepted_family(client, owner, family)
    now = datetime.now(UTC)
    request = await _post(
        client,
        owner,
        ripple_start_stage="family",
        needed_until=(now + timedelta(hours=5)).isoformat(),
    )
    request_id = request["id"]
    receipt = await _receipt(client, owner, request_id)
    assert receipt["next_widen_at"] is None
    path = f"/requests/{request_id}"
    extended = await client.patch(
        path,
        headers=auth(owner),
        json={"needed_until": (now + timedelta(hours=8)).isoformat()},
    )
    assert extended.status_code == 200, extended.text
    receipt = await _receipt(client, owner, request_id)
    assert datetime.fromisoformat(receipt["next_widen_at"]) == datetime.fromisoformat(
        receipt["stages"][0]["delivered_at"]
    ) + timedelta(hours=6)


@pytest.mark.parametrize("action", ["withdraw", "cancel_exchange"])
@pytest.mark.parametrize("expired", [False, True])
async def test_reopening_a_match_restores_widening_before_expiry(
    client, action, expired
):
    owner, family, han = [await make_user(client) for _ in range(3)]
    circle = await make_circle(client, owner)
    await join_circle(client, owner, circle, han)
    await _accepted_family(client, owner, family)
    request = await _post(client, owner, ripple_start_stage="family")
    request_id = request["id"]
    path = f"/requests/{request_id}"
    initial = await _receipt(client, owner, request_id)
    offer = await client.post(
        f"{path}/responses", headers=auth(family), json={"kind": "offer"}
    )
    assert offer.status_code == 201, offer.text
    offer_path = f"{path}/responses/{offer.json()['id']}"
    accepted = await client.post(f"{offer_path}/accept", headers=auth(owner))
    assert accepted.status_code == 200, accepted.text
    assert (await _receipt(client, owner, request_id))["next_widen_at"] is None
    if expired:
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
    if action == "withdraw":
        reversed_match = await client.post(
            f"{offer_path}/withdraw", headers=auth(family)
        )
    else:
        matched = await client.get(path, headers=auth(owner))
        reversed_match = await client.post(
            f"/exchanges/{matched.json()['exchange_id']}/cancel", headers=auth(owner)
        )
    assert reversed_match.status_code == 200, reversed_match.text
    final = await _receipt(client, owner, request_id)
    assert final["request_status"] == ("expired" if expired else "open")
    assert final["next_widen_at"] == (None if expired else initial["next_widen_at"])


async def test_smart_ripple_delivers_available_equivalent_tools_and_reciprocity_first(
    client, monkeypatch
):
    owner, available, paused, owing, owed, tied1, tied2 = [
        await make_user(client) for _ in range(7)
    ]
    home = await make_circle(client, owner)
    candidates = {
        available: "equivalent",
        paused: "paused",
        owing: "owes-requester",
        owed: "requester-owes",
        tied1: "first-tie",
        tied2: "second-tie",
    }
    ids = {}
    for member in (owner, *candidates):
        profile = await client.get("/users/me", headers=auth(member))
        ids[member] = uuid.UUID(profile.json()["id"])
        if member != owner:
            await join_circle(client, owner, home, member)
            await _register(client, member, candidates[member])

    categories = await client.get("/categories?kind=tool", headers=auth(owner))
    category_id = categories.json()["items"][0]["id"]
    for member, title in (
        (available, "Power washer"),
        (paused, "Pressure washer"),
        (tied2, "Karcher wet vacuum and flat washers"),
    ):
        listing = await client.post(
            "/listings",
            headers=auth(member),
            json={
                "kind": "tool",
                "title": title,
                "category_id": category_id,
                "lang": "en",
            },
        )
        assert listing.status_code == 201, listing.text
        if member == paused:
            stopped = await client.post(
                f"/listings/{listing.json()['id']}/pause", headers=auth(member)
            )
            assert stopped.status_code == 200, stopped.text

    database = Database(_settings())
    sent = []

    async def send(_settings, message):
        sent.append(message.to)
        return "accepted"

    monkeypatch.setattr(dispatch, "send_push", send)
    try:
        async with database.session() as session:
            pairs = PairStatsRepository(session)
            await pairs.record_exchange(ids[owner], ids[owing], datetime.now(UTC))
            await pairs.record_exchange(ids[owed], ids[owner], datetime.now(UTC))

        request = await _post(
            client,
            owner,
            kind="borrow",
            raw_text="Can I borrow a Karcher pressure washer?",
        )
        expected = [
            available,
            owing,
            *sorted([tied1, tied2], key=ids.get),
            owed,
            paused,
        ]
        for _ in expected:
            assert await dispatch.dispatch_next(database, _settings())
        assert sent == [f"ExpoPushToken[{candidates[member]}]" for member in expected]
        async with database.session() as session:
            rows = await session.scalars(
                select(RequestRecipient).where(
                    RequestRecipient.request_id == uuid.UUID(request["id"])
                )
            )
            ranks = {row.user_id: row.match_reasons.get("rank") for row in rows}
        assert [ranks[ids[member]] for member in expected] == list(range(1, 7))
        assert (await _receipt(client, owner, request["id"]))["stages"][0][
            "recipient_count"
        ] == 6
    finally:
        await database.close()


async def test_ripple_prefers_relevant_visible_help_skills(client):
    owner, skilled, private, unrelated = [await make_user(client) for _ in range(4)]
    home = await make_circle(client, owner)
    ids = {}
    for member, skill, visible in (
        (skilled, "Lifting and moving household items", True),
        (private, "Carrying boxes up stairs", False),
        (unrelated, "Sewing and mending clothes", True),
    ):
        await join_circle(client, owner, home, member)
        profile = await client.patch(
            "/users/me",
            headers=auth(member),
            json={"happy_to_help_with": skill, "profile_details_visible": visible},
        )
        assert profile.status_code == 200, profile.text
        ids[member] = uuid.UUID(profile.json()["id"])

    request = await _post(client, owner, raw_text="Can you help carry a bag?")
    database = Database(_settings())
    try:
        async with database.session() as session:
            rows = await session.scalars(
                select(RequestRecipient).where(
                    RequestRecipient.request_id == uuid.UUID(request["id"])
                )
            )
            reasons = {row.user_id: row.match_reasons for row in rows}
        assert reasons[ids[skilled]]["rank"] == 1
        assert reasons[ids[skilled]]["profile_skill_match"]
        assert not reasons[ids[private]]["profile_skill_match"]
        assert not reasons[ids[unrelated]]["profile_skill_match"]
    finally:
        await database.close()
