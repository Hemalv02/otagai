import pytest

from app.services.storage.service import Storage, StorageError


class ChunkedBody:
    def __init__(self, content: bytes, chunk: int):
        self._content = content
        self._chunk = chunk
        self._offset = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def read(self, amt=None):
        size = min(self._chunk, amt) if amt else self._chunk
        data = self._content[self._offset : self._offset + size]
        self._offset += len(data)
        return data


class StubClient:
    def __init__(self, content: bytes, chunk: int, length: int | None = None):
        self._content = content
        self._chunk = chunk
        self._length = len(content) if length is None else length

    async def get_object(self, Bucket, Key):
        return {
            "Body": ChunkedBody(self._content, self._chunk),
            "ContentLength": self._length,
        }


async def test_download_returns_the_whole_object_across_short_reads():
    content = bytes(range(256)) * 40
    storage = Storage(StubClient(content, chunk=700), "bucket", "us-east-1")
    assert await storage.download("a/b.webp", max_bytes=20000) == content


async def test_download_rejects_an_object_over_the_limit():
    storage = Storage(StubClient(b"x" * 5000, chunk=700, length=100), "bucket", "r")
    with pytest.raises(StorageError):
        await storage.download("a/b.webp", max_bytes=1000)


async def test_download_rejects_a_truncated_object():
    storage = Storage(StubClient(b"x" * 500, chunk=100, length=800), "bucket", "r")
    with pytest.raises(StorageError):
        await storage.download("a/b.webp", max_bytes=2000)
