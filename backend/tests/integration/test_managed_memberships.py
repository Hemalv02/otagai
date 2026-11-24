import uuid

from tests.integration.conftest import auth, make_user
from tests.integration.family_fixtures import (
    ALL_SCOPES,
    acted_by,
    acting,
    circle_in,
    give_grant,
    me_id,
    post_help,
    scopes,
)


async def _managed_user(client, creator, *enabled):
    response = await client.post(
        "/managed-users",
        headers=auth(creator),
        json={
            "display_name": "Amina",
            "preferred_language": "bn",
            "region": "bd",
            "grant": {
                "caretaker_role": "family",
                "consent_method": "phone_call",
                "scopes": scopes(*enabled),
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]["id"], response.json()["grant"]["id"]


async def _invite(client, leader, circle_id, **settings):
    response = await client.post(
        f"/circles/{circle_id}/invites", headers=auth(leader), json=settings
    )
    assert response.status_code == 201, response.text
    return response.json()["code"]


async def test_managed_invite_waits_for_leader_approval_then_enables_proxy_posting(
    client,
):
    creator = await make_user(client, region="jp")
    leader = await make_user(client, region="bd", language="bn")
    managed_id, _ = await _managed_user(client, creator, "can_post_requests")
    own_circle = await circle_in(client, creator, "jp")
    circle_id = await circle_in(client, leader, "bd")
    code = await _invite(client, leader, circle_id, auto_approve=True)
    path = f"/managed-users/{managed_id}/memberships"
    proxy_headers = acting(creator, managed_id)
    destinations_url = "/users/me/request-destinations"

    before = await client.get(path, headers=auth(creator))
    assert before.status_code == 200, before.text
    assert before.json() == {
        "member": {"id": managed_id, "display_name": "Amina"},
        "items": [],
        "next_cursor": None,
    }

    joined = await client.post(path, headers=auth(creator), json={"invite_code": code})
    assert joined.status_code == 201, joined.text
    membership = joined.json()
    assert (membership["circle_id"], membership["role"], membership["status"]) == (
        circle_id,
        "member",
        "pending",
    )
    assert membership["joined_via"] == "invite"
    assert membership["decided_at"] is None

    listed = await client.get(path, headers=auth(creator))
    assert listed.status_code == 200, listed.text
    [pending] = listed.json()["items"]
    assert pending["circle"]["name"] == "Han bd"
    assert pending["status"] == "pending"

    destinations = await client.get(destinations_url, headers=proxy_headers)
    assert destinations.status_code == 200, destinations.text
    assert destinations.json()["items"] == []
    blocked = await post_help(client, proxy_headers, home_circle_id=circle_id)
    assert blocked.status_code == 400, blocked.text

    roster_url = f"/circles/{circle_id}/memberships"
    roster = await client.get(
        roster_url, headers=auth(leader), params={"status": "pending"}
    )
    assert roster.status_code == 200, roster.text
    [applicant] = roster.json()["items"]
    assert (applicant["user_id"], applicant["display_name"]) == (managed_id, "Amina")
    approved = await client.post(
        f"{roster_url}/{managed_id}/approve", headers=auth(leader)
    )
    assert approved.status_code == 200, approved.text

    listed = await client.get(path, headers=auth(creator))
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["status"] == "approved"
    destinations = await client.get(destinations_url, headers=proxy_headers)
    assert destinations.status_code == 200, destinations.text
    assert [item["id"] for item in destinations.json()["items"]] == [circle_id]
    own_destinations = await client.get(destinations_url, headers=auth(creator))
    assert own_destinations.status_code == 200, own_destinations.text
    assert [item["id"] for item in own_destinations.json()["items"]] == [own_circle]

    posted = await post_help(client, proxy_headers, home_circle_id=circle_id)
    assert posted.status_code == 201, posted.text
    assert posted.json()["requester_user_id"] == managed_id
    assert str(await acted_by(posted.json()["id"])) == await me_id(client, creator)
    delivered = await client.get("/users/me/received-requests", headers=auth(leader))
    assert delivered.status_code == 200, delivered.text
    assert posted.json()["id"] in [
        item["request"]["id"] for item in delivered.json()["items"]
    ]


async def test_managed_memberships_require_creator_and_active_grant(client):
    creator = await make_user(client)
    delegate = await make_user(client)
    outsider = await make_user(client)
    managed_id, grant_id = await _managed_user(client, creator)
    circle_id = await circle_in(client, outsider, "jp")
    code = await _invite(client, outsider, circle_id, max_uses=1)
    await give_grant(
        client, creator, managed_id, await me_id(client, delegate), *ALL_SCOPES
    )
    registered_id = await me_id(client, outsider)
    await give_grant(
        client, outsider, registered_id, await me_id(client, creator), *ALL_SCOPES
    )

    for token, member_id in (
        (delegate, managed_id),
        (outsider, managed_id),
        (creator, registered_id),
        (creator, await me_id(client, creator)),
        (creator, str(uuid.uuid4())),
    ):
        path = f"/managed-users/{member_id}/memberships"
        listed = await client.get(path, headers=auth(token))
        assert listed.status_code == 404, listed.text
        joined = await client.post(
            path, headers=auth(token), json={"invite_code": code}
        )
        assert joined.status_code == 404, joined.text

    path = f"/managed-users/{managed_id}/memberships"
    rejected_body = await client.post(
        path, headers=auth(creator), json={"circle_id": circle_id}
    )
    assert rejected_body.status_code == 422, rejected_body.text
    joined = await client.post(path, headers=auth(creator), json={"invite_code": code})
    assert joined.status_code == 201, joined.text
    approved = await client.post(
        f"/circles/{circle_id}/memberships/{managed_id}/approve", headers=auth(outsider)
    )
    assert approved.status_code == 200, approved.text
    posting = await post_help(
        client, acting(creator, managed_id), home_circle_id=circle_id
    )
    assert posting.status_code == 403, posting.text

    revoked = await client.post(
        f"/proxy-grants/{grant_id}/revoke", headers=auth(creator)
    )
    assert revoked.status_code == 200, revoked.text
    listed = await client.get(path, headers=auth(creator))
    assert listed.status_code == 404, listed.text
    fresh_code = await _invite(client, outsider, circle_id)
    joined = await client.post(
        path, headers=auth(creator), json={"invite_code": fresh_code}
    )
    assert joined.status_code == 404, joined.text


async def test_managed_memberships_page_circle_details(client):
    creator = await make_user(client)
    leader = await make_user(client)
    managed_id, _ = await _managed_user(client, creator)
    first_circle = await circle_in(client, leader, "jp")
    second_circle = await circle_in(client, leader, "bd")
    path = f"/managed-users/{managed_id}/memberships"
    for circle_id in (first_circle, second_circle):
        code = await _invite(client, leader, circle_id)
        joined = await client.post(
            path, headers=auth(creator), json={"invite_code": code}
        )
        assert joined.status_code == 201, joined.text

    page = await client.get(path, headers=auth(creator), params={"limit": 1})
    assert page.status_code == 200, page.text
    [latest] = page.json()["items"]
    assert latest["circle"]["id"] == second_circle
    cursor = page.json()["next_cursor"]
    assert cursor
    next_page = await client.get(
        path, headers=auth(creator), params={"limit": 1, "cursor": cursor}
    )
    assert next_page.status_code == 200, next_page.text
    assert next_page.json()["member"] == {"id": managed_id, "display_name": "Amina"}
    [earlier] = next_page.json()["items"]
    assert earlier["circle"]["id"] == first_circle
    assert next_page.json()["next_cursor"] is None


async def test_managed_and_personal_memberships_share_invite_limits(client):
    creator = await make_user(client)
    leader = await make_user(client)
    registered = await make_user(client)
    managed_id, _ = await _managed_user(client, creator)
    circle_id = await circle_in(client, leader, "jp")
    code = await _invite(client, leader, circle_id, auto_approve=True, max_uses=2)
    path = f"/managed-users/{managed_id}/memberships"

    invalid = await client.post(
        path, headers=auth(creator), json={"invite_code": "invalid-code"}
    )
    assert invalid.status_code == 404, invalid.text
    joined = await client.post(path, headers=auth(creator), json={"invite_code": code})
    assert joined.status_code == 201, joined.text
    assert joined.json()["status"] == "pending"
    duplicate = await client.post(
        path, headers=auth(creator), json={"invite_code": code}
    )
    assert duplicate.status_code == 409, duplicate.text

    self_join = await client.post(
        "/users/me/memberships", headers=auth(registered), json={"invite_code": code}
    )
    assert self_join.status_code == 201, self_join.text
    assert self_join.json()["status"] == "approved"
    assert self_join.json()["decided_at"] is not None

    other_id, _ = await _managed_user(client, creator)
    exhausted = await client.post(
        f"/managed-users/{other_id}/memberships",
        headers=auth(creator),
        json={"invite_code": code},
    )
    assert exhausted.status_code == 404, exhausted.text
