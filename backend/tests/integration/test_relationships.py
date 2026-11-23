import uuid

from tests.integration.conftest import auth, make_circle, make_user


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
