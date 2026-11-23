from fastapi import APIRouter
from pydantic import BaseModel

from app.routes.dependencies import CurrentUserDep, DatabaseDep
from app.routes.exchanges.route import ExchangeModel, exchange_model
from app.routes.requests.route import RequestSummary
from app.services.home.service import home, unread_counts

router = APIRouter(prefix="/users/me", tags=["home"])


class UnreadCountsModel(BaseModel):
    notifications: int
    messages: int


class HomeModel(BaseModel):
    received_requests: list[RequestSummary]
    active_exchanges: list[ExchangeModel]
    due_soon: list[ExchangeModel]


@router.get("/home")
async def my_home(user: CurrentUserDep, database: DatabaseDep) -> HomeModel:
    view = await home(database, user)
    return HomeModel(
        received_requests=[
            RequestSummary.model_validate(request)
            for request, _ in view.received_requests
        ],
        active_exchanges=[
            exchange_model(exchange) for exchange in view.active_exchanges
        ],
        due_soon=[exchange_model(exchange) for exchange in view.due_soon],
    )


@router.get("/unread-counts")
async def my_unread_counts(
    user: CurrentUserDep, database: DatabaseDep
) -> UnreadCountsModel:
    counts = await unread_counts(database, user)
    return UnreadCountsModel(
        notifications=counts.notifications, messages=counts.messages
    )
