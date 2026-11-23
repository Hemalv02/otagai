from datetime import UTC, datetime, timedelta

from tests.integration.conftest import auth, make_user, matched_exchange


async def test_exchange_patch_return_and_dispute(client):
    ctx = await matched_exchange(client, loan=True)
    exch, helper, requester = ctx["exchange_id"], ctx["helper"], ctx["requester"]
    due_at = datetime.now(UTC) + timedelta(days=7)

    patched = await client.patch(
        f"/exchanges/{exch}",
        headers=auth(requester),
        json={"meet_place_note": "By the shrine gate", "due_at": due_at.isoformat()},
    )
    assert patched.status_code == 200
    assert patched.json()["meet_place_note"] == "By the shrine gate"

    handed = await client.post(f"/exchanges/{exch}/hand-over", headers=auth(helper))
    assert handed.status_code == 200

    returned = await client.post(f"/exchanges/{exch}/return", headers=auth(helper))
    assert returned.status_code == 200
    assert returned.json()["status"] == "returned"

    disputed = await client.post(
        f"/exchanges/{exch}/dispute",
        headers=auth(requester),
        json={"reason": "Part missing"},
    )
    assert disputed.status_code == 200
    assert disputed.json()["status"] == "disputed"


async def test_loan_extension_flow(client):
    ctx = await matched_exchange(client, loan=True)
    exch, helper, requester = ctx["exchange_id"], ctx["helper"], ctx["requester"]
    await client.post(f"/exchanges/{exch}/hand-over", headers=auth(helper))
    new_due_at = datetime.now(UTC) + timedelta(days=7)

    created = await client.post(
        f"/exchanges/{exch}/extensions",
        headers=auth(requester),
        json={"new_due_at": new_due_at.isoformat(), "message": "One more week?"},
    )
    assert created.status_code == 201, created.text
    extension_id = created.json()["id"]

    listed = await client.get(
        f"/exchanges/{exch}/extensions", headers=auth(helper)
    )
    assert listed.status_code == 200
    assert extension_id in [e["id"] for e in listed.json()["items"]]

    # A second pending extension conflicts.
    dup = await client.post(
        f"/exchanges/{exch}/extensions",
        headers=auth(requester),
        json={"new_due_at": (new_due_at + timedelta(days=1)).isoformat()},
    )
    assert dup.status_code == 409

    # Only the lender (helper) decides.
    declined = await client.post(
        f"/loan-extensions/{extension_id}/decline", headers=auth(helper)
    )
    assert declined.status_code == 200
    assert declined.json()["status"] == "declined"

    # A fresh extension can then be accepted.
    extension2 = (
        await client.post(
            f"/exchanges/{exch}/extensions",
            headers=auth(requester),
            json={"new_due_at": (new_due_at + timedelta(days=2)).isoformat()},
        )
    ).json()["id"]
    accepted = await client.post(
        f"/loan-extensions/{extension2}/accept", headers=auth(helper)
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"


async def test_handover_checklist_flow(client):
    ctx = await matched_exchange(client)
    exch, helper, requester = ctx["exchange_id"], ctx["helper"], ctx["requester"]

    created = await client.post(
        f"/exchanges/{exch}/handover-checks",
        headers=auth(helper),
        json={"phase": "pickup"},
    )
    assert created.status_code == 201, created.text
    check_id = created.json()["id"]

    # A second check for the same phase conflicts.
    dup = await client.post(
        f"/exchanges/{exch}/handover-checks",
        headers=auth(helper),
        json={"phase": "pickup"},
    )
    assert dup.status_code == 409

    listed = await client.get(
        f"/exchanges/{exch}/handover-checks", headers=auth(requester)
    )
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1

    read = await client.get(f"/handover-checks/{check_id}", headers=auth(requester))
    assert read.status_code == 200

    item = await client.post(
        f"/handover-checks/{check_id}/items",
        headers=auth(helper),
        json={"label": "Charger", "quantity": 1},
    )
    assert item.status_code == 201
    item_id = item.json()["items"][-1]["id"]

    marked = await client.patch(
        f"/handover-checks/{check_id}/items/{item_id}",
        headers=auth(requester),
        json={"present": True},
    )
    assert marked.status_code == 200

    removed = await client.delete(
        f"/handover-checks/{check_id}/items/{item_id}", headers=auth(helper)
    )
    assert removed.status_code == 204

    confirmed = await client.post(
        f"/handover-checks/{check_id}/confirm", headers=auth(helper)
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["lender_confirmed_at"] is not None


async def test_handover_non_participant_404(client):
    ctx = await matched_exchange(client)
    outsider = await make_user(client, display_name="Outsider")
    response = await client.post(
        f"/exchanges/{ctx['exchange_id']}/handover-checks",
        headers=auth(outsider),
        json={"phase": "pickup"},
    )
    assert response.status_code == 404
