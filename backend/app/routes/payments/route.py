import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints

from app.routes.dependencies import ActorDep, DatabaseDep, SettingsDep
from app.routes.pagination import Page, PageQuery
from app.services.payments.service import (
    PaymentView,
    cancel_payment,
    get_payment,
    handle_stripe_webhook,
    list_my_payments,
    simulate_success,
    start_payment,
)

router = APIRouter(prefix="/payments", tags=["payments"])
webhooks_router = APIRouter(prefix="/webhooks", tags=["payments"])
me_router = APIRouter(prefix="/users/me/payments", tags=["payments"])

IdempotencyKey = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=8, max_length=200)
]
MAX_WEBHOOK_BYTES = 256 * 1024


class StartPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thank_you_id: uuid.UUID


class PaymentModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payer_user_id: uuid.UUID
    payee_user_id: uuid.UUID
    provider: str
    amount_minor: int
    currency: str
    status: str
    created_at: datetime


class PaymentDetail(PaymentModel):
    client_secret: str | None
    checkout_url: str | None


def payment_detail(view: PaymentView) -> PaymentDetail:
    return PaymentDetail(
        **PaymentModel.model_validate(view.payment).model_dump(),
        client_secret=view.client_secret,
        checkout_url=view.checkout_url,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_payment(
    body: StartPaymentBody,
    actor: ActorDep,
    database: DatabaseDep,
    response: Response,
    idempotency_key: Annotated[IdempotencyKey, Header(alias="Idempotency-Key")],
) -> PaymentDetail:
    view = await start_payment(database, actor, body.thank_you_id, idempotency_key)
    response.headers["Location"] = f"/payments/{view.payment.id}"
    return payment_detail(view)


@router.get("/{payment_id}")
async def read_payment(
    payment_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> PaymentDetail:
    return payment_detail(await get_payment(database, actor, payment_id))


@router.post("/{payment_id}/cancel")
async def cancel(
    payment_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> PaymentDetail:
    return payment_detail(await cancel_payment(database, actor, payment_id))


@router.post("/{payment_id}/simulate-success")
async def simulate(
    payment_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    settings: SettingsDep,
) -> PaymentDetail:
    return payment_detail(await simulate_success(database, settings, actor, payment_id))


@me_router.get("")
async def my_payments(
    query: Annotated[PageQuery, Query()],
    actor: ActorDep,
    database: DatabaseDep,
) -> Page[PaymentModel]:
    result = await list_my_payments(database, actor, query.page())
    return Page.build(result, PaymentModel)


@webhooks_router.post("/stripe")
async def stripe_webhook(
    request: Request,
    database: DatabaseDep,
    settings: SettingsDep,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, str]:
    payload = await request.body()
    if len(payload) > MAX_WEBHOOK_BYTES:
        return {"status": "ignored"}
    await handle_stripe_webhook(database, settings, payload, stripe_signature)
    return {"status": "received"}
