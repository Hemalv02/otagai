import uuid
from dataclasses import dataclass

from app.database.connection import Database
from app.database.models import ThankYou
from app.database.models.enums import (
    ExchangeStatus,
    GiftType,
    MoneyStatus,
    NotificationType,
    PointsReason,
)
from app.repositories.circles import MembershipRepository
from app.repositories.exchanges import ExchangeRepository
from app.repositories.notifications import NotificationRepository
from app.repositories.pagination import PageRequest, PageResult
from app.repositories.thanks import (
    DuplicateThankYouError,
    PointsRepository,
    ThankYouRepository,
)
from app.services.actors.service import Actor, ProxyScope
from app.services.errors import BadRequestError, ConflictError, NotFoundError


class ThankYouNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Thank-you not found.")


class ExchangeNotCompletedError(ConflictError):
    def __init__(self) -> None:
        super().__init__("You can thank someone once the exchange is complete.")


class ThankYouExistsError(ConflictError):
    def __init__(self) -> None:
        super().__init__("You already sent a thank-you for this exchange.")


class MoneyStateError(ConflictError):
    def __init__(self) -> None:
        super().__init__("There is no money offer to change here.")


@dataclass(frozen=True)
class NewThankYou:
    exchange_id: uuid.UUID
    gift_type: str
    note: str | None
    lang: str | None
    amount_minor: int | None
    currency: str | None
    points_amount: int | None
    ai_drafted: bool


async def create_thank_you(
    database: Database, actor: Actor, new_thank_you: NewThankYou
) -> ThankYou:
    actor.require(ProxyScope.THANK_AND_PAY)
    sender = actor.subject_id
    async with database.session() as session:
        exchange = await ExchangeRepository(session).get(new_thank_you.exchange_id)
        if exchange is None or sender not in (
            exchange.requester_user_id,
            exchange.helper_user_id,
        ):
            raise ThankYouNotFoundError
        if exchange.status != ExchangeStatus.COMPLETED.value:
            raise ExchangeNotCompletedError
        recipient = (
            exchange.helper_user_id
            if sender == exchange.requester_user_id
            else exchange.requester_user_id
        )
        money_status = (
            MoneyStatus.OFFERED.value
            if new_thank_you.gift_type == GiftType.MONEY.value
            else MoneyStatus.NONE.value
        )
        values = {
            "exchange_id": new_thank_you.exchange_id,
            "from_user_id": sender,
            "to_user_id": recipient,
            "acted_by_user_id": actor.user.id,
            "note": new_thank_you.note,
            "lang": new_thank_you.lang,
            "ai_drafted": new_thank_you.ai_drafted,
            "gift_type": new_thank_you.gift_type,
            "points_amount": new_thank_you.points_amount,
            "amount_minor": new_thank_you.amount_minor,
            "currency": new_thank_you.currency,
            "money_status": money_status,
        }
        try:
            thank_you = await ThankYouRepository(session).create(values)
        except DuplicateThankYouError as error:
            raise ThankYouExistsError from error
        if new_thank_you.gift_type == GiftType.POINTS.value:
            await PointsRepository(session).add_entry(
                recipient,
                new_thank_you.points_amount,
                PointsReason.THANK_YOU.value,
                thank_you.id,
            )
        await NotificationRepository(session).create(
            recipient,
            NotificationType.THANK_YOU.value,
            {"thank_you_id": str(thank_you.id)},
        )
        return thank_you


async def get_thank_you(
    database: Database, actor: Actor, thank_you_id: uuid.UUID
) -> ThankYou:
    async with database.session() as session:
        thank_you = await ThankYouRepository(session).get(thank_you_id)
        if thank_you is None:
            raise ThankYouNotFoundError
        if (
            actor.subject_id
            not in (
                thank_you.from_user_id,
                thank_you.to_user_id,
            )
            and not thank_you.show_on_wall
        ):
            raise ThankYouNotFoundError
        return thank_you


async def set_wall_visibility(
    database: Database, actor: Actor, thank_you_id: uuid.UUID, show_on_wall: bool
) -> ThankYou:
    async with database.session() as session:
        repository = ThankYouRepository(session)
        thank_you = await repository.get_for_update(thank_you_id)
        if thank_you is None or thank_you.to_user_id != actor.subject_id:
            raise ThankYouNotFoundError
        return await repository.update(thank_you, {"show_on_wall": show_on_wall})


async def decline_money(
    database: Database, actor: Actor, thank_you_id: uuid.UUID
) -> ThankYou:
    actor.require(ProxyScope.THANK_AND_PAY)
    async with database.session() as session:
        repository = ThankYouRepository(session)
        thank_you = await repository.get_for_update(thank_you_id)
        if thank_you is None or thank_you.to_user_id != actor.subject_id:
            raise ThankYouNotFoundError
        if thank_you.money_status == MoneyStatus.DECLINED.value:
            return thank_you
        if thank_you.money_status != MoneyStatus.OFFERED.value:
            raise MoneyStateError
        return await repository.update(
            thank_you, {"money_status": MoneyStatus.DECLINED.value}
        )


async def list_my_thank_yous(
    database: Database, actor: Actor, direction: str, page: PageRequest
) -> PageResult[ThankYou]:
    async with database.session() as session:
        return await ThankYouRepository(session).list_for_user(
            actor.subject_id, direction=direction, page=page
        )


async def list_circle_wall(
    database: Database, actor: Actor, circle_id: uuid.UUID, page: PageRequest
) -> PageResult[ThankYou]:
    async with database.session() as session:
        if not await MembershipRepository(session).is_approved_member(
            circle_id, actor.subject_id
        ):
            raise ThankYouNotFoundError
        return await ThankYouRepository(session).list_circle_wall(circle_id, page)


async def points_balance(database: Database, actor: Actor) -> int:
    async with database.session() as session:
        return await PointsRepository(session).balance(actor.subject_id)


async def list_points_entries(database: Database, actor: Actor, page: PageRequest):
    async with database.session() as session:
        return await PointsRepository(session).list_entries(actor.subject_id, page)


def validate_gift(
    gift_type: str,
    amount_minor: int | None,
    currency: str | None,
    points_amount: int | None,
) -> None:
    if gift_type == GiftType.MONEY.value and (amount_minor is None or currency is None):
        raise BadRequestError("A money thank-you needs an amount and currency.")
    if gift_type == GiftType.POINTS.value and points_amount is None:
        raise BadRequestError("A points thank-you needs a points amount.")
    if gift_type != GiftType.MONEY.value and (
        amount_minor is not None or currency is not None
    ):
        raise BadRequestError("Only a money thank-you carries an amount.")
    if gift_type != GiftType.POINTS.value and points_amount is not None:
        raise BadRequestError("Only a points thank-you carries points.")
