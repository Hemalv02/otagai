from datetime import UTC, datetime, timedelta

import pytest

from app.services.exchanges import service as exchange_service
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
    original_due = datetime.now(UTC) + timedelta(days=3)
    await client.patch(
        f"/exchanges/{exch}",
        headers=auth(requester),
        json={"due_at": original_due.isoformat()},
    )
    await client.post(f"/exchanges/{exch}/hand-over", headers=auth(helper))
    active = await client.get(
        "/users/me/exchanges?status=active&limit=1", headers=auth(requester)
    )
    assert active.status_code == 200, active.text
    assert active.json()["items"][0]["id"] == exch
    new_due_at = datetime.now(UTC) + timedelta(days=7)

    created = await client.post(
        f"/exchanges/{exch}/extensions",
        headers=auth(requester),
        json={"new_due_at": new_due_at.isoformat(), "message": "One more week?"},
    )
    assert created.status_code == 201, created.text
    extension_id = created.json()["id"]

    listed = await client.get(f"/exchanges/{exch}/extensions", headers=auth(helper))
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
    after_decline = await client.get(f"/exchanges/{exch}", headers=auth(requester))
    assert datetime.fromisoformat(after_decline.json()["due_at"]) == original_due

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
    for participant in (requester, helper):
        saved = await client.get(f"/exchanges/{exch}", headers=auth(participant))
        assert datetime.fromisoformat(saved.json()["due_at"]) == new_due_at + timedelta(
            days=2
        )
        history = await client.get(
            f"/exchanges/{exch}/extensions", headers=auth(participant)
        )
        assert {item["status"] for item in history.json()["items"]} == {
            "accepted",
            "declined",
        }


async def test_extension_authorization_and_dates(client):
    ctx = await matched_exchange(client, loan=True)
    exch, helper, borrower = ctx["exchange_id"], ctx["helper"], ctx["requester"]
    outsider = await make_user(client, display_name="Outsider")
    due = datetime.now(UTC) + timedelta(days=3)
    await client.patch(
        f"/exchanges/{exch}", headers=auth(borrower), json={"due_at": due.isoformat()}
    )
    await client.post(f"/exchanges/{exch}/hand-over", headers=auth(helper))
    path = f"/exchanges/{exch}/extensions"
    valid = {"new_due_at": (due + timedelta(days=1)).isoformat()}
    assert (
        await client.post(path, headers=auth(helper), json=valid)
    ).status_code == 409
    assert (
        await client.post(path, headers=auth(outsider), json=valid)
    ).status_code == 404
    assert (await client.get(path, headers=auth(outsider))).status_code == 404
    assert (
        await client.get(f"/exchanges/{exch}", headers=auth(outsider))
    ).status_code == 404
    for invalid in (
        datetime.now(UTC) - timedelta(days=1),
        due - timedelta(days=1),
        due,
    ):
        response = await client.post(
            path, headers=auth(borrower), json={"new_due_at": invalid.isoformat()}
        )
        assert response.status_code == 400
    naive = await client.post(
        path, headers=auth(borrower), json={"new_due_at": "2030-01-01T12:00:00"}
    )
    assert naive.status_code == 422
    created = await client.post(path, headers=auth(borrower), json=valid)
    assert created.status_code == 201
    extension_id = created.json()["id"]
    for caller, expected in ((borrower, 409), (outsider, 404)):
        for decision in ("accept", "decline"):
            result = await client.post(
                f"/loan-extensions/{extension_id}/{decision}", headers=auth(caller)
            )
            assert result.status_code == expected


async def test_extension_without_initial_due_date(client):
    ctx = await matched_exchange(client, loan=True)
    borrower, helper, exch = ctx["requester"], ctx["helper"], ctx["exchange_id"]
    scheduled = await client.get(
        "/users/me/exchanges?status=active", headers=auth(borrower)
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["items"] == []
    invalid_filter = await client.get(
        "/users/me/exchanges?status=unknown", headers=auth(borrower)
    )
    assert invalid_filter.status_code == 422
    await client.post(f"/exchanges/{exch}/hand-over", headers=auth(helper))
    due = datetime.now(UTC) + timedelta(days=1)
    requested = await client.post(
        f"/exchanges/{exch}/extensions",
        headers=auth(borrower),
        json={"new_due_at": due.isoformat()},
    )
    assert requested.status_code == 201
    accepted = await client.post(
        f"/loan-extensions/{requested.json()['id']}/accept", headers=auth(helper)
    )
    assert accepted.status_code == 200
    saved = await client.get(f"/exchanges/{exch}", headers=auth(borrower))
    assert datetime.fromisoformat(saved.json()["due_at"]) == due


@pytest.mark.parametrize("stale_reason", ["returned", "expired", "due_date_changed"])
async def test_stale_extension_can_be_declined_but_cannot_be_accepted(
    client, monkeypatch, stale_reason
):
    ctx = await matched_exchange(client, loan=True)
    exchange_path = f"/exchanges/{ctx['exchange_id']}"
    borrower = auth(ctx["requester"])
    lender = auth(ctx["helper"])
    due_at = datetime.now(UTC) + timedelta(days=1)
    proposed_due_at = due_at + timedelta(days=1)

    scheduled = await client.patch(
        exchange_path, headers=borrower, json={"due_at": due_at.isoformat()}
    )
    assert scheduled.status_code == 200, scheduled.text
    handed_over = await client.post(f"{exchange_path}/hand-over", headers=lender)
    assert handed_over.status_code == 200, handed_over.text
    requested = await client.post(
        f"{exchange_path}/extensions",
        headers=borrower,
        json={"new_due_at": proposed_due_at.isoformat()},
    )
    assert requested.status_code == 201, requested.text
    decision_path = f"/loan-extensions/{requested.json()['id']}"

    if stale_reason == "returned":
        returned = await client.post(f"{exchange_path}/return", headers=lender)
        assert returned.status_code == 200, returned.text
    elif stale_reason == "expired":

        class AtProposedDate(datetime):
            @classmethod
            def now(cls, tz=None):
                return proposed_due_at.astimezone(tz)

        monkeypatch.setattr(exchange_service, "datetime", AtProposedDate)
    else:
        due_at = proposed_due_at + timedelta(days=1)
        rescheduled = await client.patch(
            exchange_path, headers=borrower, json={"due_at": due_at.isoformat()}
        )
        assert rescheduled.status_code == 200, rescheduled.text

    accepted = await client.post(f"{decision_path}/accept", headers=lender)
    assert accepted.status_code == 409, accepted.text

    saved = await client.get(exchange_path, headers=borrower)
    assert datetime.fromisoformat(saved.json()["due_at"]) == due_at
    declined = await client.post(f"{decision_path}/decline", headers=lender)
    assert declined.status_code == 200, declined.text
    assert declined.json()["status"] == "declined"


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
