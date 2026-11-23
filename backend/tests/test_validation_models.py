import uuid

import pytest
from pydantic import ValidationError

from app.routes.listings.route import CreateListingBody
from app.routes.requests.route import CreateRequestBody
from app.routes.users.route import CreateProfileBody


def test_profile_rejects_unknown_field():
    with pytest.raises(ValidationError):
        CreateProfileBody(
            display_name="Aki",
            preferred_language="ja",
            region="jp",
            surprise="nope",
        )


def test_profile_rejects_bad_enum():
    with pytest.raises(ValidationError):
        CreateProfileBody(display_name="Aki", preferred_language="martian", region="jp")


def test_profile_rejects_blank_name():
    with pytest.raises(ValidationError):
        CreateProfileBody(display_name="  ", preferred_language="ja", region="jp")


def test_listing_requires_lang_and_title():
    with pytest.raises(ValidationError):
        CreateListingBody(kind="tool", category_id=uuid.uuid4(), title="Drill")


def test_listing_caps_media_count():
    with pytest.raises(ValidationError):
        CreateListingBody(
            kind="tool",
            category_id=uuid.uuid4(),
            title="Drill",
            lang="ja",
            media_ids=[uuid.uuid4() for _ in range(9)],
        )


def test_request_direct_ripple_requires_target():
    with pytest.raises(ValidationError):
        CreateRequestBody(
            kind="help", raw_text="help please", lang="ja", ripple_max_stage="direct"
        )


def test_request_rejects_reversed_time_window():
    with pytest.raises(ValidationError):
        CreateRequestBody(
            kind="help",
            raw_text="help please",
            lang="ja",
            needed_from="2026-11-23T12:00:00Z",
            needed_until="2026-11-23T10:00:00Z",
        )


def test_request_accepts_minimal_valid_body():
    body = CreateRequestBody(kind="help", raw_text="help please", lang="ja")
    assert body.tone.value == "polite"
    assert body.ripple_max_stage.value == "han"
