import uuid
from datetime import UTC, datetime

import pytest

from app.database.models import HelpRequest
from app.repositories.pagination import (
    InvalidCursorError,
    decode_cursor,
    encode_cursor,
    key_name,
)

KEYS = (HelpRequest.created_at, HelpRequest.id)
NAME = key_name(KEYS, descending=True)


def test_cursor_roundtrip():
    when = datetime(2026, 11, 23, 10, 0, 0, tzinfo=UTC)
    ident = uuid.uuid4()
    cursor = encode_cursor([when, ident], NAME)
    values = decode_cursor(cursor, KEYS, NAME)
    assert values[0] == when
    assert values[1] == ident


def test_cursor_rejects_wrong_sort_name():
    cursor = encode_cursor([datetime.now(UTC), uuid.uuid4()], "created_at,id:asc")
    with pytest.raises(InvalidCursorError):
        decode_cursor(cursor, KEYS, NAME)


def test_cursor_rejects_malformed_base64():
    with pytest.raises(InvalidCursorError):
        decode_cursor("!!!not-base64!!!", KEYS, NAME)


def test_cursor_rejects_wrong_value_count():
    cursor = encode_cursor([datetime.now(UTC)], NAME)
    with pytest.raises(InvalidCursorError):
        decode_cursor(cursor, KEYS, NAME)


def test_cursor_rejects_bad_uuid():
    payload = encode_cursor([datetime.now(UTC), "not-a-uuid"], NAME)
    with pytest.raises(InvalidCursorError):
        decode_cursor(payload, KEYS, NAME)
