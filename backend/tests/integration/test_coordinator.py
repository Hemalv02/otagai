import uuid

from tests.integration.conftest import auth, join_circle, make_circle, make_user


async def test_leader_sees_dashboard(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)

    # The member posts a request with no responses -> an unmet need.
    await client.post(
        "/requests",
        headers=auth(member),
        json={"kind": "help", "raw_text": "Need help", "lang": "ja"},
    )

    requests = await client.get(f"/circles/{circle_id}/requests", headers=auth(leader))
    assert requests.status_code == 200
    assert len(requests.json()["items"]) >= 1

    unmet = await client.get(f"/circles/{circle_id}/unmet-needs", headers=auth(leader))
    assert unmet.status_code == 200
    assert len(unmet.json()["items"]) >= 1

    helpers = await client.get(f"/circles/{circle_id}/helpers", headers=auth(leader))
    assert helpers.status_code == 200


async def test_regular_member_cannot_see_dashboard_403(client):
    leader = await make_user(client, display_name="Leader")
    member = await make_user(client, display_name="Member")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, member)
    response = await client.get(f"/circles/{circle_id}/requests", headers=auth(member))
    assert response.status_code == 403


async def test_unknown_circle_dashboard_404(client):
    leader = await make_user(client)
    response = await client.get(
        f"/circles/{uuid.uuid4()}/unmet-needs", headers=auth(leader)
    )
    assert response.status_code == 404


async def test_dashboard_requires_auth_401(client):
    response = await client.get(f"/circles/{uuid.uuid4()}/helpers")
    assert response.status_code == 401


async def test_map_pins_bad_bbox_422(client):
    token = await make_user(client)
    response = await client.get("/map-pins?bbox=1,2,3", headers=auth(token))
    assert response.status_code == 422


async def test_map_pins_returns_viewer_circles(client):
    leader = await make_user(client)
    await make_circle(client, leader)
    response = await client.get("/map-pins?bbox=-180,-90,180,90", headers=auth(leader))
    assert response.status_code == 200
    assert "items" in response.json()
