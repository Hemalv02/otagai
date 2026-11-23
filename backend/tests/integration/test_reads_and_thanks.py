from tests.integration.conftest import auth, completed_exchange


async def _mid(client, token):
    return (await client.get("/users/me", headers=auth(token))).json()["id"]


async def test_thank_you_patch_wall_and_user_reads(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]

    created = await client.post(
        "/thank-yous",
        headers=auth(requester),
        json={
            "exchange_id": ctx["exchange_id"],
            "gift_type": "note",
            "note": "Arigato",
        },
    )
    assert created.status_code == 201
    thank_you_id = created.json()["id"]

    read = await client.get(f"/thank-yous/{thank_you_id}", headers=auth(helper))
    assert read.status_code == 200

    # The recipient opts it onto the wall.
    walled = await client.patch(
        f"/thank-yous/{thank_you_id}",
        headers=auth(helper),
        json={"show_on_wall": True},
    )
    assert walled.status_code == 200
    assert walled.json()["show_on_wall"] is True

    sent = await client.get(
        "/users/me/thank-yous?direction=sent", headers=auth(requester)
    )
    assert sent.status_code == 200
    assert thank_you_id in [t["id"] for t in sent.json()["items"]]

    wall = await client.get(
        f"/circles/{ctx['circle_id']}/thank-yous", headers=auth(requester)
    )
    assert wall.status_code == 200

    helper_id = await _mid(client, helper)
    user_thanks = await client.get(
        f"/users/{helper_id}/thank-yous", headers=auth(requester)
    )
    assert user_thanks.status_code == 200


async def test_decline_money_keeps_note(client):
    ctx = await completed_exchange(client)
    thank_you_id = (
        await client.post(
            "/thank-yous",
            headers=auth(ctx["requester"]),
            json={
                "exchange_id": ctx["exchange_id"],
                "gift_type": "money",
                "amount_minor": 1000,
                "currency": "JPY",
                "note": "Please accept",
            },
        )
    ).json()["id"]
    declined = await client.post(
        f"/thank-yous/{thank_you_id}/decline-money", headers=auth(ctx["helper"])
    )
    assert declined.status_code == 200
    assert declined.json()["money_status"] == "declined"
    assert declined.json()["note"] == "Please accept"


async def test_points_from_thank_you(client):
    ctx = await completed_exchange(client)
    await client.post(
        "/thank-yous",
        headers=auth(ctx["requester"]),
        json={
            "exchange_id": ctx["exchange_id"],
            "gift_type": "points",
            "points_amount": 5,
        },
    )
    balance = await client.get("/users/me/points", headers=auth(ctx["helper"]))
    assert balance.status_code == 200
    assert balance.json()["balance"] == 5

    entries = await client.get("/users/me/points-entries", headers=auth(ctx["helper"]))
    assert entries.status_code == 200
    assert len(entries.json()["items"]) == 1


async def test_pair_and_misc_me_reads(client):
    ctx = await completed_exchange(client)
    requester, helper = ctx["requester"], ctx["helper"]
    helper_id = await _mid(client, helper)

    pair = await client.get(f"/users/{helper_id}/pair", headers=auth(requester))
    assert pair.status_code == 200
    assert pair.json()["they_helped_me"] == 1

    for path in (
        "/users/me/family-links",
        "/users/me/payments",
        "/users/me/reports",
        "/users/me/received-requests",
    ):
        response = await client.get(path, headers=auth(requester))
        assert response.status_code == 200, path


async def test_payment_get_by_id(client):
    ctx = await completed_exchange(client)
    thank_you_id = (
        await client.post(
            "/thank-yous",
            headers=auth(ctx["requester"]),
            json={
                "exchange_id": ctx["exchange_id"],
                "gift_type": "money",
                "amount_minor": 20000,
                "currency": "BDT",
            },
        )
    ).json()["id"]
    payment_id = (
        await client.post(
            "/payments",
            headers={**auth(ctx["requester"]), "Idempotency-Key": "read-key-1"},
            json={"thank_you_id": thank_you_id},
        )
    ).json()["id"]
    read = await client.get(f"/payments/{payment_id}", headers=auth(ctx["requester"]))
    assert read.status_code == 200
    assert read.json()["id"] == payment_id


async def test_report_resolve_by_leader(client):
    ctx = await completed_exchange(client)
    reporter, leader = ctx["helper"], ctx["requester"]
    helper_id = await _mid(client, reporter)
    report_id = (
        await client.post(
            "/reports",
            headers=auth(leader),
            json={
                "target_type": "user",
                "target_id": helper_id,
                "reason": "spam",
                "circle_id": ctx["circle_id"],
            },
        )
    ).json()["id"]

    mine = await client.get("/users/me/reports", headers=auth(leader))
    assert mine.status_code == 200

    queue = await client.get(
        f"/circles/{ctx['circle_id']}/reports", headers=auth(leader)
    )
    assert queue.status_code == 200

    resolved = await client.post(f"/reports/{report_id}/resolve", headers=auth(leader))
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
