import uuid

from sqlalchemy import select

from app.database.connection import Database
from app.database.models import HelpRequest
from tests.integration.conftest import _settings, auth, join_circle, make_user

ALL_SCOPES = (
    "can_post_requests",
    "can_chat",
    "can_thank_and_pay",
    "can_view_activity",
    "can_manage_listings",
)


def scopes(*enabled: str) -> dict[str, bool]:
    return {name: name in enabled for name in ALL_SCOPES}


def acting(token: str, member_id: str) -> dict[str, str]:
    return {**auth(token), "X-Acting-For": member_id}


async def me_id(client, token: str) -> str:
    return (await client.get("/users/me", headers=auth(token))).json()["id"]


async def give_grant(
    client, member: str, member_id: str, caretaker_id: str, *enabled: str
) -> str:
    response = await client.post(
        "/proxy-grants",
        headers=auth(member),
        json={
            "member_user_id": member_id,
            "caretaker_user_id": caretaker_id,
            "caretaker_role": "family",
            "consent_method": "in_person",
            "scopes": scopes(*enabled),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def circle_in(client, leader: str, region: str, *members: str) -> str:
    response = await client.post(
        "/circles",
        headers=auth(leader),
        json={"name": f"Han {region}", "unit_type": "han", "region": region},
    )
    assert response.status_code == 201, response.text
    circle_id = response.json()["id"]
    for member in members:
        await join_circle(client, leader, circle_id, member)
    return circle_id


async def pair(client, *, member_region: str = "jp", caretaker_region: str = "jp"):
    member = await make_user(client, display_name="Amina", region=member_region)
    caretaker = await make_user(client, display_name="Rahim", region=caretaker_region)
    return {
        "member": member,
        "caretaker": caretaker,
        "member_id": await me_id(client, member),
        "caretaker_id": await me_id(client, caretaker),
    }


async def post_help(client, headers: dict[str, str], **extra):
    return await client.post(
        "/requests",
        headers=headers,
        json={"kind": "help", "raw_text": "Pick up medicine", "lang": "en", **extra},
    )


async def acted_by(request_id: str) -> uuid.UUID | None:
    database = Database(_settings())
    try:
        async with database.session() as session:
            return await session.scalar(
                select(HelpRequest.acted_by_user_id).where(
                    HelpRequest.id == uuid.UUID(request_id)
                )
            )
    finally:
        await database.close()
