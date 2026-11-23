import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.database.models import AskSession
from app.database.models.enums import AskInputMode
from app.routes.dependencies import (
    ActorDep,
    DatabaseDep,
    RedisDep,
    SettingsDep,
    StorageDep,
)
from app.routes.listings.route import ListingSummary, listing_summary
from app.routes.relationships.route import UserSummary
from app.services.ai.request_writer import RequestDraft
from app.services.ask_sessions.service import (
    AskResult,
    abandon_ask_session,
    answer_ask_session,
    create_ask_session,
    draft_ask_message,
    get_ask_session,
)

router = APIRouter(prefix="/ask-sessions", tags=["ask"])

InputText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]
AnswerText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
]


class CreateAskBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_mode: AskInputMode = AskInputMode.TEXT
    input_text: InputText | None = None
    media_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def check_input(self) -> "CreateAskBody":
        if self.input_mode is AskInputMode.TEXT and not self.input_text:
            raise ValueError("Text input needs input_text.")
        if self.input_mode is not AskInputMode.TEXT and self.media_id is None:
            raise ValueError("Voice and photo input need a media_id.")
        return self


class AnswerBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: AnswerText


class DraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audience: Literal["person", "han", "ripple"] = "han"


class AskSessionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    input_mode: str
    status: str
    clarifying_question: str | None
    clarifying_answer: str | None
    identified: list[dict[str, Any]]
    created_at: datetime


class AskResultModel(BaseModel):
    session: AskSessionModel
    matches: list[ListingSummary]
    neighbours: list[UserSummary]


def ask_model(ask: AskSession) -> AskSessionModel:
    return AskSessionModel.model_validate(ask)


def ask_result(result: AskResult) -> AskResultModel:
    return AskResultModel(
        session=ask_model(result.session),
        matches=[listing_summary(card) for card in result.matches],
        neighbours=[UserSummary.model_validate(user) for user in result.neighbours],
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def start_ask(
    body: CreateAskBody,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
    redis: RedisDep,
    response: Response,
) -> AskSessionModel:
    ask = await create_ask_session(
        database,
        redis,
        storage,
        settings,
        actor,
        input_mode=body.input_mode.value,
        input_text=body.input_text,
        media_id=body.media_id,
    )
    response.headers["Location"] = f"/ask-sessions/{ask.id}"
    return ask_model(ask)


@router.get("/{session_id}")
async def read_ask(
    session_id: uuid.UUID,
    actor: ActorDep,
    database: DatabaseDep,
    storage: StorageDep,
    settings: SettingsDep,
) -> AskResultModel:
    return ask_result(
        await get_ask_session(database, storage, settings, actor, session_id)
    )


@router.post("/{session_id}/answer")
async def answer_ask(
    session_id: uuid.UUID,
    body: AnswerBody,
    actor: ActorDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> AskSessionModel:
    return ask_model(
        await answer_ask_session(
            database, redis, settings, actor, session_id, body.answer
        )
    )


@router.post("/{session_id}/draft")
async def draft_ask(
    session_id: uuid.UUID,
    body: DraftBody,
    actor: ActorDep,
    database: DatabaseDep,
    settings: SettingsDep,
    redis: RedisDep,
) -> RequestDraft:
    return await draft_ask_message(
        database, redis, settings, actor, session_id, body.audience
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ask(
    session_id: uuid.UUID, actor: ActorDep, database: DatabaseDep
) -> None:
    await abandon_ask_session(database, actor, session_id)
