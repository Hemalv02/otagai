import argparse
import asyncio
import os
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

import httpx2
from sqlalchemy.dialects.postgresql import insert

from app.database.connection import Database
from app.database.models import Category
from app.settings import Settings

DRILL_PHOTO = (
    Path(__file__).resolve().parents[2] / "mobile/assets/images/onboarding-drill.jpg"
)
DEMO_DOMAIN = "example.com"


class SeedError(Exception):
    pass


@dataclass(frozen=True)
class SeedConfig:
    api_url: str
    supabase_url: str
    namespace: str
    password: str = field(repr=False)
    service_role: str = field(repr=False)

    @classmethod
    def from_environment(cls) -> "SeedConfig":
        keys = (
            "OTAGAI_DEMO_API_URL",
            "OTAGAI_DEMO_SUPABASE_URL",
            "OTAGAI_DEMO_NAMESPACE",
            "OTAGAI_DEMO_PASSWORD",
            "SUPABASE_SERVICE_ROLE_KEY",
        )
        missing = [key for key in keys if not os.environ.get(key)]
        if missing:
            raise SeedError(f"Set {', '.join(missing)}.")
        api_url, supabase_url, namespace, password, service_role = (
            os.environ[key] for key in keys
        )
        for key, value in zip(keys[:2], (api_url, supabase_url), strict=True):
            url = urlsplit(value)
            local = url.hostname in {"localhost", "127.0.0.1", "::1"}
            if (
                (url.scheme != "https" and not (local and url.scheme == "http"))
                or not url.hostname
                or url.username
                or url.path not in ("", "/")
                or url.query
                or url.fragment
            ):
                raise SeedError(f"Set {key} to an HTTPS origin or a local HTTP origin.")
        if not re.fullmatch(r"[a-z][a-z0-9-]{2,23}", namespace):
            raise SeedError("Use a 3–24 character lowercase demo namespace.")
        if len(password) < 12:
            raise SeedError("Use a demo password of at least 12 characters.")
        return cls(api_url, supabase_url, namespace, password, service_role)

    def email(self, account: str) -> str:
        return f"otagai-demo-{self.namespace}-{account}@{DEMO_DOMAIN}"


@dataclass(frozen=True)
class Member:
    id: str
    token: str = field(repr=False)


class DemoSeed:
    def __init__(
        self, config: SeedConfig, auth: httpx2.AsyncClient, api: httpx2.AsyncClient
    ):
        self.config = config
        self.auth = auth
        self.api = api

    async def sign_in(self, email: str) -> dict | None:
        response = await self.auth.post(
            "/auth/v1/token",
            params={"grant_type": "password"},
            json={"email": email, "password": self.config.password},
        )
        if (
            response.status_code == 400
            and response.json().get("error_code") == "invalid_credentials"
        ):
            return None
        if response.status_code != 200:
            raise SeedError(
                f"Supabase sign-in failed for {email} ({response.status_code})."
            )
        return response.json()

    async def call(
        self,
        member: Member,
        method: str,
        path: str,
        *,
        acting_for: str | None = None,
        missing_ok: bool = False,
        **kwargs,
    ) -> dict | None:
        headers = {"Authorization": f"Bearer {member.token}"}
        if acting_for:
            headers["X-Acting-For"] = acting_for
        response = await self.api.request(method, path, headers=headers, **kwargs)
        if missing_ok and response.status_code == 404:
            return None
        if not response.is_success:
            raise SeedError(f"Otagai {method} {path} failed ({response.status_code}).")
        return response.json()

    async def items(
        self, member: Member, path: str, *, acting_for: str | None = None, **filters
    ):
        params = {"limit": 50, **filters}
        while True:
            data = await self.call(
                member, "GET", path, acting_for=acting_for, params=params
            )
            for item in data["items"]:
                yield item
            if not data.get("next_cursor"):
                return
            params["cursor"] = data["next_cursor"]

    async def member(self, account: str, profile: dict, **attributes) -> Member:
        email = self.config.email(account)
        identity = await self.sign_in(email)
        if identity is None:
            created = await self.auth.post(
                "/auth/v1/admin/users",
                json={
                    "email": email,
                    "password": self.config.password,
                    "email_confirm": True,
                    "app_metadata": {"otagai_demo_namespace": self.config.namespace},
                },
            )
            if created.status_code not in (200, 201):
                raise SeedError(
                    f"Supabase could not create {email} ({created.status_code}). "
                    "Use the original namespace password for a previous seed."
                )
            identity = await self.sign_in(email)
        if (
            identity is None
            or identity["user"]["app_metadata"].get("otagai_demo_namespace")
            != self.config.namespace
        ):
            raise SeedError(f"The Auth account {email} does not belong to this demo.")
        member = Member("", identity["access_token"])
        existing = await self.call(member, "GET", "/users/me", missing_ok=True)
        if existing is None:
            existing = await self.call(member, "POST", "/users", json=profile)
            if attributes:
                await self.call(member, "PATCH", "/users/me", json=attributes)
        return Member(existing["id"], member.token)

    async def membership(
        self, member: Member, circle_id: str, *, managed: str | None = None
    ):
        path = (
            f"/managed-users/{managed}/memberships"
            if managed
            else "/users/me/memberships"
        )
        async for item in self.items(member, path):
            if item["circle_id"] == circle_id:
                return item
        return None

    async def circle(
        self, leader: Member, name: str, unit: str, region: str, **details
    ) -> str:
        name = f"{name} · {self.config.namespace}"
        async for membership in self.items(leader, "/users/me/memberships"):
            if membership.get("circle") and membership["circle"]["name"] == name:
                circle = await self.call(
                    leader, "GET", f"/circles/{membership['circle_id']}"
                )
                if (
                    circle["my_role"] != "leader"
                    or circle["my_status"] != "approved"
                    or circle["status"] != "active"
                    or circle["region"] != region
                    or circle["unit_type"] != unit
                    or circle["parent_id"] != details.get("parent_id")
                ):
                    raise SeedError(f"Existing circle {name} does not match this demo.")
                return circle["id"]
        circle = await self.call(
            leader,
            "POST",
            "/circles",
            json={"name": name, "region": region, "unit_type": unit, **details},
        )
        return circle["id"]

    async def join(
        self,
        member: Member,
        leader: Member,
        circle_id: str,
        *,
        managed: str | None = None,
    ) -> None:
        membership = await self.membership(member, circle_id, managed=managed)
        if membership is None:
            invite = await self.call(
                leader,
                "POST",
                f"/circles/{circle_id}/invites",
                json={"auto_approve": managed is None, "max_uses": 1},
            )
            path = (
                f"/managed-users/{managed}/memberships"
                if managed
                else "/users/me/memberships"
            )
            membership = await self.call(
                member, "POST", path, json={"invite_code": invite["code"]}
            )
        if membership["status"] == "pending":
            await self.call(
                leader,
                "POST",
                f"/circles/{circle_id}/memberships/{managed or member.id}/approve",
            )
        elif membership["status"] != "approved":
            raise SeedError("An existing demo circle membership was changed.")

    async def managed_member(self, caretaker: Member) -> str:
        name = "আমিনা রহমান"
        grants = await self.call(caretaker, "GET", "/users/me/proxy-grants")
        for grant in grants["items"]:
            other = grant.get("other")
            if other and other["kind"] == "managed" and other["display_name"] == name:
                if not all(
                    grant[field]
                    for field in (
                        "can_post_requests",
                        "can_chat",
                        "can_view_activity",
                        "can_thank_and_pay",
                    )
                ):
                    raise SeedError("Amina's existing permissions were changed.")
                return grant["member_user_id"]
        result = await self.call(
            caretaker,
            "POST",
            "/managed-users",
            json={
                "display_name": name,
                "preferred_language": "bn",
                "region": "bd",
                "age_band": "70s",
                "grant": {
                    "caretaker_role": "family",
                    "consent_method": "in_person",
                    "scopes": {
                        "can_post_requests": True,
                        "can_chat": True,
                        "can_view_activity": True,
                        "can_thank_and_pay": True,
                        "can_manage_listings": False,
                    },
                },
            },
        )
        return result["user"]["id"]

    async def category(self, member: Member, kind: str) -> str:
        data = await self.call(member, "GET", "/categories", params={"kind": kind})
        category = usable_category(data["items"])
        if category is None:
            await insert_reference_category(kind)
            data = await self.call(member, "GET", "/categories", params={"kind": kind})
            category = usable_category(data["items"])
        if category is None:
            raise SeedError(
                f"The Otagai API could not find the reference {kind} category."
            )
        return category["id"]

    async def listing(
        self, member: Member, *, title: str, kind: str, photo=False, **fields
    ) -> str:
        async for item in self.items(member, "/users/me/listings"):
            if item["title"] == title and item["kind"] == kind:
                return item["id"]
        category_id = await self.category(member, kind)
        media_ids = []
        if photo:
            with DRILL_PHOTO.open("rb") as image:
                media = await self.call(
                    member,
                    "POST",
                    "/media",
                    data={"purpose": "listing"},
                    files={"file": (DRILL_PHOTO.name, image, "image/jpeg")},
                )
            media_ids.append(media["id"])
        listing = await self.call(
            member,
            "POST",
            "/listings",
            json={
                "title": title,
                "kind": kind,
                "category_id": category_id,
                "media_ids": media_ids,
                "visibility": "han",
                **fields,
            },
        )
        return listing["id"]

    async def request_help(
        self,
        member: Member,
        circle_id: str,
        body: str,
        language: str,
        *,
        acting_for: str | None = None,
    ) -> str:
        async for item in self.items(
            member, "/users/me/requests", acting_for=acting_for
        ):
            if item["polite_text"] == body:
                return item["id"]
        request = await self.call(
            member,
            "POST",
            "/requests",
            acting_for=acting_for,
            json={
                "kind": "help",
                "raw_text": body,
                "lang": language,
                "home_circle_id": circle_id,
                "ripple_max_stage": "han",
            },
        )
        return request["id"]

    async def complete_help(
        self, requester: Member, request_id: str, helper: Member
    ) -> str:
        request = await self.call(requester, "GET", f"/requests/{request_id}")
        exchange_id = request["exchange_id"]
        if not exchange_id:
            if request["status"] != "open":
                raise SeedError(
                    "The demo help request was changed before it could be completed."
                )
            responses = f"/requests/{request_id}/responses"
            candidates = self.items(requester, responses)
            offer = await anext(
                (
                    item
                    async for item in candidates
                    if item["responder_user_id"] == helper.id
                    and item["kind"] == "offer"
                ),
                None,
            )
            if offer is None:
                offer = await self.call(
                    helper,
                    "POST",
                    responses,
                    json={
                        "kind": "offer",
                        "message": "お手伝いできます。",
                        "lang": "ja",
                    },
                )
            await self.call(requester, "POST", f"{responses}/{offer['id']}/accept")
            request = await self.call(requester, "GET", f"/requests/{request_id}")
            exchange_id = request["exchange_id"]
        path = f"/exchanges/{exchange_id}"
        exchange = await self.call(requester, "GET", path)
        if exchange["helper_user_id"] != helper.id:
            raise SeedError("The demo help request has a different helper.")
        if exchange["status"] == "scheduled":
            exchange = await self.call(helper, "POST", f"{path}/hand-over")
        if exchange["status"] in ("active", "returned"):
            await self.call(requester, "POST", f"{path}/confirm")
            exchange = await self.call(helper, "POST", f"{path}/confirm")
        if exchange["status"] != "completed":
            raise SeedError("The demo help exchange could not be completed.")
        return exchange_id

    async def thank_you(
        self, requester: Member, helper: Member, exchange_id: str
    ) -> None:
        notes = self.items(requester, "/users/me/thank-yous", direction="sent")
        note = await anext(
            (item async for item in notes if item["exchange_id"] == exchange_id), None
        )
        if note is None:
            note = await self.call(
                requester,
                "POST",
                "/thank-yous",
                json={
                    "exchange_id": exchange_id,
                    "gift_type": "note",
                    "lang": "ja",
                    "note": "棚を運ぶのを手伝ってくださり、ありがとうございました。とても助かりました。",
                    "allow_wall_sharing": True,
                },
            )
            if note["to_user_id"] != helper.id or note["exchange_id"] != exchange_id:
                raise SeedError("The demo thank-you has a different recipient.")
            await self.call(
                helper,
                "PATCH",
                f"/thank-yous/{note['id']}",
                json={"show_on_wall": True},
            )

    async def seed_chat(
        self, requester: Member, helper: Member, request_id: str
    ) -> str:
        conversations = self.items(requester, "/users/me/conversations")
        chat = await anext(
            (item async for item in conversations if item["request_id"] == request_id),
            None,
        )
        if chat is None:
            raise SeedError("The completed demo request has no conversation.")
        path = f"/conversations/{chat['id']}/messages"
        for index, (sender, message) in enumerate(
            (
                (
                    requester,
                    "玄関にある小さな棚です。持ち上げるときに片側をお願いできますか？",
                ),
                (helper, "অবশ্যই, আমি বিকেলে এসে তাকের এক পাশ ধরব।"),
            )
        ):
            message_id = str(
                uuid.uuid5(uuid.NAMESPACE_URL, f"otagai-demo/{chat['id']}/{index}")
            )
            await self.call(
                sender,
                "POST",
                path,
                json={"kind": "text", "body": message, "client_message_id": message_id},
            )
        return chat["id"]


def usable_category(categories: list[dict]) -> dict | None:
    for item in categories:
        if not item["is_risky"]:
            return item
        child = usable_category(item["children"])
        if child is not None:
            return child
    return None


async def insert_reference_category(kind: str) -> None:
    names = {
        "tool": {"en": "Hand tools", "ja": "手工具", "bn": "হাতের সরঞ্জাম"},
        "skill": {"en": "Practical help", "ja": "暮らしの手助け", "bn": "দৈনন্দিন সাহায্য"},
    }
    slug = {"tool": "hand_tools", "skill": "practical_help"}[kind]
    if not os.environ.get("DATABASE_HOST") or not os.environ.get("POSTGRES_PASSWORD"):
        raise SeedError(
            "Set the demo database connection variables to create reference categories."
        )
    database = Database(Settings(_env_file=None))
    try:
        async with database.session() as session:
            await session.execute(
                insert(Category)
                .values(
                    kind=kind,
                    slug=slug,
                    names=names[kind],
                    is_risky=False,
                    sort_order=0,
                )
                .on_conflict_do_nothing(index_elements=[Category.slug])
            )
    finally:
        await database.close()


async def seed(config: SeedConfig) -> None:
    async with (
        httpx2.AsyncClient(
            base_url=config.supabase_url,
            headers={
                "apikey": config.service_role,
                "Authorization": f"Bearer {config.service_role}",
            },
            timeout=30,
        ) as auth,
        httpx2.AsyncClient(base_url=config.api_url, timeout=30) as api,
    ):
        demo = DemoSeed(config, auth, api)
        tanaka = await demo.member(
            "tanaka",
            {
                "display_name": "田中 和子",
                "preferred_language": "ja",
                "region": "jp",
                "age_band": "70s",
                "intro": "長崎で花や野菜を育てています。",
                "profile_details_visible": True,
                "happy_to_help_with": "苗の育て方やベランダ菜園",
            },
            simple_mode=True,
            hobbies="ベランダ菜園",
        )
        rahim = await demo.member(
            "rahim",
            {
                "display_name": "Rahim Ahmed",
                "preferred_language": "bn",
                "region": "jp",
                "languages": ["bn", "ja", "en"],
                "intro": "長崎で近所のDIYを手伝っています。",
                "profile_details_visible": True,
                "happy_to_help_with": "家具の組み立てと棚の取り付け",
            },
            hobbies="DIYと木工",
        )
        local = await demo.member(
            "cumilla-helper",
            {
                "display_name": "নুসরাত আক্তার",
                "preferred_language": "bn",
                "region": "bd",
                "intro": "কুমিল্লায় থাকি। প্রতিবেশীদের বাজার আর ছোটখাটো কাজে সাহায্য করি।",
            },
        )
        association = await demo.circle(
            tanaka,
            "長崎・港町自治会",
            "association",
            "jp",
            approx_lat=32.7448,
            approx_lng=129.8737,
        )
        han = await demo.circle(
            tanaka,
            "長崎・港町３班",
            "han",
            "jp",
            parent_id=association,
            approx_lat=32.7448,
            approx_lng=129.8737,
        )
        await demo.join(rahim, tanaka, han)
        building = await demo.circle(
            local,
            "কুমিল্লা · শাপলা ভবন",
            "building",
            "bd",
            approx_lat=23.4607,
            approx_lng=91.1809,
        )
        amina = await demo.managed_member(rahim)
        await demo.join(rahim, local, building, managed=amina)
        drill = await demo.listing(
            rahim,
            title="コードレスドリル",
            kind="tool",
            photo=True,
            description="棚の取り付けと軽い木工作業に使える充電式ドリルです。",
            safety_notes="保護メガネを着用し、壁に穴を開ける前に配線を確認してください。",
            lang="ja",
            lend_mode="lend_or_help",
            max_loan_days=3,
            parts=[
                {"label": "バッテリー", "quantity": 1},
                {"label": "ビットケース", "quantity": 1},
            ],
        )
        await demo.listing(
            rahim,
            title="棚の取り付け・家具の組み立て",
            kind="skill",
            description="家具の組み立てや、棚の水平を取る作業をお手伝いできます。",
            lang="ja",
            lend_mode="help_only",
        )
        await demo.listing(
            local,
            title="বাজার ও ছোটখাটো কাজে সাহায্য",
            kind="skill",
            description="সাপ্তাহিক বাজার বা ভারী ব্যাগ বহন করতে সাহায্য করতে পারি।",
            lang="bn",
            lend_mode="help_only",
        )
        completed = await demo.request_help(
            tanaka,
            han,
            "玄関にある小さな棚を移動するのを手伝っていただけませんか。",
            "ja",
        )
        exchange = await demo.complete_help(tanaka, completed, rahim)
        await demo.thank_you(tanaka, rahim, exchange)
        chat = await demo.seed_chat(tanaka, rahim, completed)
        await demo.request_help(
            rahim, han, "週末にベランダの鉢植えに水をやっていただけませんか。", "ja"
        )
        await demo.request_help(
            rahim,
            building,
            "কেউ কি বাজারের ব্যাগগুলো সিঁড়ি দিয়ে ওপরে নিতে সাহায্য করবেন?",
            "bn",
            acting_for=amina,
        )
        await demo.request_help(
            local,
            building,
            "কমিউনিটি ঘরের চেয়ারগুলো সাজাতে কারও একটু সময় হবে?",
            "bn",
        )
    print(f"Seeded demo namespace {config.namespace}")
    print(f"Tanaka  {config.email('tanaka')}")
    print(f"Rahim   {config.email('rahim')}")
    print(f"Nusrat  {config.email('cumilla-helper')}")
    print(f"Nagasaki Han {han} · Cumilla building {building}")
    print(
        f"Drill {drill} · Completed exchange {exchange} · Translation conversation {chat}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed a dedicated Otagai hackathon demo."
    )
    parser.add_argument(
        "--check-config",
        action="store_true",
        help="Validate settings without connecting.",
    )
    args = parser.parse_args()
    try:
        config = SeedConfig.from_environment()
        if args.check_config:
            print(f"Demo configuration is valid for namespace {config.namespace}.")
        else:
            asyncio.run(seed(config))
    except SeedError as error:
        parser.exit(1, f"{error}\n")
    except httpx2.RequestError as error:
        parser.exit(1, f"Could not reach a demo service ({type(error).__name__}).\n")


if __name__ == "__main__":
    main()
