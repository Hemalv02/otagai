from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.repositories.pagination import (
    DEFAULT_PAGE_SIZE,
    MAX_CURSOR_LENGTH,
    MAX_PAGE_SIZE,
    PageRequest,
    PageResult,
)


class PageQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    cursor: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)

    def page(self) -> PageRequest:
        return PageRequest(limit=self.limit, cursor=self.cursor)


class Page[T](BaseModel):
    items: list[T]
    next_cursor: str | None

    @staticmethod
    def build[M: BaseModel](result: PageResult[Any], item_model: type[M]) -> "Page[M]":
        return Page[item_model](
            items=[item_model.model_validate(item) for item in result.items],
            next_cursor=result.next_cursor,
        )
