import hashlib
import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from app.database.models.enums import MediaVariantName, StoredMimeType

Image.MAX_IMAGE_PIXELS = 40_000_000

DISPLAY_MAX_EDGE = 1600
THUMB_MAX_EDGE = 400
WEBP_QUALITY = 82
ALLOWED_INPUT_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "HEIF", "HEIC"})


class ImageDecodeError(Exception):
    pass


@dataclass(frozen=True)
class ProcessedVariant:
    variant: str
    content: bytes
    mime_type: str
    width: int
    height: int
    byte_size: int


@dataclass(frozen=True)
class ProcessedImage:
    width: int
    height: int
    sha256: str
    variants: list[ProcessedVariant]


def _encode_webp(image: Image.Image, max_edge: int, variant: str) -> ProcessedVariant:
    resized = image.copy()
    resized.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    resized.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
    content = buffer.getvalue()
    return ProcessedVariant(
        variant=variant,
        content=content,
        mime_type=StoredMimeType.WEBP.value,
        width=resized.width,
        height=resized.height,
        byte_size=len(content),
    )


def process_image(content: bytes) -> ProcessedImage:
    sha256 = hashlib.sha256(content).hexdigest()
    try:
        with Image.open(io.BytesIO(content)) as opened:
            if opened.format not in ALLOWED_INPUT_FORMATS:
                raise ImageDecodeError("Upload a JPEG, PNG, WebP or HEIC image.")
            oriented = ImageOps.exif_transpose(opened)
            flattened = oriented.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ImageDecodeError("The image could not be read.") from error
    display = _encode_webp(flattened, DISPLAY_MAX_EDGE, MediaVariantName.DISPLAY.value)
    thumb = _encode_webp(flattened, THUMB_MAX_EDGE, MediaVariantName.THUMB.value)
    return ProcessedImage(
        width=flattened.width,
        height=flattened.height,
        sha256=sha256,
        variants=[display, thumb],
    )
