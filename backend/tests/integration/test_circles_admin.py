import uuid

from sqlalchemy import update

from app.database.connection import Database
from app.database.models import Circle
from tests.integration.conftest import (
    _settings,
    auth,
    join_circle,
    make_circle,
    make_user,
)


async def _mid(client, token):
    return (await client.get("/users/me", headers=auth(token))).json()["id"]


async def test_browse_detail_and_invite_preview(client):
    leader = await make_user(client)
    circle_id = await make_circle(client, leader)

    browse = await client.get("/circles", headers=auth(leader))
    assert browse.status_code == 200

    detail = await client.get(f"/circles/{circle_id}", headers=auth(leader))
    assert detail.status_code == 200
    assert detail.json()["my_role"] == "leader"

    invite = await client.post(
        f"/circles/{circle_id}/invites",
        headers=auth(leader),
        json={"auto_approve": True},
    )
    code = invite.headers["Location"].rsplit("/", 1)[-1]
    preview = await client.get(f"/circle-invites/{code}", headers=auth(leader))
    assert preview.status_code == 200
    assert preview.json()["auto_approve"] is True


async def test_patch_and_archive_circle(client):
    leader = await make_user(client)
    circle_id = await make_circle(client, leader)

    patched = await client.patch(
        f"/circles/{circle_id}",
        headers=auth(leader),
        json={"open_to_nearby": False},
    )
    assert patched.status_code == 200
    assert patched.json()["open_to_nearby"] is False

    archived = await client.post(f"/circles/{circle_id}/archive", headers=auth(leader))
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


async def test_memberships_roster_and_role_changes(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)
    member_id = await _mid(client, member)

    mine = await client.get("/users/me/memberships", headers=auth(member))
    assert mine.status_code == 200
    assert circle_id in [m["circle_id"] for m in mine.json()["items"]]

    roster = await client.get(f"/circles/{circle_id}/memberships", headers=auth(leader))
    assert roster.status_code == 200

    promoted = await client.patch(
        f"/circles/{circle_id}/memberships/{member_id}",
        headers=auth(leader),
        json={"role": "coordinator"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "coordinator"

    removed = await client.post(
        f"/circles/{circle_id}/memberships/{member_id}/remove",
        headers=auth(leader),
    )
    assert removed.status_code == 200
    assert removed.json()["status"] == "removed"


async def test_reject_pending_member(client):
    leader = await make_user(client, display_name="Leader")
    joiner = await make_user(client, display_name="Joiner")
    circle_id = await make_circle(client, leader)
    invite = await client.post(
        f"/circles/{circle_id}/invites",
        headers=auth(leader),
        json={"auto_approve": False},
    )
    code = invite.headers["Location"].rsplit("/", 1)[-1]
    await client.post(
        "/users/me/memberships", headers=auth(joiner), json={"invite_code": code}
    )
    joiner_id = await _mid(client, joiner)
    rejected = await client.post(
        f"/circles/{circle_id}/memberships/{joiner_id}/reject",
        headers=auth(leader),
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"


async def test_leader_can_page_pending_members_with_display_names(client):
    leader = await make_user(client)
    member = await make_user(client)
    first_applicant = await make_user(client, display_name="First applicant")
    second_applicant = await make_user(client, display_name="Second applicant")
    circle_id = await make_circle(client, leader)
    path = f"/circles/{circle_id}/memberships"
    await join_circle(client, leader, circle_id, member)
    for applicant in (first_applicant, second_applicant):
        joined = await client.post(
            "/users/me/memberships",
            headers=auth(applicant),
            json={"circle_id": circle_id},
        )
        assert joined.status_code == 201, joined.text
        assert joined.json()["status"] == "pending"

    params = {"limit": 1, "status": "pending"}
    first = await client.get(path, headers=auth(leader), params=params)
    assert first.status_code == 200, first.text
    first_page = first.json()
    assert [item["display_name"] for item in first_page["items"]] == [
        "Second applicant"
    ]
    assert first_page["next_cursor"]
    second = await client.get(
        path,
        headers=auth(leader),
        params={**params, "cursor": first_page["next_cursor"]},
    )
    assert second.status_code == 200, second.text
    assert [item["display_name"] for item in second.json()["items"]] == [
        "First applicant"
    ]
    assert second.json()["next_cursor"] is None

    regular_roster = await client.get(path, headers=auth(member), params=params)
    assert regular_roster.status_code == 200, regular_roster.text
    assert all(item["status"] == "approved" for item in regular_roster.json()["items"])
    assert all(
        item.get("display_name") is None for item in regular_roster.json()["items"]
    )


async def test_membership_approval_retries_preserve_decision(client):
    leader = await make_user(client)
    applicant = await make_user(client)
    circle_id = await make_circle(client, leader)
    joined = await client.post(
        "/users/me/memberships",
        headers=auth(applicant),
        json={"circle_id": circle_id},
    )
    assert joined.status_code == 201, joined.text
    applicant_id = await _mid(client, applicant)
    path = f"/circles/{circle_id}/memberships/{applicant_id}"

    approved = await client.post(f"{path}/approve", headers=auth(leader))
    retried = await client.post(f"{path}/approve", headers=auth(leader))
    assert approved.status_code == retried.status_code == 200
    assert retried.json() == approved.json()

    stale = await client.post(f"{path}/reject", headers=auth(leader))
    assert stale.status_code == 409, stale.text


async def test_revoke_invite_and_leave_circle(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)

    invite = await client.post(
        f"/circles/{circle_id}/invites",
        headers=auth(leader),
        json={"auto_approve": True},
    )
    invite_id = invite.json()["id"]
    revoked = await client.post(
        f"/circles/{circle_id}/invites/{invite_id}/revoke", headers=auth(leader)
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None

    left = await client.delete(
        f"/users/me/memberships/{circle_id}", headers=auth(member)
    )
    assert left.status_code == 204


async def test_nearby_search_returns_open_local_circles_in_distance_order(client):
    leader = await make_user(client)
    visitor = await make_user(client)

    async def create(name, latitude, *, discoverable=True):
        result = await client.post(
            "/circles",
            headers=auth(leader),
            json={
                "name": name,
                "unit_type": "han",
                "approx_lat": latitude,
                "approx_lng": 129.8737,
                "open_to_nearby": discoverable,
            },
        )
        assert result.status_code == 201, result.text
        return result.json()["id"]

    nearest = await create("Nearest", 32.7505)
    second = await create("Next nearest", 32.7700)
    await create("Out of range", 32.7800)
    closed = await create("Invite only", 32.7504, discoverable=False)

    query = {"near": "32.7503,129.8737", "limit": 1}
    first = await client.get("/circles", headers=auth(visitor), params=query)
    assert first.status_code == 200
    assert [row["id"] for row in first.json()["items"]] == [nearest]
    cursor = first.json()["next_cursor"]
    assert cursor
    following = await client.get(
        "/circles", headers=auth(visitor), params={**query, "cursor": cursor}
    )
    assert following.status_code == 200
    assert [row["id"] for row in following.json()["items"]] == [second]
    assert following.json()["next_cursor"] is None

    denied = await client.post(
        "/users/me/memberships", headers=auth(visitor), json={"circle_id": closed}
    )
    assert denied.status_code == 404
    invite = await client.post(
        f"/circles/{closed}/invites", headers=auth(leader), json={}
    )
    code = invite.headers["Location"].rsplit("/", 1)[-1]
    joined = await client.post(
        "/users/me/memberships", headers=auth(visitor), json={"invite_code": code}
    )
    assert joined.status_code == 201
    assert joined.json()["status"] == "pending"


async def test_circle_leader_can_link_and_unlink_a_local_parent(client):
    leader = await make_user(client)
    guest = await make_user(client)
    parent = await client.post(
        "/circles",
        headers=auth(leader),
        json={"name": "Mizunoura", "unit_type": "association"},
    )
    assert parent.status_code == 201, parent.text
    parent_id = parent.json()["id"]
    child = await client.post(
        "/circles",
        headers=auth(leader),
        json={"name": "Han 3", "unit_type": "han", "parent_id": parent_id},
    )
    assert child.status_code == 201, child.text
    assert child.json()["parent_id"] == parent_id
    path = child.headers["Location"]
    assert (await client.get(path, headers=auth(guest))).json()["parent_id"] is None

    detached = await client.patch(path, headers=auth(leader), json={"parent_id": None})
    assert detached.status_code == 200, detached.text
    assert detached.json()["parent_id"] is None
    attached = await client.patch(
        path, headers=auth(leader), json={"parent_id": parent_id}
    )
    assert attached.status_code == 200, attached.text
    assert attached.json()["parent_id"] == parent_id


async def test_circle_hierarchy_rejects_unauthorized_and_invalid_links(client):
    child_leader = await make_user(client)
    parent_leader = await make_user(client)
    child = await make_circle(client, child_leader)
    path = f"/circles/{child}"

    async def create(name, region="jp", latitude=None):
        response = await client.post(
            "/circles",
            headers=auth(child_leader),
            json={
                "name": name,
                "unit_type": "association",
                "region": region,
                "approx_lat": latitude,
                "approx_lng": 129.87 if latitude else None,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    parent = await client.post(
        "/circles",
        headers=auth(parent_leader),
        json={"name": "Parent", "unit_type": "association"},
    )
    parent_id = parent.json()["id"]
    await join_circle(client, parent_leader, parent_id, child_leader)
    await join_circle(client, child_leader, child, parent_leader)

    for caller in (child_leader, parent_leader):
        denied = await client.patch(
            path, headers=auth(caller), json={"parent_id": parent_id}
        )
        assert denied.status_code == 403, denied.text

    outside_region = await create("Other region", "bd")
    for bad_parent in (child, outside_region, await make_circle(client, child_leader)):
        invalid = await client.patch(
            path, headers=auth(child_leader), json={"parent_id": bad_parent}
        )
        assert invalid.status_code == 400, invalid.text

    distant = await create("Distant association", latitude=33)
    too_far = await client.post(
        "/circles",
        headers=auth(child_leader),
        json={
            "name": "Han near port",
            "unit_type": "han",
            "approx_lat": 32.75,
            "approx_lng": 129.87,
            "parent_id": distant,
        },
    )
    assert too_far.status_code == 400, too_far.text

    archived = await create("Archived association")
    response = await client.post(
        f"/circles/{archived}/archive", headers=auth(child_leader)
    )
    assert response.status_code == 200, response.text
    inactive = await client.patch(
        path, headers=auth(child_leader), json={"parent_id": archived}
    )
    assert inactive.status_code == 404, inactive.text
    assert (await client.get(path, headers=auth(child_leader))).json()[
        "parent_id"
    ] is None


async def test_circle_hierarchy_rejects_ancestor_cycles(client):
    leader = await make_user(client)
    child_id = await make_circle(client, leader)
    parent = await client.post(
        "/circles",
        headers=auth(leader),
        json={"name": "Association", "unit_type": "association"},
    )
    assert parent.status_code == 201, parent.text
    parent_id = parent.json()["id"]

    database = Database(_settings())
    try:
        async with database.session() as session:
            await session.execute(
                update(Circle)
                .where(Circle.id == uuid.UUID(parent_id))
                .values(parent_id=uuid.UUID(child_id))
            )
    finally:
        await database.close()

    response = await client.patch(
        f"/circles/{child_id}", headers=auth(leader), json={"parent_id": parent_id}
    )
    assert response.status_code == 400, response.text
    detail = await client.get(f"/circles/{child_id}", headers=auth(leader))
    assert detail.json()["parent_id"] is None
