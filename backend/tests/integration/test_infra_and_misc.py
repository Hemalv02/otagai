from tests.integration.conftest import auth, make_circle, make_user


async def test_health_and_ready(client):
    assert (await client.get("/health")).status_code == 200
    ready = await client.get("/ready")
    assert ready.status_code == 200


async def test_stripe_webhook_without_signature_400(client):
    response = await client.post("/webhooks/stripe", content=b"{}")
    assert response.status_code == 400


async def test_push_token_register_and_remove(client):
    token = await make_user(client)
    expo = "ExponentPushToken[abc-123_XYZ]"
    created = await client.post(
        "/users/me/push-tokens",
        headers=auth(token),
        json={"expo_token": expo, "platform": "ios"},
    )
    assert created.status_code == 201
    token_id = created.json()["id"]

    # Re-registering the same token is idempotent (200).
    again = await client.post(
        "/users/me/push-tokens",
        headers=auth(token),
        json={"expo_token": expo, "platform": "ios"},
    )
    assert again.status_code == 200

    removed = await client.delete(
        f"/users/me/push-tokens/{token_id}", headers=auth(token)
    )
    assert removed.status_code == 204


async def test_patch_managed_user(client):
    caretaker = await make_user(client, display_name="Caretaker")
    managed_id = (
        await client.post(
            "/managed-users",
            headers=auth(caretaker),
            json={
                "display_name": "Oba",
                "preferred_language": "ja",
                "region": "jp",
                "grant": {
                    "caretaker_role": "family",
                    "consent_method": "in_person",
                    "scopes": {},
                },
            },
        )
    ).json()["user"]["id"]

    patched = await client.patch(
        f"/managed-users/{managed_id}",
        headers=auth(caretaker),
        json={"display_name": "Obaa-chan"},
    )
    assert patched.status_code == 200
    assert patched.json()["display_name"] == "Obaa-chan"


async def test_event_detail_list_and_signup_cancel(client):
    leader = await make_user(client)
    circle_id = await make_circle(client, leader)
    event_id = (
        await client.post(
            f"/circles/{circle_id}/events",
            headers=auth(leader),
            json={"title": "Matsuri", "lang": "ja", "starts_at": "2026-12-09T09:00:00Z"},
        )
    ).json()["id"]

    listed = await client.get(
        f"/circles/{circle_id}/events", headers=auth(leader)
    )
    assert listed.status_code == 200

    detail = await client.get(f"/events/{event_id}", headers=auth(leader))
    assert detail.status_code == 200

    await client.post(f"/events/{event_id}/signups", headers=auth(leader), json={})
    cancelled = await client.delete(
        f"/events/{event_id}/signups/me", headers=auth(leader)
    )
    assert cancelled.status_code == 204


async def test_report_dismiss_by_leader(client):
    leader = await make_user(client, display_name="Leader")
    circle_id = await make_circle(client, leader)
    stranger = await make_user(client, display_name="Stranger")
    stranger_id = (await client.get("/users/me", headers=auth(stranger))).json()["id"]
    report_id = (
        await client.post(
            "/reports",
            headers=auth(leader),
            json={
                "target_type": "user",
                "target_id": stranger_id,
                "reason": "spam",
                "circle_id": circle_id,
            },
        )
    ).json()["id"]
    dismissed = await client.post(
        f"/reports/{report_id}/dismiss", headers=auth(leader)
    )
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "dismissed"
