import io

import pytest
from PIL import Image

from app.services.media.processing import (
    ImageDecodeError,
    process_image,
)


def _png_bytes(size: tuple[int, int] = (2000, 1200)) -> bytes:
    image = Image.new("RGB", size, (120, 80, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_process_image_produces_webp_variants():
    result = process_image(_png_bytes())
    variants = {v.variant: v for v in result.variants}
    assert set(variants) == {"display", "thumb"}
    assert all(v.mime_type == "image/webp" for v in result.variants)
    assert len(result.sha256) == 64
    assert variants["display"].width <= 1600
    assert variants["thumb"].width <= 400
    assert variants["display"].byte_size > 0


def test_process_image_strips_to_within_bounds():
    result = process_image(_png_bytes((100, 100)))
    thumb = next(v for v in result.variants if v.variant == "thumb")
    assert thumb.width == 100 and thumb.height == 100


def test_process_image_rejects_non_image():
    with pytest.raises(ImageDecodeError):
        process_image(b"this is definitely not an image")
