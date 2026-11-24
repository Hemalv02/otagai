from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Self

from aiobotocore.config import AioConfig
from aiobotocore.session import get_session
from botocore.exceptions import BotoCoreError, ClientError

from app.services.errors import ServiceConfigurationError, ServiceError
from app.settings import Settings


class StorageError(ServiceError):
    pass


class ObjectNotFoundError(StorageError):
    pass


class Storage:
    def __init__(self, client: Any, bucket: str, region: str) -> None:
        self._client = client
        self._bucket = bucket
        self._region = region

    @classmethod
    @asynccontextmanager
    async def open(cls, settings: Settings) -> AsyncIterator[Self]:
        if not settings.s3_bucket:
            raise ServiceConfigurationError("Configure S3_BUCKET.")

        credentials = {}
        if settings.s3_access_key and settings.s3_secret_key:
            credentials = {
                "aws_access_key_id": settings.s3_access_key.get_secret_value(),
                "aws_secret_access_key": settings.s3_secret_key.get_secret_value(),
            }

        async with get_session().create_client(
            "s3",
            endpoint_url=str(settings.s3_endpoint_url)
            if settings.s3_endpoint_url
            else None,
            region_name=settings.s3_region,
            config=AioConfig(
                s3={"addressing_style": "path"} if settings.s3_endpoint_url else None,
                connect_timeout=3,
                read_timeout=10,
                retries={"mode": "standard", "total_max_attempts": 3},
            ),
            **credentials,
        ) as client:
            yield cls(client, settings.s3_bucket, settings.s3_region)

    async def check(self) -> None:
        try:
            await self._client.head_bucket(Bucket=self._bucket)
        except (BotoCoreError, ClientError) as error:
            raise StorageError("The storage bucket is unavailable.") from error

    async def ensure_bucket(self) -> None:
        try:
            await self._client.head_bucket(Bucket=self._bucket)
            return
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
                raise StorageError("The storage bucket is unavailable.") from error
        except BotoCoreError as error:
            raise StorageError("The storage bucket is unavailable.") from error

        options = {}
        if self._region != "us-east-1":
            options["CreateBucketConfiguration"] = {"LocationConstraint": self._region}
        try:
            await self._client.create_bucket(Bucket=self._bucket, **options)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "BucketAlreadyOwnedByYou":
                raise StorageError(
                    "Could not initialize the storage bucket."
                ) from error
        except BotoCoreError as error:
            raise StorageError("Could not initialize the storage bucket.") from error

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        self._validate_key(key)
        try:
            await self._client.put_object(
                Bucket=self._bucket, Key=key, Body=content, ContentType=content_type
            )
        except (BotoCoreError, ClientError) as error:
            raise StorageError("Could not upload the object.") from error

    async def download(self, key: str, *, max_bytes: int = 10 * 1024 * 1024) -> bytes:
        self._validate_key(key)
        if max_bytes < 1:
            raise ValueError("Set a positive object size limit.")
        try:
            response = await self._client.get_object(Bucket=self._bucket, Key=key)
            async with response["Body"] as body:
                if response["ContentLength"] > max_bytes:
                    raise StorageError("The object exceeds the allowed size.")
                content = bytearray()
                while chunk := await body.read(
                    min(64 * 1024, max_bytes + 1 - len(content))
                ):
                    content.extend(chunk)
                    if len(content) > max_bytes:
                        raise StorageError("The object exceeds the allowed size.")
                if len(content) != response["ContentLength"]:
                    raise StorageError("The object download was incomplete.")
                return bytes(content)
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
                raise ObjectNotFoundError("The object does not exist.") from error
            raise StorageError("Could not download the object.") from error
        except BotoCoreError as error:
            raise StorageError("Could not download the object.") from error

    async def delete(self, key: str) -> None:
        self._validate_key(key)
        try:
            await self._client.delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError) as error:
            raise StorageError("Could not delete the object.") from error

    async def presigned_get_url(self, key: str, *, expires_in: int = 900) -> str:
        self._validate_key(key)
        if not 1 <= expires_in <= 7 * 24 * 60 * 60:
            raise ValueError("Use a presigned URL lifetime of up to seven days.")
        try:
            return await self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except (BotoCoreError, ClientError) as error:
            raise StorageError("Could not sign the object URL.") from error

    @staticmethod
    def _validate_key(key: str) -> None:
        if "\\" in key or any(part in ("", ".", "..") for part in key.split("/")):
            raise StorageError("Use a relative storage object key.")
