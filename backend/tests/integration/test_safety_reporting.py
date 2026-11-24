import asyncio
import uuid

import pytest

from tests.integration.conftest import (
    auth,
    join_circle,
    make_circle,
    make_user,
    matched_exchange,
)


async def _user_id(client, token):
    response = await client.get("/users/me", headers=auth(token))
    assert response.status_code == 200, response.text
    return response.json()["id"]


async def _send_message(client, token, conversation_id):
    response = await client.post(
        f"/conversations/{conversation_id}/messages",
        headers=auth(token),
        json={"body": "Please leave the package at the gate."},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _make_target(client, target_type, reporter, subject):
    if target_type == "listing":
        categories = await client.get("/categories?kind=tool", headers=auth(subject))
        response = await client.post(
            "/listings",
            headers=auth(subject),
            json={
                "kind": "tool",
                "category_id": categories.json()["items"][0]["id"],
                "title": "Garden fork",
                "lang": "en",
            },
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    conversation = await client.post(
        "/conversations",
        headers=auth(reporter),
        json={"target_user_id": await _user_id(client, subject)},
    )
    assert conversation.status_code == 201, conversation.text
    return await _send_message(client, subject, conversation.json()["id"])


@pytest.mark.parametrize(
    ("target_type", "decision", "status"),
    [
        ("listing", "resolve", "resolved"),
        ("message", "dismiss", "dismissed"),
    ],
)
async def test_content_report_reaches_circle_queue_and_reporter_history(
    client, target_type, decision, status
):
    leader = await make_user(client, display_name="Leader")
    reporter = await make_user(client, display_name="Reporter")
    subject = await make_user(client, display_name="Reported neighbour")
    unrelated_leader = await make_user(client, display_name="Unrelated leader")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, reporter)
    await join_circle(client, leader, circle_id, subject)
    unrelated_circle = await make_circle(client, unrelated_leader)
    await join_circle(client, unrelated_leader, unrelated_circle, reporter)
    target_id = await _make_target(client, target_type, reporter, subject)
    payload = {
        "target_type": target_type,
        "target_id": target_id,
        "reason": "other",
        "details": "Safety context submitted by the reporter",
        "submission_id": str(uuid.uuid4()),
    }

    for invalid_payload in (
        {**payload, "target_id": str(uuid.uuid4())},
        {**payload, "circle_id": unrelated_circle},
    ):
        invalid = await client.post(
            "/reports", headers=auth(reporter), json=invalid_payload
        )
        assert invalid.status_code == 404, invalid.text
    hidden = await client.post("/reports", headers=auth(unrelated_leader), json=payload)
    assert hidden.status_code == 404, hidden.text

    blocked = await client.post(
        "/users/me/blocks",
        headers=auth(reporter),
        json={"user_id": await _user_id(client, subject)},
    )
    assert blocked.status_code == 201, blocked.text
    response = await client.post("/reports", headers=auth(reporter), json=payload)
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["target_id"] == target_id
    assert report["circle_id"] == circle_id
    assert report["status"] == "open"
    retry = await client.post("/reports", headers=auth(reporter), json=payload)
    assert retry.status_code == 201, retry.text
    assert retry.json()["id"] == report["id"]

    query = f"/circles/{circle_id}/reports?status=open"
    denied = await client.get(query, headers=auth(reporter))
    assert denied.status_code == 403, denied.text
    queue = await client.get(query, headers=auth(leader))
    assert queue.status_code == 200, queue.text
    assert [item["id"] for item in queue.json()["items"]] == [report["id"]]
    invalid_status = await client.get(
        f"/circles/{circle_id}/reports?status=invalid", headers=auth(leader)
    )
    assert invalid_status.status_code == 422, invalid_status.text

    action = f"/reports/{report['id']}/{decision}"
    denied = await client.post(action, headers=auth(reporter))
    assert denied.status_code == 403, denied.text
    hidden_from_subject = await client.post(action, headers=auth(subject))
    assert hidden_from_subject.status_code == 404, hidden_from_subject.text
    result = await client.post(action, headers=auth(leader))
    assert result.status_code == 200, result.text
    assert result.json()["status"] == status
    queue = await client.get(query, headers=auth(leader))
    assert queue.status_code == 200, queue.text
    assert queue.json()["items"] == []
    history = await client.get("/users/me/reports", headers=auth(reporter))
    assert history.status_code == 200, history.text
    assert [(item["id"], item["status"]) for item in history.json()["items"]] == [
        (report["id"], status)
    ]


@pytest.mark.parametrize("target_type", ["listing", "message"])
async def test_leader_cannot_moderate_reports_about_their_own_content(
    client, target_type
):
    leader = await make_user(client, display_name="Reported leader")
    reporter = await make_user(client, display_name="Reporter")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, reporter)
    target_id = await _make_target(client, target_type, reporter, leader)
    response = await client.post(
        "/reports",
        headers=auth(reporter),
        json={"target_type": target_type, "target_id": target_id, "reason": "spam"},
    )
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["circle_id"] == circle_id
    queue = await client.get(f"/circles/{circle_id}/reports", headers=auth(leader))
    assert queue.status_code == 200, queue.text
    assert queue.json()["items"] == []
    result = await client.post(f"/reports/{report['id']}/resolve", headers=auth(leader))
    assert result.status_code == 404, result.text


async def test_exchange_message_report_prefers_the_request_home_circle(client):
    ctx = await matched_exchange(client)
    reporter, subject = ctx["requester"], ctx["helper"]
    other_leader = await make_user(client, display_name="Other leader")
    newer_circle = await make_circle(client, other_leader)
    await join_circle(client, other_leader, newer_circle, subject)
    await join_circle(client, other_leader, newer_circle, reporter)
    inbox = await client.get("/users/me/conversations", headers=auth(reporter))
    assert inbox.status_code == 200, inbox.text
    conversation_id = next(
        item["id"]
        for item in inbox.json()["items"]
        if item["request_id"] == ctx["request_id"]
    )
    target_id = await _send_message(client, subject, conversation_id)
    response = await client.post(
        "/reports",
        headers=auth(reporter),
        json={"target_type": "message", "target_id": target_id, "reason": "spam"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["circle_id"] == ctx["circle_id"]


async def test_circle_reports_validate_status_filters(client):
    leader = await make_user(client)
    circle_id = await make_circle(client, leader)
    queue = f"/circles/{circle_id}/reports"
    valid = await client.get(
        f"{queue}?status=open,resolved&limit=1", headers=auth(leader)
    )
    assert valid.status_code == 200, valid.text
    invalid = await client.get(f"{queue}?status=invalid", headers=auth(leader))
    assert invalid.status_code == 422, invalid.text


async def test_accessible_chat_message_can_be_reported_without_a_shared_circle(client):
    subject = await make_user(client)
    reporter = await make_user(client)
    circle_id = await make_circle(client, subject)
    await join_circle(client, subject, circle_id, reporter)
    target_id = await _make_target(client, "message", reporter, subject)
    left = await client.delete(
        f"/users/me/memberships/{circle_id}", headers=auth(reporter)
    )
    assert left.status_code == 204, left.text
    response = await client.post(
        "/reports",
        headers=auth(reporter),
        json={"target_type": "message", "target_id": target_id, "reason": "spam"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["circle_id"] is None
    history = await client.get("/users/me/reports", headers=auth(reporter))
    assert history.status_code == 200, history.text
    assert [item["id"] for item in history.json()["items"]] == [response.json()["id"]]


async def test_competing_leaders_cannot_change_a_terminal_report_decision(client):
    leader = await make_user(client, display_name="Leader")
    other_leader = await make_user(client, display_name="Other leader")
    subject = await make_user(client, display_name="Reported neighbour")
    circle_id = await make_circle(client, leader)
    await join_circle(client, leader, circle_id, other_leader)
    await join_circle(client, leader, circle_id, subject)
    other_leader_id = await _user_id(client, other_leader)
    promoted = await client.patch(
        f"/circles/{circle_id}/memberships/{other_leader_id}",
        headers=auth(leader),
        json={"role": "leader"},
    )
    assert promoted.status_code == 200, promoted.text
    created = await client.post(
        "/reports",
        headers=auth(leader),
        json={
            "target_type": "user",
            "target_id": await _user_id(client, subject),
            "reason": "spam",
        },
    )
    assert created.status_code == 201, created.text
    report_id = created.json()["id"]

    decisions = [
        ("resolve", "resolved", leader),
        ("dismiss", "dismissed", other_leader),
    ]
    results = await asyncio.gather(
        *(
            client.post(f"/reports/{report_id}/{action}", headers=auth(actor))
            for action, _, actor in decisions
        )
    )
    assert sorted(result.status_code for result in results) == [200, 409]
    winner = next(
        index for index, result in enumerate(results) if result.status_code == 200
    )
    action, status, actor = decisions[winner]
    retry = await client.post(f"/reports/{report_id}/{action}", headers=auth(actor))
    assert retry.status_code == 200, retry.text
    assert retry.json()["status"] == status
    history = await client.get("/users/me/reports", headers=auth(leader))
    assert [(item["id"], item["status"]) for item in history.json()["items"]] == [
        (report_id, status)
    ]
