import uuid

from tests.integration.conftest import auth, completed_exchange


async def _money_thank_you(client, ctx) -> str:
    created = await client.post(
        "/thank-yous",
        headers=auth(ctx["requester"]),
        json={
            "exchange_id": ctx["exchange_id"],
            "gift_type": "money",
            "amount_minor": 50000,
            "currency": "BDT",
            "note": "Thank you",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["money_status"] == "offered"
    return created.json()["id"]


async def test_payment_idempotency_same_key_same_body(client):
    ctx = await completed_exchange(client)
    thank_you_id = await _money_thank_you(client, ctx)
    headers = {**auth(ctx["requester"]), "Idempotency-Key": "key-123456"}
    first = await client.post(
        "/payments", headers=headers, json={"thank_you_id": thank_you_id}
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/payments", headers=headers, json={"thank_you_id": thank_you_id}
    )
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]


async def test_payment_idempotency_conflict_on_different_body(client):
    ctx = await completed_exchange(client)
    thank_you_id = await _money_thank_you(client, ctx)
    headers = {**auth(ctx["requester"]), "Idempotency-Key": "reused-key-1"}
    first = await client.post(
        "/payments", headers=headers, json={"thank_you_id": thank_you_id}
    )
    assert first.status_code == 201
    conflict = await client.post(
        "/payments", headers=headers, json={"thank_you_id": str(uuid.uuid4())}
    )
    assert conflict.status_code in (404, 409)


async def test_payment_requires_idempotency_key_422(client):
    ctx = await completed_exchange(client)
    thank_you_id = await _money_thank_you(client, ctx)
    response = await client.post(
        "/payments",
        headers=auth(ctx["requester"]),
        json={"thank_you_id": thank_you_id},
    )
    assert response.status_code == 422


async def test_bkash_mock_simulate_success(client):
    ctx = await completed_exchange(client)
    thank_you_id = await _money_thank_you(client, ctx)
    headers = {**auth(ctx["requester"]), "Idempotency-Key": "sim-key-1"}
    payment = await client.post(
        "/payments", headers=headers, json={"thank_you_id": thank_you_id}
    )
    assert payment.status_code == 201
    assert payment.json()["provider"] == "bkash_mock"
    payment_id = payment.json()["id"]

    done = await client.post(
        f"/payments/{payment_id}/simulate-success", headers=auth(ctx["requester"])
    )
    assert done.status_code == 200
    assert done.json()["status"] == "succeeded"

    # The thank-you is now marked paid.
    thank_you = await client.get(
        f"/thank-yous/{thank_you_id}", headers=auth(ctx["requester"])
    )
    assert thank_you.json()["money_status"] == "paid"


async def test_payment_cancel_before_paid(client):
    ctx = await completed_exchange(client)
    thank_you_id = await _money_thank_you(client, ctx)
    headers = {**auth(ctx["requester"]), "Idempotency-Key": "cancel-key-1"}
    payment_id = (
        await client.post(
            "/payments", headers=headers, json={"thank_you_id": thank_you_id}
        )
    ).json()["id"]
    cancelled = await client.post(
        f"/payments/{payment_id}/cancel", headers=auth(ctx["requester"])
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


async def test_payee_cannot_be_charged_by_stranger_404(client):
    ctx = await completed_exchange(client)
    thank_you_id = await _money_thank_you(client, ctx)
    headers = {**auth(ctx["helper"]), "Idempotency-Key": "stranger-key-1"}
    # The helper is the payee, not the payer -> cannot start the payment.
    response = await client.post(
        "/payments", headers=headers, json={"thank_you_id": thank_you_id}
    )
    assert response.status_code == 404
