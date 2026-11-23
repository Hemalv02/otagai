from tests.integration.conftest import auth, join_circle, make_circle, make_user


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

    archived = await client.post(
        f"/circles/{circle_id}/archive", headers=auth(leader)
    )
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

    roster = await client.get(
        f"/circles/{circle_id}/memberships", headers=auth(leader)
    )
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
