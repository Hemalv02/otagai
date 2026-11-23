import base64
import binascii
import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.services.errors import BadRequestError

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50
MAX_CURSOR_LENGTH = 512


class InvalidCursorError(BadRequestError):
    def __init__(self) -> None:
        super().__init__("The page cursor is invalid. Start again from the first page.")


@dataclass(frozen=True)
class PageRequest:
    limit: int = DEFAULT_PAGE_SIZE
    cursor: str | None = None


@dataclass(frozen=True)
class PageResult[T]:
    items: list[T]
    next_cursor: str | None


def parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("Cursor timestamps need an offset.")
    return parsed


PARSERS: dict[type, Callable[[str], Any]] = {
    datetime: parse_datetime,
    uuid.UUID: uuid.UUID,
    int: int,
    str: str,
}


def key_name(keys: tuple[InstrumentedAttribute[Any], ...], descending: bool) -> str:
    direction = "desc" if descending else "asc"
    return ",".join(key.key for key in keys) + f":{direction}"


def encode_cursor(values: list[Any], name: str) -> str:
    text_values = [
        value.isoformat() if isinstance(value, datetime) else str(value)
        for value in values
    ]
    payload = json.dumps({"k": name, "v": text_values}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(
    cursor: str, keys: tuple[InstrumentedAttribute[Any], ...], name: str
) -> list[Any]:
    if len(cursor) > MAX_CURSOR_LENGTH:
        raise InvalidCursorError
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
    except (binascii.Error, UnicodeDecodeError, ValueError) as error:
        raise InvalidCursorError from error
    if not isinstance(payload, dict) or payload.get("k") != name:
        raise InvalidCursorError
    raw_values = payload.get("v")
    if not isinstance(raw_values, list) or len(raw_values) != len(keys):
        raise InvalidCursorError
    values = []
    for key, raw in zip(keys, raw_values, strict=True):
        parser = PARSERS.get(key.type.python_type)
        if parser is None or not isinstance(raw, str):
            raise InvalidCursorError
        try:
            values.append(parser(raw))
        except ValueError as error:
            raise InvalidCursorError from error
    return values


async def paginate[T](
    session: AsyncSession,
    statement: Select[tuple[T]],
    page: PageRequest,
    *keys: InstrumentedAttribute[Any],
    descending: bool = True,
) -> PageResult[T]:
    if not keys:
        raise ValueError("Pass at least one sort key, ending with a unique one.")
    limit = min(max(page.limit, 1), MAX_PAGE_SIZE)
    name = key_name(keys, descending)
    if page.cursor is not None:
        position = tuple_(*decode_cursor(page.cursor, keys, name))
        row = tuple_(*keys)
        statement = statement.where(row < position if descending else row > position)
    order = [key.desc() if descending else key.asc() for key in keys]
    result = await session.scalars(statement.order_by(*order).limit(limit + 1))
    items = list(result)
    if len(items) <= limit:
        return PageResult(items=items, next_cursor=None)
    items = items[:limit]
    last = items[-1]
    next_cursor = encode_cursor([getattr(last, key.key) for key in keys], name)
    return PageResult(items=items, next_cursor=next_cursor)
