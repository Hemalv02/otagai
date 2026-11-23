import io
import uuid

from PIL import Image

from tests.integration.conftest import auth, join_circle, make_circle, make_user


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (300, 300), (50, 50, 50)).save(buffer, format="PNG")
    return buffer.getvalue()


async def test_categories_tree(client):
    token = await make_user(client)
    response = await client.get("/categories?kind=tool", headers=auth(token))
    assert response.status_code == 200
    slugs = [c["slug"] for c in response.json()["items"]]
    assert "hand_tools" in slugs


async def test_categories_require_auth_401(client):
    assert (await client.get("/categories")).status_code == 401


async def test_media_in_use_cannot_be_deleted_409(client):
    token = await make_user(client)
    media_id = (
        await client.post(
            "/media",
            headers=auth(token),
            files={"file": ("a.png", _png(), "image/png")},
            data={"purpose": "avatar"},
        )
    ).json()["id"]
    # Attach it as the avatar, then it is referenced and cannot be deleted.
    patched = await client.patch(
        "/users/me", headers=auth(token), json={"avatar_media_id": media_id}
    )
    assert patched.status_code == 200
    response = await client.delete(f"/media/{media_id}", headers=auth(token))
    assert response.status_code == 409


async def test_event_edit_and_cancel(client):
    leader = await make_user(client, display_name="Leader")
    circle_id = await make_circle(client, leader)
    event_id = (
        await client.post(
            f"/circles/{circle_id}/events",
            headers=auth(leader),
            json={
                "title": "Cleanup",
                "lang": "ja",
                "starts_at": "2026-12-05T09:00:00Z",
            },
        )
    ).json()["id"]

    patched = await client.patch(
        f"/events/{event_id}",
        headers=auth(leader),
        json={"title": "Cleanup (rescheduled)"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Cleanup (rescheduled)"

    cancelled = await client.post(f"/events/{event_id}/cancel", headers=auth(leader))
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    # Editing a cancelled event is a conflict.
    again = await client.patch(
        f"/events/{event_id}", headers=auth(leader), json={"title": "x"}
    )
    assert again.status_code == 409


async def test_notice_edit_and_delete(client):
    leader = await make_user(client, display_name="Leader")
    circle_id = await make_circle(client, leader)
    notice_id = (
        await client.post(
            f"/circles/{circle_id}/notices",
            headers=auth(leader),
            json={"title": "Notice", "lang": "ja"},
        )
    ).json()["id"]

    patched = await client.patch(
        f"/notices/{notice_id}", headers=auth(leader), json={"pinned": True}
    )
    assert patched.status_code == 200
    assert patched.json()["pinned"] is True

    deleted = await client.delete(f"/notices/{notice_id}", headers=auth(leader))
    assert deleted.status_code == 204

    gone = await client.get(f"/notices/{notice_id}", headers=auth(leader))
    assert gone.status_code == 404


async def test_non_author_non_leader_cannot_edit_notice_403(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)
    notice_id = (
        await client.post(
            f"/circles/{circle_id}/notices",
            headers=auth(leader),
            json={"title": "Notice", "lang": "ja"},
        )
    ).json()["id"]
    response = await client.patch(
        f"/notices/{notice_id}", headers=auth(member), json={"pinned": True}
    )
    assert response.status_code == 403


async def test_pending_membership_then_leader_approves(client):
    leader = await make_user(client, display_name="Leader")
    joiner = await make_user(client, display_name="Joiner")
    circle_id = await make_circle(client, leader)
    # Invite without auto-approve -> pending.
    created = await client.post(
        f"/circles/{circle_id}/invites",
        headers=auth(leader),
        json={"auto_approve": False},
    )
    assert created.status_code == 201
    code = (
        await client.get(f"/circles/{circle_id}/invites", headers=auth(leader))
    ).json()["items"][0]["code"]
    joined = await client.post(
        "/users/me/memberships",
        headers=auth(joiner),
        json={"invite_code": code},
    )
    assert joined.status_code == 201
    assert joined.json()["status"] == "pending"

    joiner_id = (await client.get("/users/me", headers=auth(joiner))).json()["id"]
    approved = await client.post(
        f"/circles/{circle_id}/memberships/{joiner_id}/approve",
        headers=auth(leader),
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


async def test_thank_you_wall_opt_in(client):
    # Covered lightly: unknown thank-you is 404.
    token = await make_user(client)
    response = await client.get(f"/thank-yous/{uuid.uuid4()}", headers=auth(token))
    assert response.status_code == 404
