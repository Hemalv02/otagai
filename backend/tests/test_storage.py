import pytest

from app.services.storage.service import Storage, StorageError


class ChunkedBody:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def read(self, size):
        return next(self.chunks, b"")


class ChunkedClient:
    def __init__(self, parts, content_length):
        self.body = ChunkedBody()
        self.body.chunks = iter(parts)
        self.content_length = content_length

    async def get_object(self, **kwargs):
        return {"Body": self.body, "ContentLength": self.content_length}


@pytest.mark.asyncio
async def test_download_consumes_short_reads_until_eof():
    storage = Storage(ChunkedClient([b"abc", b"de", b"f"], 6), "bucket", "region")
    assert await storage.download("media/photo", max_bytes=6) == b"abcdef"


@pytest.mark.asyncio
async def test_download_enforces_cap_during_streaming():
    storage = Storage(ChunkedClient([b"abc", b"def"], 5), "bucket", "region")
    with pytest.raises(StorageError, match="exceeds"):
        await storage.download("media/photo", max_bytes=5)
