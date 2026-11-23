from tests.integration.conftest import auth, make_circle, make_user


async def test_ai_helper_without_openai_is_503(client):
    token = await make_user(client)
    response = await client.post(
        "/ai/intro-cards",
        headers=auth(token),
        json={"skills": "fixing bikes", "language": "ja"},
    )
    # OpenAI is not configured in tests -> a mapped 503, not a crash.
    assert response.status_code == 503


async def test_ai_helper_bad_body_422(client):
    token = await make_user(client)
    response = await client.post(
        "/ai/intro-cards",
        headers=auth(token),
        json={"skills": "x", "language": "martian"},
    )
    assert response.status_code == 422


async def test_ai_requires_auth_401(client):
    response = await client.post(
        "/ai/translations",
        json={"text": "hi", "target_language": "ja"},
    )
    assert response.status_code == 401


async def test_disaster_alert_and_check_ins(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    # join
    invite = await client.post(
        f"/circles/{circle_id}/invites",
        headers=auth(leader),
        json={"auto_approve": True},
    )
    assert invite.status_code == 201
    code = (
        await client.get(f"/circles/{circle_id}/invites", headers=auth(leader))
    ).json()["items"][0]["code"]
    await client.post(
        "/users/me/memberships",
        headers=auth(member),
        json={"invite_code": code},
    )

    alert = await client.post(
        f"/circles/{circle_id}/disaster-alerts",
        headers=auth(leader),
        json={"severity": "warning", "title": "Typhoon", "message": "Stay safe"},
    )
    assert alert.status_code == 201, alert.text
    alert_id = alert.json()["id"]

    checked = await client.post(
        f"/disaster-alerts/{alert_id}/check-ins",
        headers=auth(member),
        json={"status": "safe", "note": "All good"},
    )
    assert checked.status_code == 201
    assert checked.json()["status"] == "safe"

    # The leader can see who checked in.
    listed = await client.get(
        f"/disaster-alerts/{alert_id}/check-ins", headers=auth(leader)
    )
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1


async def test_non_leader_cannot_raise_alert_403(client):
    leader = await make_user(client, display_name="Leader")
    circle_id = await make_circle(client, leader)
    outsider = await make_user(client, display_name="Outsider")
    response = await client.post(
        f"/circles/{circle_id}/disaster-alerts",
        headers=auth(outsider),
        json={"severity": "info", "title": "x"},
    )
    assert response.status_code == 403
