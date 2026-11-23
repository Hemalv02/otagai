import uuid

from tests.integration.conftest import auth, join_circle, make_circle, make_user


def _grant_body():
    return {
        "caretaker_role": "family",
        "consent_method": "in_person",
        "scopes": {"can_post_requests": True, "can_thank_and_pay": True},
    }


async def _me_id(client, token):
    return (await client.get("/users/me", headers=auth(token))).json()["id"]


async def test_create_managed_user_and_grant(client):
    caretaker = await make_user(client, display_name="Caretaker")
    created = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={
            "display_name": "Grandpa",
            "preferred_language": "ja",
            "region": "jp",
            "grant": _grant_body(),
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["user"]["kind"] == "managed"
    assert body["grant"]["can_post_requests"] is True
    assert body["grant"]["can_thank_and_pay"] is True


async def test_managed_user_bad_body_422(client):
    caretaker = await make_user(client)
    response = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={"display_name": "X", "preferred_language": "ja", "region": "jp"},
    )
    assert response.status_code == 422  # missing grant


async def test_family_link_accept_and_revoke(client):
    alice = await make_user(client, display_name="Alice")
    bob = await make_user(client, display_name="Bob")
    bob_id = await _me_id(client, bob)

    created = await client.post(
        "/family-links",
        headers=auth(alice),
        json={"relative_user_id": bob_id, "relation": "sibling"},
    )
    assert created.status_code == 201, created.text
    link_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    # Only the relative (Bob) can accept.
    accepted = await client.post(f"/family-links/{link_id}/accept", headers=auth(bob))
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    revoked = await client.post(f"/family-links/{link_id}/revoke", headers=auth(alice))
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"


async def test_family_link_self_400(client):
    alice = await make_user(client)
    alice_id = await _me_id(client, alice)
    response = await client.post(
        "/family-links",
        headers=auth(alice),
        json={"relative_user_id": alice_id, "relation": "sibling"},
    )
    assert response.status_code == 400


async def test_proxy_grant_lifecycle(client):
    member = await make_user(client, display_name="Member")
    caretaker = await make_user(client, display_name="Caretaker")
    caretaker_id = await _me_id(client, caretaker)
    member_id = await _me_id(client, member)

    granted = await client.post(
        "/proxy-grants",
        headers=auth(member),
        json={
            "member_user_id": member_id,
            "caretaker_user_id": caretaker_id,
            **_grant_body(),
        },
    )
    assert granted.status_code == 201, granted.text
    grant_id = granted.json()["id"]

    # The member can tighten scopes.
    patched = await client.patch(
        f"/proxy-grants/{grant_id}",
        headers=auth(member),
        json={"can_thank_and_pay": False},
    )
    assert patched.status_code == 200
    assert patched.json()["can_thank_and_pay"] is False

    # Caretaker sees it in the account switcher.
    as_caretaker = await client.get(
        "/users/me/proxy-grants?as=caretaker", headers=auth(caretaker)
    )
    assert as_caretaker.status_code == 200
    assert grant_id in [g["id"] for g in as_caretaker.json()["items"]]

    revoked = await client.post(
        f"/proxy-grants/{grant_id}/revoke", headers=auth(caretaker)
    )
    assert revoked.status_code == 200


async def test_proxy_can_post_request_for_member(client):
    member = await make_user(client, display_name="Member")
    caretaker = await make_user(client, display_name="Caretaker")
    caretaker_id = await _me_id(client, caretaker)
    member_id = await _me_id(client, member)
    # The member needs a circle for a request to have a home.
    await make_circle(client, member)

    await client.post(
        "/proxy-grants",
        headers=auth(member),
        json={
            "member_user_id": member_id,
            "caretaker_user_id": caretaker_id,
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": {"can_post_requests": True},
        },
    )
    # Caretaker posts a request acting for the member.
    posted = await client.post(
        "/requests",
        headers={**auth(caretaker), "X-Acting-For": member_id},
        json={"kind": "help", "raw_text": "Posted by caretaker", "lang": "ja"},
    )
    assert posted.status_code == 201, posted.text
    assert posted.json()["requester_user_id"] == member_id


async def test_proxy_without_scope_forbidden(client):
    member = await make_user(client, display_name="Member")
    caretaker = await make_user(client, display_name="Caretaker")
    caretaker_id = await _me_id(client, caretaker)
    member_id = await _me_id(client, member)
    await make_circle(client, member)

    await client.post(
        "/proxy-grants",
        headers=auth(member),
        json={
            "member_user_id": member_id,
            "caretaker_user_id": caretaker_id,
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": {"can_post_requests": False},
        },
    )
    posted = await client.post(
        "/requests",
        headers={**auth(caretaker), "X-Acting-For": member_id},
        json={"kind": "help", "raw_text": "No scope", "lang": "ja"},
    )
    assert posted.status_code == 403


async def test_acting_for_without_grant_403(client):
    caretaker = await make_user(client, display_name="Caretaker")
    stranger_id = str(uuid.uuid4())
    posted = await client.get(
        "/users/me/requests",
        headers={**auth(caretaker), "X-Acting-For": stranger_id},
    )
    assert posted.status_code == 403


async def _family_with_open_request(client, *, can_view_activity: bool = True):
    member = await make_user(client, display_name="Mum")
    caretaker = await make_user(client, display_name="Yuki")
    member_id = await _me_id(client, member)
    caretaker_id = await _me_id(client, caretaker)
    circle_id = await make_circle(client, member)
    await join_circle(client, member, circle_id, caretaker)

    link = await client.post(
        "/family-links",
        headers=auth(caretaker),
        json={"relative_user_id": member_id, "relation": "child"},
    )
    assert link.status_code == 201, link.text
    accepted = await client.post(
        f"/family-links/{link.json()['id']}/accept", headers=auth(member)
    )
    assert accepted.status_code == 200, accepted.text

    grant = await client.post(
        "/proxy-grants",
        headers=auth(member),
        json={
            "member_user_id": member_id,
            "caretaker_user_id": caretaker_id,
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": {
                "can_post_requests": False,
                "can_view_activity": can_view_activity,
            },
        },
    )
    assert grant.status_code == 201, grant.text

    open_request = await client.post(
        "/requests",
        headers=auth(member),
        json={"kind": "help", "raw_text": "Carry rice upstairs", "lang": "ja"},
    )
    assert open_request.status_code == 201, open_request.text
    cancelled = await client.post(
        "/requests",
        headers=auth(member),
        json={"kind": "help", "raw_text": "Fix the gate", "lang": "ja"},
    )
    assert cancelled.status_code == 201, cancelled.text
    cancel = await client.post(
        f"/requests/{cancelled.json()['id']}/cancel", headers=auth(member)
    )
    assert cancel.status_code == 200, cancel.text

    return {
        "member": member,
        "caretaker": caretaker,
        "member_id": member_id,
        "caretaker_id": caretaker_id,
        "circle_id": circle_id,
        "grant_id": grant.json()["id"],
        "open_request_id": open_request.json()["id"],
    }


async def _open_requests(client, token, acting_for=None):
    headers = auth(token)
    if acting_for is not None:
        headers["X-Acting-For"] = acting_for
    return await client.get("/users/me/requests?status=open", headers=headers)


async def test_family_self_lists_only_own_open_requests(client):
    ctx = await _family_with_open_request(client)

    own = await _open_requests(client, ctx["member"])
    assert own.status_code == 200, own.text
    assert [item["id"] for item in own.json()["items"]] == [ctx["open_request_id"]]
    assert own.json()["items"][0]["requester_user_id"] == ctx["member_id"]

    caretaker_own = await _open_requests(client, ctx["caretaker"])
    assert caretaker_own.status_code == 200, caretaker_own.text
    assert caretaker_own.json()["items"] == []


async def test_family_caretaker_with_activity_scope_sees_member_requests(client):
    ctx = await _family_with_open_request(client)

    acting = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert acting.status_code == 200, acting.text
    items = acting.json()["items"]
    assert [item["id"] for item in items] == [ctx["open_request_id"]]
    assert items[0]["requester_user_id"] == ctx["member_id"]
    assert items[0]["status"] == "open"


async def test_family_caretaker_without_activity_scope_403(client):
    ctx = await _family_with_open_request(client, can_view_activity=False)

    denied = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert denied.status_code == 403, denied.text
    assert denied.json()["message"] == "You can't see this person's activity."
    assert ctx["open_request_id"] not in denied.text


async def test_family_activity_scope_removed_403(client):
    ctx = await _family_with_open_request(client)
    allowed = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert allowed.status_code == 200, allowed.text
    acting = {**auth(ctx["caretaker"]), "X-Acting-For": ctx["member_id"]}
    request_path = f"/requests/{ctx['open_request_id']}"
    activity_paths = (
        request_path,
        f"{request_path}/responses",
        "/users/me/received-requests",
    )
    for path in activity_paths:
        visible = await client.get(path, headers=acting)
        assert visible.status_code == 200, visible.text

    patched = await client.patch(
        f"/proxy-grants/{ctx['grant_id']}",
        headers=auth(ctx["member"]),
        json={"can_view_activity": False, "can_post_requests": True},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["can_view_activity"] is False

    denied = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert denied.status_code == 403, denied.text
    for path in activity_paths:
        denied = await client.get(path, headers=acting)
        assert denied.status_code == 403, denied.text

    edited = await client.patch(
        request_path, headers=acting, json={"raw_text": "Carry two bags upstairs"}
    )
    assert edited.status_code == 200, edited.text

    switcher = await client.get(
        "/users/me/proxy-grants?as=caretaker", headers=auth(ctx["caretaker"])
    )
    assert switcher.status_code == 200, switcher.text
    [grant] = switcher.json()["items"]
    assert grant["can_view_activity"] is False


async def test_family_revoked_grant_403(client):
    ctx = await _family_with_open_request(client)
    allowed = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert allowed.status_code == 200, allowed.text

    revoked = await client.post(
        f"/proxy-grants/{ctx['grant_id']}/revoke", headers=auth(ctx["member"])
    )
    assert revoked.status_code == 200, revoked.text

    denied = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert denied.status_code == 403, denied.text
    assert denied.json()["message"] == "You can't act for this person."

    switcher = await client.get(
        "/users/me/proxy-grants?as=caretaker", headers=auth(ctx["caretaker"])
    )
    assert switcher.status_code == 200, switcher.text
    assert switcher.json()["items"] == []


async def test_family_unrelated_user_403(client):
    ctx = await _family_with_open_request(client)
    stranger = await make_user(client, display_name="Stranger")
    await join_circle(client, ctx["member"], ctx["circle_id"], stranger)

    denied = await _open_requests(client, stranger, ctx["member_id"])
    assert denied.status_code == 403, denied.text
    assert ctx["open_request_id"] not in denied.text


async def test_family_accepted_link_without_grant_403(client):
    member = await make_user(client, display_name="Mum")
    relative = await make_user(client, display_name="Son")
    member_id = await _me_id(client, member)
    circle_id = await make_circle(client, member)
    await join_circle(client, member, circle_id, relative)
    link = await client.post(
        "/family-links",
        headers=auth(relative),
        json={"relative_user_id": member_id, "relation": "child"},
    )
    await client.post(f"/family-links/{link.json()['id']}/accept", headers=auth(member))
    await client.post(
        "/requests",
        headers=auth(member),
        json={"kind": "help", "raw_text": "Carry rice upstairs", "lang": "ja"},
    )

    denied = await _open_requests(client, relative, member_id)
    assert denied.status_code == 403, denied.text


async def test_family_inactive_member_403(client):
    ctx = await _family_with_open_request(client)
    deleted = await client.delete("/users/me", headers=auth(ctx["member"]))
    assert deleted.status_code == 204, deleted.text

    denied = await _open_requests(client, ctx["caretaker"], ctx["member_id"])
    assert denied.status_code == 403, denied.text


async def test_family_managed_account_follows_activity_scope(client):
    caretaker = await make_user(client, display_name="Caretaker")
    hidden = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={
            "display_name": "Grandpa",
            "preferred_language": "ja",
            "region": "jp",
            "grant": {
                **_grant_body(),
                "scopes": {"can_post_requests": True, "can_view_activity": False},
            },
        },
    )
    assert hidden.status_code == 201, hidden.text
    visible = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={
            "display_name": "Grandma",
            "preferred_language": "ja",
            "region": "jp",
            "grant": _grant_body(),
        },
    )
    assert visible.status_code == 201, visible.text

    denied = await _open_requests(client, caretaker, hidden.json()["user"]["id"])
    assert denied.status_code == 403, denied.text
    allowed = await _open_requests(client, caretaker, visible.json()["user"]["id"])
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["items"] == []


async def test_family_sources_return_profile_summaries(client):
    ctx = await _family_with_open_request(client)
    pending_relative = await make_user(client, display_name="Cousin")
    pending_id = await _me_id(client, pending_relative)
    pending = await client.post(
        "/family-links",
        headers=auth(ctx["caretaker"]),
        json={"relative_user_id": pending_id, "relation": "other"},
    )
    assert pending.status_code == 201, pending.text

    links = await client.get("/users/me/family-links", headers=auth(ctx["caretaker"]))
    assert links.status_code == 200, links.text
    by_other = {
        item["other"]["display_name"]: item["status"] for item in links.json()["items"]
    }
    assert by_other == {"Mum": "accepted", "Cousin": "pending"}

    grants = await client.get(
        "/users/me/proxy-grants?as=caretaker", headers=auth(ctx["caretaker"])
    )
    assert grants.status_code == 200, grants.text
    [grant] = grants.json()["items"]
    assert grant["other"] == {"id": ctx["member_id"], "display_name": "Mum"}
    assert grant["member_user_id"] == ctx["member_id"]
    assert grant["can_view_activity"] is True


async def test_family_request_status_filter_is_validated(client):
    ctx = await _family_with_open_request(client)

    several = await client.get(
        "/users/me/requests?status=open,cancelled", headers=auth(ctx["member"])
    )
    assert several.status_code == 200, several.text
    assert len(several.json()["items"]) == 2

    unknown = await client.get(
        "/users/me/requests?status=bogus", headers=auth(ctx["member"])
    )
    assert unknown.status_code == 422, unknown.text

    stray = await client.get(
        "/users/me/requests?stat=open", headers=auth(ctx["member"])
    )
    assert stray.status_code == 422, stray.text
