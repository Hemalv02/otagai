import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass

from sqlalchemy import select

from app.database.connection import Database
from app.database.models import Payment, ThankYou
from app.database.models.enums import (
    Currency,
    GiftType,
    MoneyStatus,
    NotificationType,
    PaymentProvider,
    PaymentStatus,
)
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.payments import (
    DuplicateIdempotencyError,
    PaymentEventRepository,
    PaymentRepository,
)
from app.repositories.thanks import ThankYouRepository
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    ServiceConfigurationError,
)
from app.settings import Settings

WEBHOOK_TOLERANCE_SECONDS = 5 * 60
CURRENCY_PROVIDER = {
    Currency.JPY.value: PaymentProvider.STRIPE.value,
    Currency.BDT.value: PaymentProvider.BKASH_MOCK.value,
}
MOCK_PROVIDERS = frozenset(
    {PaymentProvider.BKASH_MOCK.value, PaymentProvider.NAGAD_MOCK.value}
)


class PaymentNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Payment not found.")


class IdempotencyConflictError(ConflictError):
    def __init__(self) -> None:
        super().__init__("This idempotency key was used for a different payment.")


class PaymentStateError(ConflictError):
    pass


@dataclass(frozen=True)
class PaymentView:
    payment: Payment
    client_secret: str | None
    checkout_url: str | None


def _client_secret(payment: Payment) -> str | None:
    if payment.provider == PaymentProvider.STRIPE.value:
        return f"pi_mock_{payment.id}_secret"
    return None


def _checkout_url(payment: Payment) -> str | None:
    if payment.provider in MOCK_PROVIDERS:
        return f"/payments/{payment.id}/mock-checkout"
    return None


def _view(payment: Payment) -> PaymentView:
    return PaymentView(
        payment=payment,
        client_secret=_client_secret(payment),
        checkout_url=_checkout_url(payment),
    )


async def start_payment(
    database: Database,
    actor: Actor,
    thank_you_id: uuid.UUID,
    idempotency_key: str,
) -> PaymentView:
    actor.require(ProxyScope.THANK_AND_PAY)
    async with database.session() as session:
        payments = PaymentRepository(session)
        existing = await payments.get_by_idempotency_key(idempotency_key)
        thanks = ThankYouRepository(session)
        thank_you = await thanks.get_for_update(thank_you_id)
        if thank_you is None or thank_you.from_user_id != actor.subject_id:
            raise PaymentNotFoundError
        if existing is not None:
            if (
                existing.payer_user_id != actor.subject_id
                or thank_you.payment_id != existing.id
            ):
                raise IdempotencyConflictError
            return _view(existing)
        if thank_you.gift_type != GiftType.MONEY.value:
            raise BadRequestError("This thank-you has no money to pay.")
        if thank_you.money_status not in (
            MoneyStatus.OFFERED.value,
            MoneyStatus.FAILED.value,
        ):
            raise PaymentStateError("This money offer can't be paid now.")
        provider = CURRENCY_PROVIDER.get(
            thank_you.currency, PaymentProvider.STRIPE.value
        )
        values = {
            "payer_user_id": thank_you.from_user_id,
            "payee_user_id": thank_you.to_user_id,
            "acted_by_user_id": actor.user.id,
            "provider": provider,
            "provider_payment_id": f"mock_{uuid.uuid4().hex}",
            "amount_minor": thank_you.amount_minor,
            "currency": thank_you.currency,
            "status": PaymentStatus.REQUIRES_PAYMENT.value,
            "idempotency_key": idempotency_key,
        }
        try:
            payment = await payments.create(values)
        except DuplicateIdempotencyError as error:
            raise IdempotencyConflictError from error
        await thanks.update(thank_you, {"payment_id": payment.id})
        return _view(payment)


async def get_payment(
    database: Database, actor: Actor, payment_id: uuid.UUID
) -> PaymentView:
    async with database.session() as session:
        payment = await PaymentRepository(session).get(payment_id)
        if payment is None or actor.subject_id not in (
            payment.payer_user_id,
            payment.payee_user_id,
        ):
            raise PaymentNotFoundError
        return _view(payment)


async def cancel_payment(
    database: Database, actor: Actor, payment_id: uuid.UUID
) -> PaymentView:
    async with database.session() as session:
        payments = PaymentRepository(session)
        payment = await payments.get_for_update(payment_id)
        if payment is None or payment.payer_user_id != actor.subject_id:
            raise PaymentNotFoundError
        if payment.status == PaymentStatus.CANCELLED.value:
            return _view(payment)
        if payment.status == PaymentStatus.SUCCEEDED.value:
            raise PaymentStateError("This payment has already succeeded.")
        updated = await payments.update(
            payment, {"status": PaymentStatus.CANCELLED.value}
        )
        return _view(updated)


async def simulate_success(
    database: Database,
    settings: Settings,
    actor: Actor,
    payment_id: uuid.UUID,
) -> PaymentView:
    if not settings.demo_payments_enabled:
        raise PaymentNotFoundError
    async with database.session() as session:
        payments = PaymentRepository(session)
        payment = await payments.get_for_update(payment_id)
        if payment is None or actor.subject_id not in (
            payment.payer_user_id,
            payment.payee_user_id,
        ):
            raise PaymentNotFoundError
        if payment.provider not in MOCK_PROVIDERS:
            raise PaymentStateError("This payment can't be simulated.")
        updated = await _mark_succeeded(session, payment)
        return _view(updated)


async def _mark_succeeded(session, payment: Payment) -> Payment:
    payments = PaymentRepository(session)
    if payment.status == PaymentStatus.SUCCEEDED.value:
        return payment
    updated = await payments.update(payment, {"status": PaymentStatus.SUCCEEDED.value})
    thanks = ThankYouRepository(session)
    linked = await session.scalar(
        select(ThankYou).where(ThankYou.payment_id == payment.id).with_for_update()
    )
    if linked is not None:
        await thanks.update(linked, {"money_status": MoneyStatus.PAID.value})
    await NotificationRepository(session).create(
        payment.payee_user_id,
        NotificationType.THANK_YOU.value,
        {"payment_id": str(payment.id)},
    )
    return updated


async def list_my_payments(
    database: Database, actor: Actor, page: PageRequest
) -> PageResult[Payment]:
    async with database.session() as session:
        return await PaymentRepository(session).list_for_user(actor.subject_id, page)


def _verify_stripe_signature(
    settings: Settings, payload: bytes, signature_header: str
) -> None:
    if not settings.stripe_webhook_secret:
        raise ServiceConfigurationError("Stripe webhooks are not configured.")
    parts = dict(
        item.split("=", 1) for item in signature_header.split(",") if "=" in item
    )
    timestamp = parts.get("t")
    provided = parts.get("v1")
    if timestamp is None or provided is None:
        raise BadRequestError("The webhook signature is malformed.")
    try:
        age = abs(time.time() - int(timestamp))
    except ValueError as error:
        raise BadRequestError("The webhook signature is malformed.") from error
    if age > WEBHOOK_TOLERANCE_SECONDS:
        raise BadRequestError("The webhook signature has expired.")
    secret = settings.stripe_webhook_secret.get_secret_value().encode()
    expected = hmac.new(
        secret, f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, provided):
        raise BadRequestError("The webhook signature is invalid.")


async def handle_stripe_webhook(
    database: Database,
    settings: Settings,
    payload: bytes,
    signature_header: str | None,
) -> None:
    if signature_header is None:
        raise BadRequestError("The webhook signature is missing.")
    _verify_stripe_signature(settings, payload, signature_header)
    try:
        event = json.loads(payload)
    except json.JSONDecodeError as error:
        raise BadRequestError("The webhook body is not valid JSON.") from error
    event_id = event.get("id")
    event_type = event.get("type")
    if not isinstance(event_id, str) or not isinstance(event_type, str):
        raise BadRequestError("The webhook event is incomplete.")
    async with database.session() as session:
        fresh = await PaymentEventRepository(session).record(
            PaymentProvider.STRIPE.value, event_id, event_type, event
        )
        if not fresh or event_type != "payment_intent.succeeded":
            return
        intent = event.get("data", {}).get("object", {})
        provider_payment_id = intent.get("id")
        if not isinstance(provider_payment_id, str):
            return
        payment = await PaymentRepository(session).get_by_provider_id(
            PaymentProvider.STRIPE.value, provider_payment_id
        )
        if payment is not None:
            locked = await PaymentRepository(session).get_for_update(payment.id)
            await _mark_succeeded(session, locked)
