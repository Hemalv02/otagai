import asyncio
import uuid

import pytest

from app.routes.requests import route as request_routes
from tests.integration.conftest import auth, join_circle, make_circle, make_user
from tests.integration.family_fixtures import (
    acted_by,
    acting,
    circle_in,
    give_grant,
    me_id,
    pair,
    post_help,
    scopes,
)


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


async def test_revoked_grant_remains_private_and_can_be_revoked_again(client):
    ctx = await pair(client)
    outsider = await make_user(client)
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_post_requests",
    )
    path = f"/proxy-grants/{grant_id}/revoke"
    revoked = await client.post(path, headers=auth(ctx["member"]))
    assert revoked.status_code == 200, revoked.text

    repeated = await client.post(path, headers=auth(ctx["caretaker"]))
    assert repeated.status_code == 200, repeated.text
    assert repeated.json() == revoked.json()

    denied = await client.post(path, headers=auth(outsider))
    assert denied.status_code == 404, denied.text


@pytest.mark.parametrize("change", ["disable", "revoke", "replace"])
async def test_proxy_cannot_publish_after_consent_changes(client, monkeypatch, change):
    ctx = await pair(client)
    await make_circle(client, ctx["member"])
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_post_requests",
    )
    ready_to_publish = asyncio.Event()
    continue_publication = asyncio.Event()
    create_request = request_routes.create_request

    async def wait_before_publication(database, actor, new_request):
        ready_to_publish.set()
        await continue_publication.wait()
        return await create_request(database, actor, new_request)

    monkeypatch.setattr(request_routes, "create_request", wait_before_publication)
    posting = asyncio.create_task(
        post_help(client, acting(ctx["caretaker"], ctx["member_id"]))
    )
    try:
        await asyncio.wait_for(ready_to_publish.wait(), timeout=5)
        member_auth = auth(ctx["member"])
        if change == "disable":
            changed = await client.patch(
                f"/proxy-grants/{grant_id}",
                headers=member_auth,
                json={"can_post_requests": False},
            )
        else:
            changed = await client.post(
                f"/proxy-grants/{grant_id}/revoke", headers=member_auth
            )
        assert changed.status_code == 200, changed.text
        if change == "replace":
            await give_grant(
                client,
                ctx["member"],
                ctx["member_id"],
                ctx["caretaker_id"],
                "can_post_requests",
            )
    finally:
        continue_publication.set()
        posted = await asyncio.wait_for(posting, timeout=5)

    assert posted.status_code == 403, posted.text
    requests = await client.get("/users/me/requests", headers=member_auth)
    assert requests.status_code == 200, requests.text
    assert requests.json()["items"] == []


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
    assert grant["other"] == {
        "id": ctx["member_id"],
        "display_name": "Mum",
        "kind": "self",
    }
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


async def test_link_is_pending_on_both_sides_until_accepted(client):
    ctx = await pair(client)
    sent = await client.post(
        "/family-links",
        headers=auth(ctx["caretaker"]),
        json={"relative_user_id": ctx["member_id"], "relation": "parent"},
    )
    assert sent.status_code == 201, sent.text
    link_id = sent.json()["id"]
    for token, other in ((ctx["caretaker"], "Amina"), (ctx["member"], "Rahim")):
        [row] = (
            await client.get("/users/me/family-links", headers=auth(token))
        ).json()["items"]
        assert (row["status"], row["other"]["display_name"]) == ("pending", other)

    own_accept = await client.post(
        f"/family-links/{link_id}/accept", headers=auth(ctx["caretaker"])
    )
    assert own_accept.status_code == 404, own_accept.text
    accepted = await client.post(
        f"/family-links/{link_id}/accept", headers=auth(ctx["member"])
    )
    assert accepted.status_code == 200, accepted.text
    for token in (ctx["caretaker"], ctx["member"]):
        [row] = (
            await client.get("/users/me/family-links", headers=auth(token))
        ).json()["items"]
        assert row["status"] == "accepted"

    await circle_in(client, ctx["member"], "jp")
    as_member = acting(ctx["caretaker"], ctx["member_id"])
    listed = await client.get("/users/me/requests?status=open", headers=as_member)
    assert listed.status_code == 403, listed.text
    assert (await post_help(client, as_member)).status_code == 403
    destinations = await client.get("/users/me/request-destinations", headers=as_member)
    assert destinations.status_code == 403, destinations.text


async def test_managed_member_gets_exactly_the_reviewed_scopes(client):
    caretaker = await make_user(client, display_name="Rahim")
    created = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={
            "display_name": "Amina",
            "preferred_language": "bn",
            "region": "bd",
            "grant": {
                "caretaker_role": "family",
                "consent_method": "phone_call",
                "scopes": scopes("can_post_requests", "can_view_activity"),
            },
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert {name: body["grant"][name] for name in scopes()} == scopes(
        "can_post_requests", "can_view_activity"
    )
    assert body["grant"]["consent_method"] == "phone_call"
    assert (body["user"]["region"], body["user"]["kind"]) == ("bd", "managed")

    [listed] = (
        await client.get("/users/me/proxy-grants?as=caretaker", headers=auth(caretaker))
    ).json()["items"]
    assert listed["other"]["kind"] == "managed"

    as_member = acting(caretaker, body["user"]["id"])
    destinations = await client.get("/users/me/request-destinations", headers=as_member)
    assert destinations.status_code == 200, destinations.text
    assert destinations.json()["items"] == []
    no_circle = await post_help(client, as_member)
    assert no_circle.status_code == 400, no_circle.text


async def test_only_the_member_changes_a_registered_members_scopes(client):
    ctx = await pair(client)
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_view_activity",
    )
    escalated = await client.patch(
        f"/proxy-grants/{grant_id}",
        headers=auth(ctx["caretaker"]),
        json={"can_post_requests": True, "can_thank_and_pay": True},
    )
    assert escalated.status_code == 403, escalated.text
    [grant] = (
        await client.get(
            "/users/me/proxy-grants?as=caretaker", headers=auth(ctx["caretaker"])
        )
    ).json()["items"]
    assert (grant["can_post_requests"], grant["can_thank_and_pay"]) == (False, False)
    assert grant["other"]["kind"] == "self"

    delegated = await client.post(
        "/proxy-grants",
        headers=auth(ctx["caretaker"]),
        json={
            "member_user_id": ctx["member_id"],
            "caretaker_user_id": await me_id(client, await make_user(client)),
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": scopes("can_post_requests"),
        },
    )
    assert delegated.status_code == 403, delegated.text

    granted = await client.patch(
        f"/proxy-grants/{grant_id}",
        headers=auth(ctx["member"]),
        json={"can_post_requests": True},
    )
    assert granted.status_code == 200, granted.text
    ended = await client.post(
        f"/proxy-grants/{grant_id}/revoke", headers=auth(ctx["caretaker"])
    )
    assert ended.status_code == 200, ended.text


async def test_caretaker_manages_and_shares_a_managed_member(client):
    caretaker = await make_user(client, display_name="Rahim")
    created = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={
            "display_name": "Amina",
            "preferred_language": "ja",
            "region": "jp",
            "grant": {**_grant_body(), "scopes": scopes("can_view_activity")},
        },
    )
    managed_id = created.json()["user"]["id"]
    patched = await client.patch(
        f"/proxy-grants/{created.json()['grant']['id']}",
        headers=auth(caretaker),
        json={"can_post_requests": True},
    )
    assert patched.status_code == 200, patched.text
    sibling_id = await me_id(client, await make_user(client, display_name="Sibling"))
    shared = await client.post(
        "/proxy-grants",
        headers=auth(caretaker),
        json={
            "member_user_id": managed_id,
            "caretaker_user_id": sibling_id,
            "caretaker_role": "family",
            "consent_method": "via_coordinator",
            "scopes": scopes("can_view_activity"),
        },
    )
    assert shared.status_code == 201, shared.text


async def test_post_and_activity_scopes_are_independent(client):
    ctx = await pair(client)
    await circle_in(client, ctx["member"], "jp")
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_view_activity",
    )
    as_member = acting(ctx["caretaker"], ctx["member_id"])
    listed = await client.get("/users/me/requests?status=open", headers=as_member)
    assert listed.status_code == 200, listed.text
    assert (await post_help(client, as_member)).status_code == 403
    destinations = await client.get("/users/me/request-destinations", headers=as_member)
    assert destinations.status_code == 403, destinations.text

    swapped = await client.patch(
        f"/proxy-grants/{grant_id}",
        headers=auth(ctx["member"]),
        json={"can_post_requests": True, "can_view_activity": False},
    )
    assert swapped.status_code == 200, swapped.text
    listed = await client.get("/users/me/requests?status=open", headers=as_member)
    assert listed.status_code == 403, listed.text
    posted = await post_help(client, as_member)
    assert posted.status_code == 201, posted.text
    for token, role in ((ctx["member"], "member"), (ctx["caretaker"], "caretaker")):
        [grant] = (
            await client.get(f"/users/me/proxy-grants?as={role}", headers=auth(token))
        ).json()["items"]
        assert (grant["can_post_requests"], grant["can_view_activity"]) == (True, False)

    revoked = await client.post(
        f"/proxy-grants/{grant_id}/revoke", headers=auth(ctx["member"])
    )
    assert revoked.status_code == 200, revoked.text
    assert (await post_help(client, as_member)).status_code == 403
    listed = await client.get("/users/me/requests?status=open", headers=as_member)
    assert listed.status_code == 403, listed.text
    for token, role in ((ctx["member"], "member"), (ctx["caretaker"], "caretaker")):
        remaining = await client.get(
            f"/users/me/proxy-grants?as={role}", headers=auth(token)
        )
        assert remaining.json()["items"] == []


async def test_caretaker_in_japan_posts_for_member_in_bangladesh(client):
    ctx = await pair(client, member_region="bd", caretaker_region="jp")
    neighbour = await make_user(client, display_name="Karim", region="bd")
    member_circle = await circle_in(client, ctx["member"], "bd", neighbour)
    own_circle = await circle_in(client, ctx["caretaker"], "jp")
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_post_requests",
    )
    as_member = acting(ctx["caretaker"], ctx["member_id"])

    destinations = await client.get("/users/me/request-destinations", headers=as_member)
    assert destinations.status_code == 200, destinations.text
    [destination] = destinations.json()["items"]
    assert (destination["id"], destination["region"]) == (member_circle, "bd")
    mine = await client.get(
        "/users/me/request-destinations", headers=auth(ctx["caretaker"])
    )
    assert [item["id"] for item in mine.json()["items"]] == [own_circle]

    denied = await post_help(client, as_member, home_circle_id=own_circle)
    assert denied.status_code == 400, denied.text
    posted = await post_help(client, as_member, home_circle_id=member_circle)
    assert posted.status_code == 201, posted.text
    request_id = posted.json()["id"]
    assert posted.json()["requester_user_id"] == ctx["member_id"]
    assert str(await acted_by(request_id)) == ctx["caretaker_id"]
    received = await client.get("/users/me/received-requests", headers=auth(neighbour))
    assert request_id in [item["request"]["id"] for item in received.json()["items"]]

    await client.post(f"/proxy-grants/{grant_id}/revoke", headers=auth(ctx["member"]))
    late = await post_help(client, as_member, home_circle_id=member_circle)
    assert late.status_code == 403, late.text
    member_requests = await client.get(
        "/users/me/requests", headers=auth(ctx["member"])
    )
    assert [item["id"] for item in member_requests.json()["items"]] == [request_id]

    own = await post_help(client, auth(ctx["caretaker"]))
    assert own.status_code == 201, own.text
    assert own.json()["requester_user_id"] == ctx["caretaker_id"]
    assert str(await acted_by(own.json()["id"])) == ctx["caretaker_id"]


async def test_only_the_creator_manages_a_managed_member(client):
    caretaker = await make_user(client, display_name="Rahim")
    created = await client.post(
        "/managed-users",
        headers=auth(caretaker),
        json={
            "display_name": "Amina",
            "preferred_language": "ja",
            "region": "jp",
            "grant": {**_grant_body(), "scopes": scopes("can_view_activity")},
        },
    )
    managed_id = created.json()["user"]["id"]
    sibling = await make_user(client, display_name="Sibling")
    sibling_id = await me_id(client, sibling)
    shared = await client.post(
        "/proxy-grants",
        headers=auth(caretaker),
        json={
            "member_user_id": managed_id,
            "caretaker_user_id": sibling_id,
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": scopes("can_view_activity"),
        },
    )
    assert shared.status_code == 201, shared.text

    widened = await client.patch(
        f"/proxy-grants/{shared.json()['id']}",
        headers=auth(sibling),
        json={"can_post_requests": True},
    )
    assert widened.status_code == 403, widened.text
    passed_on = await client.post(
        "/proxy-grants",
        headers=auth(sibling),
        json={
            "member_user_id": managed_id,
            "caretaker_user_id": await me_id(client, await make_user(client)),
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": scopes("can_view_activity"),
        },
    )
    assert passed_on.status_code == 403, passed_on.text

    [creator_view] = (
        await client.get("/users/me/proxy-grants?as=caretaker", headers=auth(caretaker))
    ).json()["items"]
    [sibling_view] = (
        await client.get("/users/me/proxy-grants?as=caretaker", headers=auth(sibling))
    ).json()["items"]
    assert (creator_view["can_change_scopes"], sibling_view["can_change_scopes"]) == (
        True,
        False,
    )


async def test_grant_lists_say_who_can_change_scopes(client):
    ctx = await pair(client)
    await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_view_activity",
    )
    [as_member] = (
        await client.get(
            "/users/me/proxy-grants?as=member", headers=auth(ctx["member"])
        )
    ).json()["items"]
    [as_caretaker] = (
        await client.get(
            "/users/me/proxy-grants?as=caretaker", headers=auth(ctx["caretaker"])
        )
    ).json()["items"]
    assert as_member["can_change_scopes"] is True
    assert as_caretaker["can_change_scopes"] is False


async def test_ending_managed_creator_access_ends_delegated_access(client):
    creator = await make_user(client, display_name="Volunteer")
    delegate = await make_user(client)
    created = await client.post(
        "/managed-users",
        headers=auth(creator),
        json={
            "display_name": "Amina",
            "preferred_language": "bn",
            "region": "bd",
            "grant": {**_grant_body(), "caretaker_role": "welfare_volunteer"},
        },
    )
    assert created.status_code == 201, created.text
    member = created.json()["user"]["id"]
    creator_grant = created.json()["grant"]["id"]
    await give_grant(
        client, creator, member, await me_id(client, delegate), "can_view_activity"
    )
    path = "/users/me/requests"
    delegate_headers = acting(delegate, member)
    assert (await client.get(path, headers=delegate_headers)).status_code == 200
    assert (
        await client.post(
            f"/proxy-grants/{creator_grant}/revoke", headers=auth(creator)
        )
    ).status_code == 200
    assert (await client.get(path, headers=delegate_headers)).status_code == 403


async def test_proxy_request_details_reflect_current_management_scope(client):
    ctx = await pair(client)
    await circle_in(client, ctx["member"], "jp")
    posted = await post_help(client, auth(ctx["member"]))
    path = f"/requests/{posted.json()['id']}"
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_view_activity",
    )
    headers = acting(ctx["caretaker"], ctx["member_id"])
    read_only = await client.get(path, headers=headers)
    assert read_only.status_code == 200, read_only.text
    assert read_only.json()["can_manage"] is False
    assert read_only.json()["can_thank"] is False
    denied = await client.patch(path, headers=headers, json={"polite_text": "Updated"})
    assert denied.status_code == 403, denied.text
    updated = await client.patch(
        f"/proxy-grants/{grant_id}",
        headers=auth(ctx["member"]),
        json={"can_post_requests": True},
    )
    assert updated.status_code == 200, updated.text
    allowed = await client.patch(path, headers=headers, json={"polite_text": "Updated"})
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["can_manage"] is True
    assert allowed.json()["polite_text"] == "Updated"
    cancelled = await client.post(f"{path}/cancel", headers=headers)
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"


async def test_proxy_help_exchange_writes_require_posting_consent(client):
    ctx = await pair(client)
    helper = await make_user(client)
    circle = await circle_in(client, ctx["member"], "jp", helper)
    posted = await post_help(client, auth(ctx["member"]), home_circle_id=circle)
    path = f"/requests/{posted.json()['id']}"
    offered = await client.post(
        f"{path}/responses", headers=auth(helper), json={"kind": "offer"}
    )
    assert offered.status_code == 201, offered.text
    accepted = await client.post(
        f"{path}/responses/{offered.json()['id']}/accept", headers=auth(ctx["member"])
    )
    assert accepted.status_code == 200, accepted.text
    exchange_id = (await client.get(path, headers=auth(ctx["member"]))).json()[
        "exchange_id"
    ]
    exchange_path = f"/exchanges/{exchange_id}"
    grant_id = await give_grant(
        client,
        ctx["member"],
        ctx["member_id"],
        ctx["caretaker_id"],
        "can_view_activity",
    )
    headers = acting(ctx["caretaker"], ctx["member_id"])
    assert (await client.get(exchange_path, headers=headers)).status_code == 200
    assert (
        await client.post(f"{exchange_path}/hand-over", headers=headers)
    ).status_code == 403
    updated = await client.patch(
        f"/proxy-grants/{grant_id}",
        headers=auth(ctx["member"]),
        json={"can_post_requests": True},
    )
    assert updated.status_code == 200
    assert (
        await client.post(f"{exchange_path}/hand-over", headers=headers)
    ).status_code == 200
    assert (
        await client.post(f"{exchange_path}/confirm", headers=headers)
    ).status_code == 200
    completed = await client.post(f"{exchange_path}/confirm", headers=auth(helper))
    assert completed.status_code == 200 and completed.json()["status"] == "completed"


async def test_one_caretaker_cannot_confirm_two_principals_exchange(client):
    from tests.integration.conftest import matched_exchange

    match = await matched_exchange(client)
    caretaker = await make_user(client, display_name="Shared caretaker")
    caretaker_id = await me_id(client, caretaker)
    requester, helper = match["requester"], match["helper"]
    requester_id = await me_id(client, requester)
    helper_id = await me_id(client, helper)
    for principal, member_id in ((requester, requester_id), (helper, helper_id)):
        await give_grant(
            client,
            principal,
            member_id,
            caretaker_id,
            "can_view_activity",
            "can_post_requests",
        )
    path = f"/exchanges/{match['exchange_id']}"
    started = await client.post(f"{path}/hand-over", headers=auth(helper))
    assert started.status_code == 200, started.text
    first = await client.post(
        f"{path}/confirm", headers=acting(caretaker, requester_id)
    )
    assert first.status_code == 200 and first.json()["status"] == "active", first.text
    second = await client.post(f"{path}/confirm", headers=acting(caretaker, helper_id))
    assert second.status_code == 409, second.text
    independent = await client.post(f"{path}/confirm", headers=auth(helper))
    assert (
        independent.status_code == 200 and independent.json()["status"] == "completed"
    )
