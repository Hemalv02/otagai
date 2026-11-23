from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def test_notice_create_requires_leader_and_members_can_read(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)

    created = await client.post(
        f"/circles/{circle_id}/notices",
        headers=auth(leader),
        json={"title": "Cleaning day", "body": "Saturday 9am", "lang": "ja"},
    )
    assert created.status_code == 201, created.text
    notice_id = created.json()["id"]

    # A regular member may read but not create.
    read = await client.get(f"/notices/{notice_id}", headers=auth(member))
    assert read.status_code == 200
    forbidden = await client.post(
        f"/circles/{circle_id}/notices",
        headers=auth(member),
        json={"title": "nope", "lang": "ja"},
    )
    assert forbidden.status_code == 403

    listed = await client.get(f"/circles/{circle_id}/notices", headers=auth(member))
    assert listed.status_code == 200
    assert notice_id in [item["id"] for item in listed.json()["items"]]


async def test_outsider_cannot_read_circle_notices(client):
    # Circles are discoverable, so member-only content of a known circle is
    # gated with 403 ("join this circle") rather than 404.
    leader = await make_user(client, display_name="Leader")
    circle_id = await make_circle(client, leader)
    outsider = await make_user(client, display_name="Outsider")
    response = await client.get(f"/circles/{circle_id}/notices", headers=auth(outsider))
    assert response.status_code == 403


async def test_event_signup_and_capacity(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)

    event = await client.post(
        f"/circles/{circle_id}/events",
        headers=auth(leader),
        json={
            "title": "Festival prep",
            "lang": "ja",
            "starts_at": "2026-12-01T09:00:00Z",
            "capacity": 1,
        },
    )
    assert event.status_code == 201, event.text
    event_id = event.json()["id"]

    joined = await client.post(
        f"/events/{event_id}/signups", headers=auth(member), json={}
    )
    assert joined.status_code == 201
    assert joined.json()["signed_up"] is True
    assert joined.json()["signup_count"] == 1

    # Capacity is 1 and is now full; a second distinct member gets 409.
    other = await make_user(client, display_name="Other")
    await join_circle(client, leader, circle_id, other)
    full = await client.post(
        f"/events/{event_id}/signups", headers=auth(other), json={}
    )
    assert full.status_code == 409


async def test_check_in_settings_round_trip(client):
    user = await make_user(client)
    default = await client.get("/users/me/check-in-settings", headers=auth(user))
    assert default.status_code == 200
    assert default.json()["enabled"] is False

    updated = await client.put(
        "/users/me/check-in-settings",
        headers=auth(user),
        json={"enabled": True, "frequency_days": 7},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is True
    assert updated.json()["frequency_days"] == 7
