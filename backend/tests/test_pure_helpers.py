import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.repositories.chat import direct_key
from app.repositories.circles import invite_is_usable
from app.repositories.pair_stats import ordered_pair
from app.routes.coordinator.route import _parse_bbox


def test_direct_key_is_symmetric():
    a, b = uuid.uuid4(), uuid.uuid4()
    assert direct_key(a, b) == direct_key(b, a)


def test_ordered_pair_is_sorted():
    a, b = uuid.uuid4(), uuid.uuid4()
    low, high = ordered_pair(a, b)
    assert str(low) < str(high)
    assert ordered_pair(a, b) == ordered_pair(b, a)


def _invite(**kw):
    base = {"revoked_at": None, "expires_at": None, "max_uses": None, "use_count": 0}
    base.update(kw)
    return SimpleNamespace(**base)


def test_invite_usable_when_open():
    assert invite_is_usable(_invite(), datetime.now(UTC)) is True


def test_invite_revoked_is_unusable():
    assert (
        invite_is_usable(_invite(revoked_at=datetime.now(UTC)), datetime.now(UTC))
        is False
    )


def test_invite_expired_is_unusable():
    past = datetime.now(UTC) - timedelta(hours=1)
    assert invite_is_usable(_invite(expires_at=past), datetime.now(UTC)) is False


def test_invite_max_uses_reached_is_unusable():
    assert (
        invite_is_usable(_invite(max_uses=5, use_count=5), datetime.now(UTC)) is False
    )


def test_bbox_parse_valid():
    assert _parse_bbox("1,2,3,4") == (1.0, 2.0, 3.0, 4.0)


@pytest.mark.parametrize("raw", ["1,2,3", "a,b,c,d", "200,2,3,4", "3,2,1,4"])
def test_bbox_parse_invalid(raw):
    with pytest.raises(HTTPException):
        _parse_bbox(raw)
