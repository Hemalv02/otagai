import asyncio
import io
import uuid
from datetime import UTC, datetime, timedelta

import httpx2
from PIL import Image

from app.database.models.enums import MediaPurpose
from app.main import create_app
from app.routes.dependencies import get_auth_claims, get_storage
from app.services.auth.service import AuthClaims

RESULTS = []


def rec(label, method, path, status, ok, detail=""):
    RESULTS.append((ok, label, method, path, status, detail))
    mark = "ok " if ok else "XX "
    print(f"{mark}{method:6} {path:52} -> {status}  {('' if ok else detail)[:140]}")


class FakeStorage:
    def __init__(self):
        self.objects = {}

    async def upload(self, key, content, content_type):
        self.objects[key] = (content, content_type)

    async def download(self, key, *, max_bytes=10 * 1024 * 1024):
        return self.objects[key][0]

    async def delete(self, key):
        self.objects.pop(key, None)

    async def presigned_get_url(self, key, *, expires_in=900):
        return f"https://fake-storage.local/{key}?exp={expires_in}"

    async def ensure_bucket(self):
        pass

    async def check(self):
        return True


def png_bytes():
    img = Image.new("RGB", (64, 48), (120, 160, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def ts(delta_hours=0):
    return (datetime.now(UTC) + timedelta(hours=delta_hours)).isoformat()


async def seed_category(app):
    from sqlalchemy import text

    db = app.state.database
    cat_id = uuid.uuid4()
    async with db.session() as s:
        await s.execute(
            text(
                "INSERT INTO categories (id, slug, kind, parent_id, names, icon, "
                "is_risky, sort_order) VALUES (:id, :slug, 'tool', NULL, "
                '\'{"en": "Tools"}\'::jsonb, NULL, false, 1)'
            ),
            {"id": cat_id, "slug": f"tools_{cat_id.hex[:8]}"},
        )
    return cat_id


async def main():
    app = create_app()
    storage = FakeStorage()
    app.dependency_overrides[get_storage] = lambda: storage

    from fastapi import Request

    async def claims_override(request: Request):
        auth = request.headers.get("authorization", "")
        token = auth.removeprefix("Bearer ").strip()
        try:
            aid = uuid.UUID(token)
        except ValueError:
            from app.routes.dependencies import unauthorized

            raise unauthorized("bad test token")
        return AuthClaims(auth_user_id=aid, email=f"{token[:8]}@t.local", phone=None)

    app.dependency_overrides[get_auth_claims] = claims_override

    transport = httpx2.ASGITransport(app=app)
    async with (
        httpx2.AsyncClient(transport=transport, base_url="http://t") as c,
        app.router.lifespan_context(app),
    ):
        await run_all(app, c)

    print("\n================ SUMMARY ================")
    fails = [r for r in RESULTS if not r[0]]
    print(
        f"total calls: {len(RESULTS)}   passed: {len(RESULTS) - len(fails)}   FAILED: {len(fails)}"
    )
    if fails:
        print("\n---- FAILURES ----")
        for ok, label, method, path, status, detail in fails:
            print(f"[{label}] {method} {path} -> {status}\n    {detail[:300]}")


async def run_all(app, c):
    # auth tokens (= auth_user_id)
    tokA, tokB, tokC = (str(uuid.uuid4()) for _ in range(3))

    def H(tok, extra=None):
        h = {"Authorization": f"Bearer {tok}"}
        if extra:
            h.update(extra)
        return h

    async def call(
        label,
        method,
        path,
        tok,
        *,
        json=None,
        files=None,
        data=None,
        headers=None,
        expect=(200, 201, 204),
    ):
        hh = H(tok, headers) if tok else (headers or {})
        try:
            r = await c.request(
                method, path, json=json, files=files, data=data, headers=hh
            )
        except Exception as error:  # noqa: BLE001
            rec(label, method, path, "EXC", False, f"{type(error).__name__}: {error}")

            class _R:
                status_code = 500

                def json(self):
                    return {}

            return _R()
        ok = r.status_code in expect
        detail = "" if ok else (r.text or "")
        rec(label, method, path, r.status_code, ok, detail)
        return r

    cat_id = await seed_category(app)

    # ---------- users ----------
    for tok, name in ((tokA, "Aiko"), (tokB, "Bashir"), (tokC, "Chen")):
        await call(
            "users.create",
            "POST",
            "/users",
            tok,
            json={
                "display_name": name,
                "preferred_language": "en",
                "region": "jp",
                "languages": ["en", "ja"],
                "age_band": "40s",
                "happy_to_help_with": "tools and errands",
            },
            expect=(201,),
        )
    await call("users.me", "GET", "/users/me", tokA)
    await call(
        "users.patch",
        "PATCH",
        "/users/me",
        tokA,
        json={"intro": "Hello neighbours", "simple_mode": True},
    )
    r = await call(
        "push.register",
        "POST",
        "/users/me/push-tokens",
        tokA,
        json={"expo_token": "ExponentPushToken[abc123DEF]", "platform": "ios"},
        expect=(200, 201),
    )
    push_id = r.json().get("id") if r.status_code < 300 else None
    if push_id:
        await call(
            "push.delete",
            "DELETE",
            f"/users/me/push-tokens/{push_id}",
            tokA,
            expect=(204,),
        )

    # resolve profile ids
    rA = await call("users.me.A", "GET", "/users/me", tokA)
    rB = await call("users.me.B", "GET", "/users/me", tokB)
    rC = await call("users.me.C", "GET", "/users/me", tokC)
    uidA = rA.json()["id"]
    uidB = rB.json()["id"]
    uidC = rC.json()["id"]

    # ---------- check-in settings (NEW) ----------
    await call("checkin.get.default", "GET", "/users/me/check-in-settings", tokA)
    await call(
        "checkin.put",
        "PUT",
        "/users/me/check-in-settings",
        tokA,
        json={"enabled": True, "frequency_days": 2, "buddy_user_id": uidB},
    )
    await call(
        "checkin.put.selfbuddy",
        "PUT",
        "/users/me/check-in-settings",
        tokA,
        json={"enabled": True, "frequency_days": 2, "buddy_user_id": uidA},
        expect=(400,),
    )
    await call("checkin.get", "GET", "/users/me/check-in-settings", tokA)

    # ---------- circles ----------
    r = await call(
        "circles.create",
        "POST",
        "/circles",
        tokA,
        json={
            "name": "Sakura Han",
            "unit_type": "han",
            "region": "jp",
            "approx_lat": 35.0,
            "approx_lng": 139.0,
            "open_to_nearby": True,
        },
        expect=(201,),
    )
    circle_id = r.json()["id"]
    await call("circles.browse", "GET", "/circles?q=Sakura", tokA)
    await call("circles.read", "GET", f"/circles/{circle_id}", tokA)
    await call(
        "circles.patch",
        "PATCH",
        f"/circles/{circle_id}",
        tokA,
        json={"open_to_nearby": False},
    )
    # invite + join
    r = await call(
        "invite.create",
        "POST",
        f"/circles/{circle_id}/invites",
        tokA,
        json={"auto_approve": True, "max_uses": 10},
        expect=(201,),
    )
    code = r.json().get("code")
    await call("invite.preview", "GET", f"/circle-invites/{code}", tokB)
    await call("circles.invites.list", "GET", f"/circles/{circle_id}/invites", tokA)
    # B and C join
    for tok in (tokB, tokC):
        await call(
            "membership.join",
            "POST",
            "/users/me/memberships",
            tok,
            json={"invite_code": code},
            expect=(200, 201),
        )
    await call("memberships.mine", "GET", "/users/me/memberships", tokB)
    await call("circle.memberships", "GET", f"/circles/{circle_id}/memberships", tokA)
    # make C a coordinator
    await call(
        "membership.role",
        "PATCH",
        f"/circles/{circle_id}/memberships/{uidC}",
        tokA,
        json={"role": "coordinator"},
    )

    # ---------- categories ----------
    await call("categories.list", "GET", "/categories", tokA)

    # ---------- media (image) ----------
    r = await call(
        "media.create",
        "POST",
        "/media",
        tokA,
        files={"file": ("p.png", png_bytes(), "image/png")},
        data={"purpose": MediaPurpose.LISTING.value},
        expect=(201,),
    )
    media_id = r.json()["id"] if r.status_code < 300 else None
    if media_id:
        await call("media.get", "GET", f"/media/{media_id}", tokA)

    # ---------- listings ----------
    body = {
        "kind": "tool",
        "category_id": cat_id if isinstance(cat_id, str) else str(cat_id),
        "title": "Cordless Drill",
        "description": "18V drill",
        "lang": "en",
        "safety_notes": "Wear goggles",
        "lend_mode": "lend",
        "max_loan_days": 7,
        "visibility": "association",
        "parts": [{"label": "battery", "quantity": 1}],
    }
    if media_id:
        body["media_ids"] = [media_id]
    r = await call(
        "listings.create", "POST", "/listings", tokA, json=body, expect=(201,)
    )
    listing_id = r.json()["id"] if r.status_code < 300 else None
    await call("listings.browse", "GET", "/listings", tokB)
    if listing_id:
        await call("listings.read", "GET", f"/listings/{listing_id}", tokB)
        await call(
            "listings.patch",
            "PATCH",
            f"/listings/{listing_id}",
            tokA,
            json={"title": "Cordless Drill 18V"},
        )
        await call("listings.pause", "POST", f"/listings/{listing_id}/pause", tokA)
        await call("listings.resume", "POST", f"/listings/{listing_id}/resume", tokA)
        await call(
            "listings.parts",
            "PUT",
            f"/listings/{listing_id}/parts",
            tokA,
            json={"parts": [{"label": "charger", "quantity": 1}]},
        )
        await call(
            "listings.media",
            "PUT",
            f"/listings/{listing_id}/media",
            tokA,
            json={"media_ids": [media_id] if media_id else []},
        )
    await call("listings.mine", "GET", "/users/me/listings", tokA)

    # ---------- NOTICES (NEW) ----------
    r = await call(
        "notices.create",
        "POST",
        f"/circles/{circle_id}/notices",
        tokA,
        json={
            "title": "Recycling day",
            "body": "Thursday 8am",
            "lang": "en",
            "pinned": True,
        },
        expect=(201,),
    )
    notice_id = r.json()["id"] if r.status_code < 300 else None
    await call(
        "notices.create.nonleader",
        "POST",
        f"/circles/{circle_id}/notices",
        tokB,
        json={"title": "x", "lang": "en"},
        expect=(403,),
    )
    await call("notices.list", "GET", f"/circles/{circle_id}/notices", tokB)
    if notice_id:
        await call("notices.read", "GET", f"/notices/{notice_id}", tokB)
        await call(
            "notices.patch",
            "PATCH",
            f"/notices/{notice_id}",
            tokA,
            json={"pinned": False, "body": "Thu 8:30"},
        )
        await call(
            "notices.patch.byother",
            "PATCH",
            f"/notices/{notice_id}",
            tokB,
            json={"body": "nope"},
            expect=(403,),
        )
        await call(
            "notices.delete", "DELETE", f"/notices/{notice_id}", tokA, expect=(204,)
        )
        await call(
            "notices.read.deleted", "GET", f"/notices/{notice_id}", tokB, expect=(404,)
        )

    # ---------- EVENTS (NEW) ----------
    r = await call(
        "events.create",
        "POST",
        f"/circles/{circle_id}/events",
        tokB,
        json={
            "title": "Cleaning day",
            "description": "park",
            "lang": "en",
            "starts_at": ts(24),
            "ends_at": ts(26),
            "location_note": "North park",
            "capacity": 2,
        },
        expect=(201,),
    )
    event_id = r.json()["id"] if r.status_code < 300 else None
    await call("events.list", "GET", f"/circles/{circle_id}/events", tokA)
    if event_id:
        await call("events.read", "GET", f"/events/{event_id}", tokA)
        await call(
            "events.patch",
            "PATCH",
            f"/events/{event_id}",
            tokB,
            json={"capacity": 3, "location_note": "South park"},
        )
        await call(
            "events.patch.badwindow",
            "PATCH",
            f"/events/{event_id}",
            tokB,
            json={"ends_at": ts(1)},
            expect=(400,),
        )
        await call(
            "events.signup.A",
            "POST",
            f"/events/{event_id}/signups",
            tokA,
            json={"note": "I'll bring gloves"},
            expect=(201,),
        )
        await call(
            "events.signup.B",
            "POST",
            f"/events/{event_id}/signups",
            tokB,
            json={},
            expect=(201,),
        )
        await call(
            "events.signup.again",
            "POST",
            f"/events/{event_id}/signups",
            tokA,
            json={},
            expect=(201,),
        )
        await call("events.read.after", "GET", f"/events/{event_id}", tokA)
        await call(
            "events.signup.del",
            "DELETE",
            f"/events/{event_id}/signups/me",
            tokA,
            expect=(204,),
        )
        await call("events.cancel", "POST", f"/events/{event_id}/cancel", tokB)
        await call(
            "events.signup.cancelled",
            "POST",
            f"/events/{event_id}/signups",
            tokC,
            json={},
            expect=(409,),
        )

    # ---------- DISASTER (NEW) ----------
    r = await call(
        "disaster.alert.create",
        "POST",
        f"/circles/{circle_id}/disaster-alerts",
        tokA,
        json={"severity": "warning", "title": "Typhoon", "message": "Stay safe"},
        expect=(201,),
    )
    alert_id = r.json()["id"] if r.status_code < 300 else None
    await call(
        "disaster.alert.nonleader",
        "POST",
        f"/circles/{circle_id}/disaster-alerts",
        tokB,
        json={"severity": "info", "title": "x"},
        expect=(403,),
    )
    if alert_id:
        await call(
            "disaster.checkin.A",
            "POST",
            f"/disaster-alerts/{alert_id}/check-ins",
            tokA,
            json={"status": "safe", "note": "all ok"},
            expect=(201,),
        )
        await call(
            "disaster.checkin.B",
            "POST",
            f"/disaster-alerts/{alert_id}/check-ins",
            tokB,
            json={"status": "need_help"},
            expect=(201,),
        )
        await call(
            "disaster.checkin.update",
            "POST",
            f"/disaster-alerts/{alert_id}/check-ins",
            tokB,
            json={"status": "safe"},
            expect=(201,),
        )
        await call(
            "disaster.checkins.list",
            "GET",
            f"/disaster-alerts/{alert_id}/check-ins",
            tokC,
        )

    # ---------- requests / responses / accept -> exchange ----------
    r = await call(
        "requests.create",
        "POST",
        "/requests",
        tokB,
        json={
            "kind": "borrow",
            "raw_text": "Need a drill for an hour",
            "lang": "en",
            "category_id": str(cat_id),
            "ripple_max_stage": "han",
            "home_circle_id": circle_id,
        },
        expect=(201,),
    )
    request_id = r.json()["id"] if r.status_code < 300 else None
    await call("requests.mine", "GET", "/users/me/requests", tokB)
    await call("requests.received", "GET", "/users/me/received-requests", tokA)
    exchange_id = None
    response_id = None
    if request_id:
        await call("requests.read", "GET", f"/requests/{request_id}", tokA)
        await call(
            "requests.patch",
            "PATCH",
            f"/requests/{request_id}",
            tokB,
            json={"raw_text": "Need a drill briefly"},
        )
        await call(
            "requests.widen",
            "POST",
            f"/requests/{request_id}/widen",
            tokB,
            expect=(200, 409),
        )
        r = await call(
            "responses.create",
            "POST",
            f"/requests/{request_id}/responses",
            tokA,
            json={
                "kind": "offer",
                "listing_id": listing_id,
                "brings_tool": True,
                "message": "Happy to lend",
                "lang": "en",
            },
            expect=(201,),
        )
        response_id = r.json().get("id") if r.status_code < 300 else None
        await call("responses.list", "GET", f"/requests/{request_id}/responses", tokB)
        if response_id:
            await call(
                "responses.patch",
                "PATCH",
                f"/requests/{request_id}/responses/{response_id}",
                tokA,
                json={"message": "Can lend after 5pm"},
            )
            r = await call(
                "responses.accept",
                "POST",
                f"/requests/{request_id}/responses/{response_id}/accept",
                tokB,
                expect=(200, 201),
            )
            if r.status_code < 300:
                rex = await c.request("GET", "/users/me/exchanges", headers=H(tokA))
                items = rex.json().get("items", []) if rex.status_code < 300 else []
                if items:
                    exchange_id = items[0]["id"]
        await call(
            "received.patch",
            "PATCH",
            f"/users/me/received-requests/{request_id}",
            tokA,
            json={"seen": True},
        )

    # ---------- exchanges ----------
    if exchange_id:
        await call("exchanges.mine", "GET", "/users/me/exchanges", tokA)
        await call("exchanges.read", "GET", f"/exchanges/{exchange_id}", tokB)
        await call(
            "exchanges.patch",
            "PATCH",
            f"/exchanges/{exchange_id}",
            tokA,
            json={
                "meet_place_note": "At the gate",
                "scheduled_at": ts(2),
                "due_at": ts(50),
            },
        )
        rchk = await call(
            "handover.start",
            "POST",
            f"/exchanges/{exchange_id}/handover-checks",
            tokA,
            json={"phase": "pickup"},
            expect=(201,),
        )
        check_id = rchk.json().get("id") if rchk.status_code < 300 else None
        await call(
            "handover.list", "GET", f"/exchanges/{exchange_id}/handover-checks", tokA
        )
        if check_id:
            await call("handover.read", "GET", f"/handover-checks/{check_id}", tokA)
        await call(
            "exchange.handover",
            "POST",
            f"/exchanges/{exchange_id}/hand-over",
            tokA,
            expect=(200, 409),
        )
        # extensions
        rext = await call(
            "ext.create",
            "POST",
            f"/exchanges/{exchange_id}/extensions",
            tokB,
            json={"new_due_at": ts(80), "message": "one more day?"},
            expect=(201,),
        )
        ext_id = rext.json().get("id") if rext.status_code < 300 else None
        await call("ext.list", "GET", f"/exchanges/{exchange_id}/extensions", tokA)
        if ext_id:
            await call(
                "ext.accept",
                "POST",
                f"/loan-extensions/{ext_id}/accept",
                tokA,
                expect=(200, 409),
            )
        await call(
            "exchange.return",
            "POST",
            f"/exchanges/{exchange_id}/return",
            tokB,
            expect=(200, 409),
        )
        await call(
            "exchange.confirm.helper",
            "POST",
            f"/exchanges/{exchange_id}/confirm",
            tokA,
            expect=(200,),
        )
        await call(
            "exchange.confirm.requester",
            "POST",
            f"/exchanges/{exchange_id}/confirm",
            tokB,
            expect=(200,),
        )

    # ---------- chat ----------
    rconv = await call(
        "chat.start",
        "POST",
        "/conversations",
        tokB,
        json={"target_user_id": uidA},
        expect=(200, 201),
    )
    conv_id = rconv.json().get("id") if rconv.status_code < 300 else None
    await call("chat.mine", "GET", "/users/me/conversations", tokB)
    if conv_id:
        await call("chat.read", "GET", f"/conversations/{conv_id}", tokA)
        rmsg = await call(
            "chat.msg.text",
            "POST",
            f"/conversations/{conv_id}/messages",
            tokB,
            json={
                "kind": "text",
                "body": "Hi!",
                "client_message_id": str(uuid.uuid4()),
            },
            expect=(201,),
        )
        msg_id = rmsg.json().get("id") if rmsg.status_code < 300 else None
        rcm = await call(
            "media.chat",
            "POST",
            "/media",
            tokB,
            files={"file": ("c.png", png_bytes(), "image/png")},
            data={"purpose": MediaPurpose.CHAT.value},
            expect=(201,),
        )
        chat_media_id = rcm.json().get("id") if rcm.status_code < 300 else None
        if chat_media_id:
            await call(
                "chat.msg.image",
                "POST",
                f"/conversations/{conv_id}/messages",
                tokB,
                json={"kind": "image", "media_ids": [chat_media_id]},
                expect=(201,),
            )
        await call("chat.messages", "GET", f"/conversations/{conv_id}/messages", tokA)
        if msg_id:
            await call(
                "chat.msg.edit",
                "PATCH",
                f"/conversations/{conv_id}/messages/{msg_id}",
                tokB,
                json={"body": "Hi there!"},
            )
            await call(
                "chat.msg.delete",
                "DELETE",
                f"/conversations/{conv_id}/messages/{msg_id}",
                tokB,
                expect=(204,),
            )
        await call(
            "chat.participant",
            "PATCH",
            f"/conversations/{conv_id}/participants/me",
            tokA,
            json={"mark_read": True},
        )

    # ---------- thanks (money) / points / payments ----------
    thank_id = None
    if exchange_id:
        rth = await call(
            "thanks.create",
            "POST",
            "/thank-yous",
            tokB,
            json={
                "exchange_id": exchange_id,
                "gift_type": "money",
                "note": "Thanks so much!",
                "lang": "en",
                "amount_minor": 5000,
                "currency": "BDT",
            },
            expect=(201,),
        )
        thank_id = rth.json().get("id") if rth.status_code < 300 else None
    await call("thanks.mine", "GET", "/users/me/thank-yous", tokB)
    await call("points.balance", "GET", "/users/me/points", tokA)
    await call("points.entries", "GET", "/users/me/points-entries", tokA)
    await call("thanks.wall", "GET", f"/circles/{circle_id}/thank-yous", tokA)
    if thank_id:
        await call("thanks.read", "GET", f"/thank-yous/{thank_id}", tokA)
        await call(
            "thanks.patch",
            "PATCH",
            f"/thank-yous/{thank_id}",
            tokA,
            json={"show_on_wall": True},
        )
        rpay = await call(
            "payments.create",
            "POST",
            "/payments",
            tokB,
            json={"thank_you_id": thank_id},
            headers={"Idempotency-Key": uuid.uuid4().hex},
            expect=(201,),
        )
        pay_id = rpay.json().get("id") if rpay.status_code < 300 else None
        await call("payments.mine", "GET", "/users/me/payments", tokB)
        if pay_id:
            await call("payments.read", "GET", f"/payments/{pay_id}", tokB)
            await call(
                "payments.simulate",
                "POST",
                f"/payments/{pay_id}/simulate-success",
                tokB,
                expect=(200,),
            )
            await call(
                "thanks.decline",
                "POST",
                f"/thank-yous/{thank_id}/decline-money",
                tokA,
                expect=(200, 409),
            )

    # ---------- relationships: managed user + proxy + family ----------
    rmg = await call(
        "managed.create",
        "POST",
        "/managed-users",
        tokA,
        json={
            "display_name": "Grandpa Sato",
            "preferred_language": "ja",
            "region": "jp",
            "languages": ["ja"],
            "age_band": "80_plus",
            "grant": {
                "caretaker_role": "family",
                "consent_method": "in_person",
                "scopes": {"can_post_requests": True, "can_chat": True},
            },
        },
        expect=(201,),
    )
    managed_id = rmg.json().get("user", {}).get("id") if rmg.status_code < 300 else None
    if managed_id:
        await call(
            "managed.patch",
            "PATCH",
            f"/managed-users/{managed_id}",
            tokA,
            json={"display_name": "Grandpa Sato II"},
        )
    await call("neighbours.list", "GET", "/users/me/neighbours", tokA)
    await call("user.profile", "GET", f"/users/{uidB}", tokA)
    await call("user.pair", "GET", f"/users/{uidB}/pair", tokA)
    await call("grants.mine", "GET", "/users/me/proxy-grants", tokA)
    # family link A -> B
    rfl = await call(
        "family.create",
        "POST",
        "/family-links",
        tokA,
        json={"relative_user_id": uidB, "relation": "sibling"},
        expect=(201,),
    )
    link_id = rfl.json().get("id") if rfl.status_code < 300 else None
    await call("family.mine", "GET", "/users/me/family-links", tokA)
    if link_id:
        await call(
            "family.accept",
            "POST",
            f"/family-links/{link_id}/accept",
            tokB,
            expect=(200, 409),
        )

    # ---------- safety: block + report ----------
    await call(
        "block.create",
        "POST",
        "/users/me/blocks",
        tokC,
        json={"user_id": uidB},
        expect=(200, 201),
    )
    await call("block.list", "GET", "/users/me/blocks", tokC)
    await call(
        "block.delete", "DELETE", f"/users/me/blocks/{uidB}", tokC, expect=(204,)
    )
    if listing_id:
        rrep = await call(
            "report.create",
            "POST",
            "/reports",
            tokC,
            json={
                "target_type": "listing",
                "target_id": listing_id,
                "reason": "spam",
                "details": "looks off",
                "circle_id": circle_id,
            },
            expect=(201,),
        )
        report_id = rrep.json().get("id") if rrep.status_code < 300 else None
        await call("reports.mine", "GET", "/users/me/reports", tokC)
        await call("circle.reports", "GET", f"/circles/{circle_id}/reports", tokA)
        if report_id:
            await call(
                "report.resolve",
                "POST",
                f"/reports/{report_id}/resolve",
                tokA,
                expect=(200, 403),
            )

    # ---------- home / notifications / coordinator / map ----------
    await call("home", "GET", "/users/me/home", tokA)
    await call("unread", "GET", "/users/me/unread-counts", tokA)
    await call("notifs.list", "GET", "/users/me/notifications", tokA)
    await call(
        "notifs.readall",
        "POST",
        "/users/me/notifications/read-all",
        tokA,
        expect=(204,),
    )
    await call("coord.requests", "GET", f"/circles/{circle_id}/requests", tokA)
    await call("coord.unmet", "GET", f"/circles/{circle_id}/unmet-needs", tokA)
    await call("coord.helpers", "GET", f"/circles/{circle_id}/helpers", tokA)
    await call("map.pins", "GET", "/map-pins?bbox=138,34,140,36", tokA)

    # ---------- ask-sessions (may need OpenAI) ----------
    r = await call(
        "ask.start",
        "POST",
        "/ask-sessions",
        tokB,
        json={"input_mode": "text", "input_text": "I need to hang a shelf"},
        expect=(200, 201, 503, 500),
    )
    sess_id = r.json().get("id") if r.status_code < 300 else None
    if sess_id:
        await call("ask.read", "GET", f"/ask-sessions/{sess_id}", tokB)
        await call(
            "ask.answer",
            "POST",
            f"/ask-sessions/{sess_id}/answer",
            tokB,
            json={"answer": "A wooden shelf, 1 meter"},
            expect=(200, 500, 503),
        )
        await call(
            "ask.draft",
            "POST",
            f"/ask-sessions/{sess_id}/draft",
            tokB,
            json={"audience": "han"},
            expect=(200, 500, 503),
        )
        await call(
            "ask.delete", "DELETE", f"/ask-sessions/{sess_id}", tokB, expect=(204,)
        )

    # ---------- AI helpers (need OpenAI) ----------
    ai_expect = (200, 500, 503, 429)
    await call(
        "ai.intro",
        "POST",
        "/ai/intro-cards",
        tokA,
        json={"skills": "fixing bikes", "language": "en"},
        expect=ai_expect,
    )
    await call(
        "ai.translate",
        "POST",
        "/ai/translations",
        tokA,
        json={"text": "hello", "target_language": "ja"},
        expect=ai_expect,
    )

    # ---------- account deletion (throwaway user C last) ----------
    await call("account.delete", "DELETE", "/users/me", tokC, expect=(204,))
    # circle leave (B)
    await call(
        "membership.leave",
        "DELETE",
        f"/users/me/memberships/{circle_id}",
        tokB,
        expect=(204,),
    )


if __name__ == "__main__":
    asyncio.run(main())
